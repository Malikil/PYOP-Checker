module.exports = class DbBeatmap {
    /**
     * @param {Object} o
     * @param {number} o.bid
     * @param {string} o.status
     * @param {number} o.drain
     * @param {number} o.stars
     * @param {number} o.bpm
     * @param {string} o.artist
     * @param {string} o.title
     * @param {string} o.version
     * @param {string} o.creator
     * @param {number} o.mods
     * @param {"nm"|"hd"|"hr"|"dt"|"cm"} o.pool
     */
    constructor({
        bid, status, drain, stars, bpm, artist, title, version, creator, mods, pool
    }) {
        this.bid = bid;
        this.status = status;
        this.drain = drain;
        this.stars = stars;
        this.bpm = bpm;
        this.artist = artist;
        this.title = title;
        this.version = version;
        this.creator = creator;
        this.mods = mods;
        this.pool = pool;
    }

    toObject() {
        return {
            bid: this.bid,
            status: this.status,
            drain: this.drain,
            stars: this.stars,
            bpm: this.bpm,
            artist: this.artist,
            title: this.title,
            version: this.version,
            creator: this.creator,
            mods: this.mods,
            pool: this.pool
        };
    }
}
