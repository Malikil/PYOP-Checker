class Score
{
    constructor()
    {
        /** @type {String} */ this.score_id;
        /** @type {String} */ this.score;
        /** @type {String} */ this.username;
        /** @type {String} */ this.count300;
        /** @type {String} */ this.count100;
        /** @type {String} */ this.count50;
        /** @type {String} */ this.countmiss;
        /** @type {String} */ this.maxcombo;
        /** @type {String} */ this.countkatu;
        /** @type {String} */ this.countgeki;
        /** @type {String} */ this.perfect;
        /** @type {String} */ this.enabled_mods;
        /** @type {String} */ this.user_id;
        /** @type {String} */ this.date;
        /** @type {String} */ this.rank;
        /** @type {String} */ this.pp;
        /** @type {String} */ this.replay_available;
    }
}

module.exports = Score;