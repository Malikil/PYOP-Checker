import nfetch from 'node-fetch';
import { BanchoUser } from './types';
const OSUKEY = process.env.OSUKEY;

export default class Player {
    user_id: number;
    username: string;
    join_date: Date;
    country: string;
    count300: number;
    count100: number;
    count50: number;
    playcount: number;
    ranked_score: number;
    total_score: number;
    pp_rank: number;
    level: number;
    pp_raw: number;
    accuracy: number;
    count_rank_ss: number;
    count_rank_ssh: number;
    count_rank_s: number;
    count_rank_sh: number;
    count_rank_a: number;
    total_seconds_played: number;
    pp_country_rank: number;

    constructor(player: BanchoUser) {
        // This should always be a proper player object, as returned by the osu api.
        // As such, everything is a string and needs to be converted

        // Identification
        this.user_id = parseInt(player.user_id);
        this.username = player.username;
        this.join_date = new Date(player.join_date.replace(" ", "T") + "Z");
        this.country = player.country;

        // Stats
        this.count300 = parseInt(player.count300);
        this.count100 = parseInt(player.count100);
        this.count50 = parseInt(player.count50);
        this.playcount = parseInt(player.playcount);
        this.ranked_score = parseInt(player.ranked_score);
        this.total_score = parseInt(player.total_score);
        this.pp_rank = parseInt(player.pp_rank);
        this.level = parseFloat(player.level);
        this.pp_raw = parseFloat(player.pp_raw);
        this.accuracy = parseFloat(player.accuracy);
        this.count_rank_ss = parseInt(player.count_rank_ss);
        this.count_rank_ssh = parseInt(player.count_rank_ssh);
        this.count_rank_s = parseInt(player.count_rank_s);
        this.count_rank_sh = parseInt(player.count_rank_sh);
        this.count_rank_a = parseInt(player.count_rank_a);
        this.total_seconds_played = parseInt(player.total_seconds_played);
        this.pp_country_rank = parseInt(player.pp_country_rank);

        // Ignored:
        //  - events
    }

    static async buildFromApi(userid: string | number, mode = 0) {
        let player = await nfetch(`https://osu.ppy.sh/api/get_user?k=${OSUKEY}&u=${userid}&m=${mode}`)
            .then(res => res.json())
            .then((data: BanchoUser[]) => data[0]);
        if (player)
            return new Player(player);
        // Undefined if the player doesn't exist
    }
}
