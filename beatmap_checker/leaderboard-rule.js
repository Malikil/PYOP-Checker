const helpers = require('../helpers/helpers');
const Rule = require('./rule');
const { ApiBeatmap } = require('../types');

class LeaderboardRule extends Rule {
    constructor(scoreCount) {
        super();
        this.count = scoreCount;
    }

    /**
     * @param {ApiBeatmap} beatmap 
     */
    async check(beatmap) {
        let result = {
            passed: false,
            limit: this.count,
            actual: 0
        };

        // Leaderboard statuses are above 0, wip statuses are below or equal
        if (beatmap.approved > 0)
        {
            let leaderboard = await helpers.getLeaderboard(beatmap.beatmap_id, beatmap.mods);
            result.actual = leaderboard.length;
            result.passed = leaderboard.length >= this.count;
        }

        return result;
    }

    userMessage(value) {
        return `There are only ${value} out of ${this.count} required scores on the leaderbaord`;
    }
}

module.exports = LeaderboardRule;
