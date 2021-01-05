const helpers = require('../helpers');
const Rules = {
    StarRatingRule: require('./star-rule'),
    DrainTimeRule: require('./drain-rule'),
    TotalTimeRule: require('./time-rule'),
    LeaderboardRule: require('./leaderboard-rule')
};

const drainBuffer = parseInt(process.env.DRAIN_BUFFER);    // How much time can drain be outside the limits
const overUnderMax = parseInt(process.env.OVER_UNDER_MAX); // Number of maps allowed outside time range
const minTotal = parseInt(process.env.MIN_TOTAL);          // Pool drain limit, per map
const maxTotal = parseInt(process.env.MAX_TOTAL);          // Pool drain limit, per map

class Checker {
    /**
     * @param {{
     *  ruleType: *,
     *  restrictType: *
     *  limit: number
     * }[]} rules 
     */
    constructor(rules) {
        this.rules = rules.map(r => new Rules[r.ruleType](r.limit, r.restrictType));
    }

    async check(beatmap) {
        let checkResult = {
            passing: true,
            message: "This map can be accepted automatically"
        };

        for (let i = 0; checkResult.passing && i < this.rules.length; i++)
        {
            let result = await this.rules[i].check(beatmap);
            if (!result.passed)
            {
                // Special cases for rules
                // Leaderboard isn't an automatic rejection
                // Drain time has a buffer
                if (rules[i] instanceof Rules.LeaderboardRule)
                    checkResult.message = "There aren't enough scores on the leaderboard to automatically approve this map";
                else if (rules[i] instanceof Rules.DrainTimeRule)
                {
                    if (Math.abs(result.limit - result.actual) > drainBuffer)
                    {
                        checkResult.passing = false;
                        checkResult.message = rules[i].userMessage(result.actual);
                    }
                }
                else
                {
                    checkResult.passing = false;
                    checkResult.message = rules[i].userMessage(result.actual);
                }
            }
        }

        return checkResult;
    }

    async checkPool(beatmaps) {
        // Ignore map-specific checks, just aggregate everything
        let checkResult = await beatmaps.reduce(async (previous, map) => {
            let agg = await previous;
            // Find the total drain time
            agg.total += map.hit_length;
            // Count how many maps use the drain buffer
            let drainRules = this.rules.filter(r => r instanceof Rules.DrainTimeRule);
            for (let i = 0; i < drainRules.length; i++)
            {
                let result = await drainRules[i].check(map);
                if (!result.passed && Math.abs(result.limit - result.actual) <= drainBuffer)
                    agg.overUnder++;
            }

            return agg;
        }, Promise.resolve({ total: 0, overUnder: 0 }));

        let messages = [];
        // Verify length limit
        if (checkResult.total < minTotal * beatmaps.length)
            messages.push(`Total combined drain time is too short (${
                helpers.convertSeconds(agg.total)
            } vs ${beatmaps.length} x ${helpers.convertSeconds(minTotal)} -> ${
                helpers.convertSeconds(minTotal * beatmaps.length)
            })`);
        else if (checkResult.total > maxTotal * beatmaps.length)
            messages.push(`Total combined drain time is too long (${
                helpers.convertSeconds(agg.total)
            } vs ${beatmaps.length} x ${helpers.convertSeconds(maxTotal)} -> ${
                helpers.convertSeconds(maxTotal * beatmaps.length)
            })`);
        // Beatmaps using drain buffer
        if (agg.overUnder > overUnderMax)
            messages.push(`More than ${overUnderMax} maps are outside the drain time limits`);

        return messages;
    }
}

module.exports = Checker;