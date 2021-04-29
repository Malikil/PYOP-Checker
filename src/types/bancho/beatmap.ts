import nfetch from 'node-fetch';
import { BanchoBeatmap } from './types';
import Mods from './mods';
import { Mode } from './enums';
import { DbBeatmap, MapStatus } from '../database';
const OSUKEY = process.env.OSUKEY;

export default class Beatmap {
    beatmapset_id: number;
    beatmap_id: number;
    creator_id: number;
    file_md5: string;
    tags: string[];
    genre_id: number;
    language_id: number;
    artist: string;
    title: string;
    version: string;
    creator: string;
    artist_unicode: string;
    title_unicode: string;
    source: string;
    approved: number;
    submit_date: Date;
    approved_date: Date;
    last_update: Date;
    total_length: number;
    hit_length: number;
    diff_size: number;
    diff_overall: number;
    diff_approach: number;
    diff_drain: number;
    diff_aim: number;
    diff_speed: number;
    difficultyrating: number;
    bpm: number;
    mode: Mode;
    count_normal: number;
    count_slider: number;
    count_spinner: number;
    favourite_count: number;
    rating: number;
    storyboard: boolean;
    video: boolean;
    download_unavailable: boolean;
    audio_unavailable: boolean;
    playcount: number;
    passcount: number;
    max_combo: number;
    mods: number;

    constructor(map: BanchoBeatmap, mods = Mods.None) {
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
        if (mods & Mods.DoubleTime)
        {
            this.total_length = (this.total_length * (2.0 / 3.0)) | 0;
            this.hit_length = (this.hit_length * (2.0 / 3.0)) | 0;
            this.bpm = this.bpm * (3.0 / 2.0);
        }
        else if (mods & Mods.HalfTime)
        {
            this.total_length = (this.total_length * (4.0 / 3.0)) | 0;
            this.hit_length = (this.hit_length * (4.0 / 3.0)) | 0;
            this.bpm = this.bpm * (3.0 / 4.0);
        }

        if (mods & Mods.HardRock)
        {
            this.diff_approach *= 1.4;
            this.diff_drain *= 1.4;
            this.diff_overall *= 1.4;
            this.diff_size *= 1.3;
        }
        else if (mods & Mods.Easy)
        {
            this.diff_approach /= 2;
            this.diff_drain /= 2;
            this.diff_overall /= 2;
            this.diff_size /= 2;
        }
    }

    static async buildFromApi(mapid: number, mods = Mods.None) {
        const beatmap = await nfetch(`https://osu.ppy.sh/api/get_beatmaps?k=${OSUKEY}&b=${mapid}&mods=${mods & Mods.DifficultyMods}`)
            .then((res): Promise<BanchoBeatmap[]> => res.json())
            .then(data => data[0]);
        if (beatmap)
            return new Beatmap(beatmap, mods);
        // Undefined if the beatmap doesn't exist
    }

    static async getMapset(mapsetId: number) {
        const maps = await nfetch(`https://osu.ppy.sh/api/get_beatmaps?k=${OSUKEY}&s=${mapsetId}`)
            .then((res): Promise<BanchoBeatmap[]> => res.json());
        return maps.map(m => new Beatmap(m));
    }

    toDbBeatmap(status: MapStatus): DbBeatmap {
        return {
            artist: this.artist,
            bid: this.beatmap_id,
            bpm: parseFloat(this.bpm.toFixed(3)),
            creator: this.creator,
            drain: this.hit_length,
            mods: this.mods,
            stars: parseFloat(this.difficultyrating.toFixed(2)),
            status,
            title: this.title,
            version: this.version
        };
    }
}
