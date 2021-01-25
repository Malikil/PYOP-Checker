module.exports = class DbPlayer {
    /**
     * @param {Object} o
     * @param {number} o.osuid
     * @param {string} o.osuname
     * @param {string} o.discordid
     * @param {string?} o.utc
     * @param {boolean?} o.notif True or undefined
     */
    constructor({
        osuid, osuname, discordid, utc, notif
    }) {
        this.osuid = osuid;
        this.osuname = osuname;
        this.discordid = discordid;
        this.utc = utc;
        this.notif = notif;
    }
}
