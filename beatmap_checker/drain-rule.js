const helpers = require('../helpers');
const Rule = require('./rule');
const { ApiBeatmap } = require('../types');

class DrainTimeRule extends Rule {
    constructor(drain, checkType) {
        super();
        this.drain = drain;
        this.checkType = checkType;
    }

    /**
     * @param {ApiBeatmap} beatmap 
     */
    async check(beatmap) {
        let result = {
            passed: false,
            limit: this.drain,
            actual: beatmap.hit_length
        };

        if (this.checkType === Rule.MAX)
            result.passed = beatmap.hit_length <= this.drain;
        else if (this.checkType === Rule.MIN)
            result.passed = beatmap.hit_length >= this.drain;

        return result;
    }

    userMessage(value) {
        return `${helpers.convertSeconds(value)} is ${
            this.checkType === Rule.MAX? "above the maximum" : "below the minimum"
        } allowed drain time of ${helpers.convertSeconds(this.drain)}`;
    }
}

module.exports = DrainTimeRule;
