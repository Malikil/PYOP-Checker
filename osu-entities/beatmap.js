class Beatmap
{
    constructor()
    {
        /** @type {String} */ this.approved;
        /** @type {String} */ this.submit_date;
        /** @type {String} */ this.approved_date;
        /** @type {String} */ this.last_update;
        /** @type {String} */ this.artist;
        /** @type {String} */ this.beatmap_id;
        /** @type {String} */ this.beatmapset_id;
        /** @type {String} */ this.bpm;
        /** @type {String} */ this.creator;
        /** @type {String} */ this.creator_id;
        /** @type {String} */ this.difficultyrating;
        /** @type {String} */ this.diff_aim;
        /** @type {String} */ this.diff_speed;
        /** @type {String} */ this.diff_size;
        /** @type {String} */ this.diff_overall;
        /** @type {String} */ this.diff_approach;
        /** @type {String} */ this.diff_drain;
        /** @type {String} */ this.hit_length;
        /** @type {String} */ this.source;
        /** @type {String} */ this.genre_id;
        /** @type {String} */ this.language_id;
        /** @type {String} */ this.title;
        /** @type {String} */ this.total_length;
        /** @type {String} */ this.version;
        /** @type {String} */ this.file_md5;
        /** @type {String} */ this.mode;
        /** @type {String} */ this.tags;
        /** @type {String} */ this.favorite_count;
        /** @type {String} */ this.rating;
        /** @type {String} */ this.playcount;
        /** @type {String} */ this.passcount;
        /** @type {String} */ this.max_combo;
    }
}

module.exports = Beatmap;