module.exports = class CheckableMap {
    /**
     * @param {object} o
     * @param {number} o.bid
     * @param {string} o.artist
     * @param {string} o.title
     * @param {string} o.version Difficulty name
     * @param {string} o.creator
     * @param {number} o.drain Integer seconds
     * @param {number} o.stars
     * @param {number} o.bpm
     * @param {number} o.mods
     * @param {{
     *  total_length: number,
     *  ar_delay: number,
     *  objects: {
     *      type: number,
     *      time: number,
     *      end?: number
     *  }[]
     * }} o.data
     */
    constructor({
        bid, artist, title, version, creator, drain, stars, bpm, mods, data
    }) {
        this.bid = bid;
        this.artist = artist;
        this.title = title;
        this.version = version;
        this.creator = creator;
        this.drain = drain;
        this.stars = stars;
        this.bpm = bpm;
        this.mods = mods;
        this.data = data;
    }
}