import helpers from '../../helpers/helpers';
import { Rule } from '../rule';
import { Beatmap } from '../../types/bancho';
import { ApprovedStatus } from '../../types/bancho/enums';
import { DbBeatmap } from '../../types/database';

const leaderboardCache: { [bid: number]: number } = {};

export const type: string = "LeaderboardRule";
export default class LeaderboardRule extends Rule {
    async check(value: Beatmap | DbBeatmap | number) {
        if (typeof value !== 'number') {
            // If we've got the leaderboard count cached just use that
            if ('bid' in value)
                if (value.bid in leaderboardCache)
                    value = leaderboardCache[value.bid];
                else
                    value = await this.leaderboardCount(value);
            else
                if (value.beatmap_id in leaderboardCache)
                    value = leaderboardCache[value.beatmap_id];
                else
                    value = await this.leaderboardCount(value);
        }

        return this.generateResult(value);
    }

    private async leaderboardCount(map: Beatmap | DbBeatmap): Promise<number> {
        const id = 'bid' in map ? map.bid : map.beatmap_id;
        if (id in leaderboardCache)
            return leaderboardCache[id];
        // Approved statuses are more or less sorted so "more ranked" is higher numbers
        else if (!('approved' in map) || map.approved >= ApprovedStatus.Ranked) {
            // Get the number of scores on the leaderboard
            const leaderboard = await helpers.getLeaderboard(id, map.mods);
            return leaderboard.length;
        }
        else
            return 0;
    }

    rejectMessage(value: number) {
        return `There are only ${value} out of ${this.range.min} required scores on the leaderbaord`;
    }
}
