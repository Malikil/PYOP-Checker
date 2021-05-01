import { Beatmap } from '../../types/bancho';
import { Rule } from '../rule';
import helpers from '../../helpers/helpers';
import { DbBeatmap } from '../../types/database';

export const type: string = "TotalTimeRule";
export default class TotalTimeRule extends Rule {
    async check(value: Beatmap | DbBeatmap | number) {
        if (typeof value !== 'number')
            if ('total_length' in value)
                value = value.total_length;
            else
                value = value.drain;

        return this.generateResult(value);
    }

    rejectMessage(value: number) {
        return `${helpers.convertSeconds(value)} drain is ${
            value > this.range.max ? "above the maximum" : "below the minimum"
        } allowed song length of ${
            helpers.convertSeconds(value > this.range.max ? this.range.max : this.range.min)
        }`;
    }
}
