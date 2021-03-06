const Rule = require('./rule');
const { ApiBeatmap } = require('../types');

class TotalTimeRule extends Rule {
    constructor(length, checkType) {
        super();
        this.length = length;
        this.checkType = checkType;
    }

    /**
     * @param {ApiBeatmap} beatmap 
     */
    async check(beatmap) {
        let result = {
            passed: false,
            limit: this.length,
            actual: beatmap.total_length
        };

        if (this.checkType === Rule.MAX)
            result.passed = beatmap.total_length <= this.length;
        else if (this.checkType === Rule.MIN)
            result.passed = beatmap.total_length >= this.length;

        return result;
    }

    userMessage(value) {
        return `${helpers.convertSeconds(value)} is ${
            this.checkType === Rule.MAX? "above the maximum" : "below the minimum"
        } allowed total length of ${helpers.convertSeconds(this.length)}`;
    }
}

module.exports = TotalTimeRule;
