import helpers from '../../helpers/helpers';
import { Beatmap } from '../../types/bancho';
import { DbBeatmap } from '../../types/database';
import { Rule } from '../rule';

export const type: string = "DrainTimeRule";
export default class DrainTimeRule extends Rule {
    async check(value: Beatmap | DbBeatmap | number) {
        if (typeof value !== 'number')
            value = 'hit_length' in value ?
                value.hit_length :
                value.drain;

        return this.generateResult(value);
    }

    rejectMessage(value: number) {
        return `${helpers.convertSeconds(value)} drain is ${
            value > this.range.max ? "above the maximum" : "below the minimum"
        } allowed drain time of ${
            helpers.convertSeconds(value > this.range.max ? this.range.max : this.range.min)
        }`;
    }
}
