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
     * @param {string[]?} o.passes
     */
    constructor({
        bid, status, drain, stars, bpm, artist, title, version, creator, mods, pool, passes
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
        if (passes)
            this.passes = passes; // Doesn't create a copy, can use [...passes] if a copy is needed
    }
}
