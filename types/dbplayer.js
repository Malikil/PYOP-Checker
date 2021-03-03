module.exports = class DbPlayer {
    /**
     * @param {Object} o
     * @param {number} o.osuid
     * @param {string} o.osuname
     * @param {string} o.discordid
     * @param {string?} o.utc
     * @param {boolean?} o.notify True or undefined
     */
    constructor({
        osuid, osuname, discordid, utc, notify
    }) {
        this.osuid = osuid;
        this.osuname = osuname;
        this.discordid = discordid;
        this.utc = utc;
        if (notify)
            this.notify = notify;
    }
}
