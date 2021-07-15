import { inspect } from 'util';
import { Rule, RuleConstructor } from './rule';
import { Aggregate, ValueRange } from '../types/rules';
import fs = require('fs');
import { Beatmap } from '../types/bancho';
import { DbBeatmap } from '../types/database';
// Load rules
const Rules: { [type: string]: RuleConstructor } = {}
export const ruleKeys = [];
fs.readdir('./dist/beatmap_checker/rules',
    (_, files) => files.filter(f => f.endsWith('.js'))
        .forEach(ruleFile =>
            import(`./rules/${ruleFile}`)
            .then(rule => {
                Rules[rule.type] = rule.default;
                ruleKeys.push(rule.type);
            })
        )
);

export default class Checker {
    rules: Rule[];
    aggregates: {
        type: string,
        limits: {
            min?: number
            max?: number
        }
    }[];

    constructor(
            rules: { type: string, limit: ValueRange, strict: boolean }[],
            aggregates: Aggregate[]
    ) {
        this.rules = rules.map(r => new Rules[r.type](r.limit, r.strict));
        this.aggregates = aggregates;
    }

    async check(beatmap: Beatmap) {
        console.log("checker.js - Checking map");
        
        const checkResult = {
            passed: true,
            approved: true,
            message: "This map can be accepted automatically"
        };

        for (let i = 0; checkResult.passed && i < this.rules.length; i++)
        {
            const result = await this.rules[i].check(beatmap);
            if (result.result === 'failed')
            {
                console.log(`checker.js - ${this.rules[i].constructor.name} failed: ${inspect(result)}`);
                // If a rule isn't strict we won't approve the map but it can still pass
                checkResult.approved = false;
                checkResult.message = result.message;
                if (this.rules[i].strict)
                    checkResult.passed = false;
            }
        }

        return checkResult;
    }

    async checkPool(beatmaps: DbBeatmap[]) {
        // Ignore map-specific checks, just aggregate everything
        // Cheating a little bit here, checking the pool will only be done with DbBeatmaps
        // But I don't want to make the change in the db so its keys line up with the osu api
        const seenMaps = [];
        const duplicates = [];
        const checkResult = await beatmaps.reduce(async (previous, map) => {
            let aggPrev = await previous;
            // Check for duplicates
            if (seenMaps.includes(map.bid))
                duplicates.push(map);
            else
                seenMaps.push(map.bid);

            // Get values from each rule
            await Promise.all(this.rules.map(async rule => {
                const result = await rule.check(map);
                // Check for maps in the buffer zone
                if (result.result === 'buffer')
                    aggPrev.buffer[rule.ruleType()] = (aggPrev.buffer[rule.ruleType()] || 0) + 1;
                
                // Update aggregated values if needed
                if (this.aggregates.find(agg => agg.type === rule.ruleType()))
                    aggPrev.aggregate[rule.ruleType()] = (aggPrev.aggregate[rule.ruleType()] || 0) + 1;
            }));

            return aggPrev;
        }, Promise.resolve({
            buffer: <{ [type: string]: number }>{},
            aggregate: <{ [type: string]: number }>{}
        }));

        // Prepare output messages for aggregate results
        const messages: string[] = [];
        this.aggregates.forEach(agg => {
            const aggResult = checkResult.aggregate[agg.type];
            if (agg.limits.min !== undefined && aggResult < agg.limits.min)
                messages.push(`${agg.type}: Total value too low (${aggResult} vs ${agg.limits.min})`);
            else if (agg.limits.max !== undefined && aggResult > agg.limits.max)
                messages.push(`${agg.type}: Total value too high (${aggResult} vs ${agg.limits.max})`);
        });

        // Display how many maps are in buffer zones
        this.rules.forEach(rule => {
            if (checkResult.buffer[rule.ruleType()] > rule.range.bufferCount)
                messages.push(
                    `${rule.ruleType()}: More than ${rule.range.bufferCount
                    } maps are within the buffer zone (${checkResult.buffer[rule.ruleType()]})`
                );
        });

        return {
            messages,
            duplicates
        };
    }
}
