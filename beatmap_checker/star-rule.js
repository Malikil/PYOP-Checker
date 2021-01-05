const Rule = require('./rule');
const { ApiBeatmap } = require('../types');

class StarRatingRule extends Rule {
    constructor(rating, checkType) {
        super();
        this.rating = rating;
        this.checkType = checkType;
    }

    /**
     * @param {ApiBeatmap} beatmap 
     */
    async check(beatmap) {
        let result = {
            passed: false,
            limit: this.rating,
            actual: map.difficultyrating
        };

        if (this.checkType === Rule.MAX)
            result.passed = beatmap.difficultyrating <= this.rating;
        else if (this.checkType === Rule.MIN)
            result.passed = beatmap.difficultyrating >= this.rating;

        return result;
    }

    userMessage(value) {
        return `${helpers.convertSeconds(value)} is ${
            this.checkType === Rule.MAX? "above the maximum" : "below the minimum"
        } allowed star rating of ${helpers.convertSeconds(this.rating)}`;
    }
}

module.exports = StarRatingRule;