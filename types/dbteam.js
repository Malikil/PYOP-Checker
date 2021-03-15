const DbPlayer = require('./dbplayer');
const DbBeatmap = require('./dbbeatmap');

module.exports = class DbTeam {
    /**
     * @param {Object} t
     * @param {string} t.teamname
     * @param {string} t.division
     * @param {DbPlayer[]} t.players
     * @param {DbBeatmap[]} t.maps
     * @param {DbBeatmap[]} t.oldmaps
     * @param {boolean?} t.eliminated
     */
    constructor({
        teamname, division, players, maps, oldmaps, eliminated
    }) {
        this.teamname = teamname;
        this.division = division;
        this.players = players.map(p => new DbPlayer(p));
        this.maps = maps.map(m => new DbBeatmap(m));
        this.oldmaps = oldmaps.map(m => new DbBeatmap(m));
        if (eliminated || eliminated === false)
            this.eliminated = eliminated;
    }
}
