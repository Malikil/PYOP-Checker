const { Checker, Rule } = require('./beatmap_checker');
const divInfo = require('../divisions.json');
const { currentWeek } = require('./helpers/helpers').default;

/** @type {Object<string, import('./beatmap_checker/checker')>} */
const checkers = {};
refreshCheckers();

// Create map checkers
function refreshCheckers() {
    divInfo.forEach(div => {
        // Create rules initialization array
        let init = [];
        // There are four types of rules
        // 1. Star rating
        let sr = currentWeek(div.starlimits);
        init.push({ ruleType: Rule.STAR_RATING_RULE, restrictType: Rule.MIN, limit: sr.low });
        init.push({ ruleType: Rule.STAR_RATING_RULE, restrictType: Rule.MAX, limit: sr.high });
        // 2. Drain time
        let drain = currentWeek(div.drainlimits);
        init.push({ ruleType: Rule.DRAIN_TIME_RULE, restrictType: Rule.MIN, limit: drain.low });
        init.push({ ruleType: Rule.DRAIN_TIME_RULE, restrictType: Rule.MAX, limit: drain.high });
        // 3. Max total time
        init.push({ ruleType: Rule.TOTAL_TIME_RULE, restrictType: Rule.MAX, limit: currentWeek(div.lengthlimits).high });
        // 4. Leaderboard limit
        init.push({ ruleType: Rule.LEADERBOARD_RULE, restrictType: Rule.MIN, limit: currentWeek(div.leaderboardlimits).low });
        
        checkers[div.division] = new Checker(init);
    });
}

module.exports = {
    checkers,
    refreshCheckers
};