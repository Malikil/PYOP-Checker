const Rule = require('./rule');

class StarRatingRule extends Rule {
    constructor(rating, checkType) {
        super();
        this.rating = rating;
        this.checkType = checkType;
    }

    /**
     * @param {import('../types/apibeatmap')} beatmap 
     */
    async check(beatmap) {
        let result = {
            passed: false,
            limit: this.rating,
            actual: parseFloat(beatmap.difficultyrating.toFixed(2))
        };

        if (this.checkType === Rule.MAX)
            result.passed = result.actual <= this.rating;
        else if (this.checkType === Rule.MIN)
            result.passed = result.actual >= this.rating;

        return result;
    }

    userMessage(value) {
        return `${value.toFixed(2)} stars is ${
            this.checkType === Rule.MAX? "above the maximum" : "below the minimum"
        } allowed star rating of ${this.rating.toFixed(2)}`;
    }
}

module.exports = StarRatingRule;