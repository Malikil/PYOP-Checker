const DbPlayer = require('./dbplayer');
const DbBeatmap = require('./dbbeatmap');

module.exports = class DbTeam {
    /**
     * @param {Object} t
     * @param {string} t.teamname
     * @param {string} t.division
     * @param {DbPlayer[]} t.players
     * @param {DbBeatmap[]} t.maps
     * @param {number[]} t.oldmaps
     */
    constructor({
        teamname, division, players, maps, oldmaps
    }) {
        this.teamname = teamname;
        this.division = division;
        this.players = players.map(p => new DbPlayer(p));
        this.maps = maps.map(m => new DbBeatmap(m));
        this.oldmaps = oldmaps; // Doesn't create a copy. Can use [...oldmaps] if a copy is needed
    }
}
