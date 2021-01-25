const helpers = require('./../helpers/helpers.js');
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
        console.log("checker.js:27 - Checking map");
        console.log(beatmap);
        
        let checkResult = {
            passed: true,
            approved: true,
            message: "This map can be accepted automatically"
        };

        for (let i = 0; checkResult.passed && i < this.rules.length; i++)
        {
            let result = await this.rules[i].check(beatmap);
            if (!result.passed)
            {
                // Special rejection cases
                if (this.rules[i] instanceof Rules.LeaderboardRule)
                { // Leaderboard isn't an automatic rejection
                    checkResult.passed = true;
                    checkResult.message = "There aren't enough scores on the leaderboard to automatically approve this map";
                    checkResult.screenshotNeeded = true
                }
                else if (this.rules[i] instanceof Rules.DrainTimeRule)
                { // Drain time has a buffer
                    if (Math.abs(result.limit - result.actual) > drainBuffer)
                        checkResult = {
                            passed: false,
                            approved: false,
                            message: this.rules[i].userMessage(result.actual)
                        };
                }
                else
                    checkResult = {
                        passed: false,
                        approved: false,
                        message: this.rules[i].userMessage(result.actual)
                    };
            }
        }

        return checkResult;
    }

    async checkPool(beatmaps) {
        // Ignore map-specific checks, just aggregate everything
        // Cheating a little bit here, checking the pool will only be done with DbBeatmaps
        // But I don't want to make the change in the db so its keys line up with the osu api
        let found = [];
        let duplicates = [];
        let checkResult = await beatmaps.reduce(async (previous, map) => {
            let agg = await previous;
            // Check for duplicates
            if (found.includes(map.bid))
                duplicates.push(map);
            else
                found.push(map.bid);
            // Find the total drain time
            agg.total += map.drain;
            // Count how many maps use the drain buffer
            let drainRules = this.rules.filter(r => r instanceof Rules.DrainTimeRule);
            for (let i = 0; i < drainRules.length; i++)
            {
                let result = await drainRules[i].check({ hit_length: map.drain });
                if (!result.passed && Math.abs(result.limit - result.actual) <= drainBuffer)
                    agg.overUnder++;
            }

            return agg;
        }, Promise.resolve({ total: 0, overUnder: 0 }));

        // Verify length limit
        let messages = [];
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
        if (checkResult.overUnder > overUnderMax)
            messages.push(`More than ${overUnderMax} maps are outside the drain time limits`);

        return {
            totalDrain: checkResult.total,
            overUnder: checkResult.overUnder,
            messages,
            duplicates
        };
    }
}

module.exports = Checker;