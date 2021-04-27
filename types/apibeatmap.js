const fetch = require('node-fetch');
const DbBeatmap = require('./dbbeatmap');
const MODS = require('../helpers/bitwise');
const OSUKEY = process.env.OSUKEY;

class ApiBeatmap {
    constructor(map, mods = 0) {
        // This should always be a proper map object, as returned by the osu api.
        // As such, everything is a string and needs to be converted

        // Technical identification
        this.beatmapset_id = parseInt(map.beatmapset_id);
        this.beatmap_id = parseInt(map.beatmap_id);
        this.creator_id = parseInt(map.creator_id);
        this.file_md5 = map.file_md5;
        this.tags = map.tags.split(" ");
        this.genre_id = parseInt(map.genre_id);
        this.language_id = parseInt(map.language_id);

        // Readable identification
        this.artist = map.artist;
        this.title = map.title;
        this.version = map.version;
        this.creator = map.creator;
        this.artist_unicode = map.artist_unicode;
        this.title_unicode = map.title_unicode;
        this.source = map.source;

        // Approval/submitted status
        this.approved = parseInt(map.approved);
        this.submit_date = new Date(map.submit_date.replace(" ", "T") + "Z");
        this.approved_date = null;
        if (map.approved_date)
            this.approved_date = new Date(map.approved_date.replace(" ", "T") + "Z");
        this.last_update = new Date(map.last_update.replace(" ", "T") + "Z");;
        
        // Difficulty/length
        this.total_length = parseInt(map.total_length);
        this.hit_length = parseInt(map.hit_length);
        this.diff_size = parseFloat(map.diff_size);
        this.diff_overall = parseFloat(map.diff_overall);
        this.diff_approach = parseFloat(map.diff_approach);
        this.diff_drain = parseFloat(map.diff_drain);
        this.diff_aim = parseFloat(map.diff_aim);
        this.diff_speed = parseFloat(map.diff_speed);
        this.difficultyrating = parseFloat(map.difficultyrating);

        // Misc meta
        this.bpm = parseFloat(map.bpm);
        this.mode = parseInt(map.mode);
        this.count_normal = parseInt(map.count_normal);
        this.count_slider = parseInt(map.count_slider);
        this.count_spinner = parseInt(map.count_spinner);
        this.favourite_count = parseInt(map.favourite_count);
        this.rating = parseFloat(map.rating);
        this.storyboard = !!parseInt(map.storyboard);
        this.video = !!parseInt(map.video);
        this.download_unavailable = !!parseInt(map.download_unavailable);
        this.audio_unavailable = !!parseInt(map.audio_unavailable);
        this.playcount = parseInt(map.playcount);
        this.passcount = parseInt(map.passcount);
        this.max_combo = parseInt(map.max_combo);

        // Ignored
        // - packs

        // If mods were used, update required values
        this.mods = mods;
        if (mods & MODS.DT)
        {
            this.total_length = (this.total_length * (2.0 / 3.0)) | 0;
            this.hit_length = (this.hit_length * (2.0 / 3.0)) | 0;
            this.bpm = parseFloat((this.bpm * (3.0 / 2.0)).toFixed(3));
        }
        else if (mods & MODS.HT)
        {
            this.total_length = (this.total_length * (4.0 / 3.0)) | 0;
            this.hit_length = (this.hit_length * (4.0 / 3.0)) | 0;
            this.bpm = parseFloat((this.bpm * (3.0 / 4.0)).toFixed(3));
        }

        if (mods & MODS.HR)
        {
            this.diff_approach *= 1.4;
            this.diff_drain *= 1.4;
            this.diff_overall *= 1.4;
            this.diff_size *= 1.3;
        }
        else if (mods & MODS.EZ)
        {
            this.diff_approach /= 2;
            this.diff_drain /= 2;
            this.diff_overall /= 2;
            this.diff_size /= 2;
        }
    }

    static async buildFromApi(mapid, mods = 0) {
        let beatmap = await fetch(`https://osu.ppy.sh/api/get_beatmaps?k=${OSUKEY}&b=${mapid}&mods=${mods & MODS.DIFFMODS}`)
            .then(res => res.json())
            .then(data => data[0]);
        if (beatmap)
            return new ApiBeatmap(beatmap, mods);
        // Undefined if the beatmap doesn't exist
    }

    /**
     * @param {string} status 
     */
    toDbBeatmap(status) {
        let obj = new DbBeatmap({
            bid: this.beatmap_id,
            drain: this.hit_length,
            stars: parseFloat(this.difficultyrating.toFixed(2)),
            bpm: this.bpm,
            artist: this.artist,
            title: this.title,
            version: this.version,
            creator: this.creator,
            mods: this.mods,
            status
        });
        return obj;
    }
}

module.exports = ApiBeatmap;
