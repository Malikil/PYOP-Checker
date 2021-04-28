class Rule {
    // Constants for check type
    static get MAX() { return 0; }
    static get MIN() { return 1; }
    // Constants for rule type
    static get STAR_RATING_RULE() { return "StarRatingRule"; }
    static get DRAIN_TIME_RULE() { return "DrainTimeRule"; }
    static get TOTAL_TIME_RULE() { return "TotalTimeRule"; }
    static get LEADERBOARD_RULE() { return "LeaderboardRule"; }

    constructor() {
        // Fake abstract class checks
        if (this.constructor === Rule)
            throw new TypeError('Abstract class "Rule" cannot be instantiated directly.');

        if (this.check === undefined)
            throw new TypeError('Subclasses of Rule must implement method async check(beatmap)');
        if (this.userMessage === undefined)
            throw new TypeError('Subclasses of Rule must implement method userMessage(value)');
    }
}

module.exports = Rule;