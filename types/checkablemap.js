const readline = require('readline');
const ojsama = require('ojsama');
const fetch = require('node-fetch');

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
     *  ar_delay?: number,
     *  objects?: {
     *      type: number,
     *      time: number,
     *      end?: number,
     *      pos?: {x:number, y:number}
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

    /**
     * gets the map file from the server and fills the internal hitobject
     * array with it
     */
    async fillHitObjects() {
        this.data.objects = await new Promise(async resolve => {
            let response = await fetch(`https://osu.ppy.sh/osu/${this.bid}`);
            let parser = new ojsama.parser();
            readline.createInterface({
                input: response.body,
                terminal: false
            })
            .on('line', parser.feed_line.bind(parser))
            .on('close', () => {
                if (parser.map.objects.length < 1)
                    return resolve([]);
                // Convert hit objects
                // Assume timing points are in order
                let timingindex = 0;
                let basems = parser.map.timing_points[0].ms_per_beat;
                let inherited = -100;
                let objects = parser.map.objects.map(hitobject => {
                    let obj = {
                        type: hitobject.type,
                        time: hitobject.time
                    };
                    // If object is a slider
                    if (hitobject.type & (1 << 1))
                    {
                        while (parser.map.timing_points.length > timingindex &&
                                hitobject.time >= parser.map.timing_points[timingindex].time)
                        {
                            // Update ms per beat values
                            if (parser.map.timing_points[timingindex].change)
                            {
                                basems = parser.map.timing_points[timingindex].ms_per_beat;
                                inherited = -100;
                            }
                            else
                                inherited = Math.max(parser.map.timing_points[timingindex].ms_per_beat, -1000);
                            // Increment index
                            timingindex++;
                        }
                        // Calculate the ms per beat
                        let svms = basems / (-100 / inherited);
                        let mslength = hitobject.data.distance / (parser.map.sv * 100) * svms * hitobject.data.repetitions;
                        obj.end = hitobject.time + mslength;
                    }
                    // If the object has extended data, add the position
                    // This should apply to everything except spinners
                    else if (hitobject.data)
                        obj.pos = {
                            x: hitobject.data.pos[0],
                            y: hitobject.data.pos[1]
                        };
                    return obj;
                });

                resolve(objects);
            });
        });
    }
}