const DbBeatmap = require('./dbbeatmap');

module.exports = class DbPlayer {
    /**
     * @param {Object} o
     * @param {number} o.osuid
     * @param {string} o.osuname
     * @param {string} o.discordid
     * @param {"15k"|"open"} o.division
     * @param {string} o.utc
     * @param {DbBeatmap[]|*[]} o.maps
     * @param {boolean} o.unconfirmed
     */
    constructor({
        osuid, osuname, discordid, division, utc, maps, unconfirmed
    }) {
        this.osuid = osuid;
        this.osuname = osuname;
        this.discordid = discordid;
        this.division = division;
        this.utc = utc;
        this.unconfirmed = unconfirmed;
        if (maps[0] instanceof DbBeatmap)
            /** @type {DbBeatmap[]} */
            this.maps = maps;
        else
            this.maps = maps.map(m => new DbBeatmap(m));
    }

    /**
     * @returns {{
     *  osuid: number,
     *  osuname: string,
     *  discordid: string,
     *  division: "15k"|"open",
     *  utc: string,
     *  maps: {
     *      bid: number,
     *      status: string,
     *      drain: number,
     *      stars: number,
     *      bpm: number,
     *      artist: string,
     *      title: string,
     *      version: string,
     *      creator: string,
     *      mods: number,
     *      pool: "nm"|"hd"|"hr"|"dt"|"cm"
     *  }[],
     *  unconfirmed?: boolean
     * }}
     */
    toObject() {
        let obj = {
            osuid: this.osuid,
            osuname: this.osuname,
            discordid: this.discordid,
            division: this.division,
            utc: this.utc,
            maps: this.maps.map(b => b.toObject())
        }
        if (this.unconfirmed)
            obj.unconfirmed = this.unconfirmed;
        
        return obj;
    }
}
