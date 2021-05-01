import { Beatmap } from '../../types/bancho';
import { DbBeatmap } from '../../types/database';
import { Rule } from '../rule';

export const type: string = "StarRatingRule";
export default class StarRatingRule extends Rule {
    async check(value: Beatmap | DbBeatmap | number) {
        if (typeof value !== 'number')
            if ('stars' in value)
                value = value.stars;
            else
                value = parseFloat(value.difficultyrating.toFixed(2));
        
        return this.generateResult(value);
    }

    protected rejectMessage(value: number) {
        return `${value.toFixed(2)} stars is ${
            value > this.range.max ? "above the maximum" : "below the minimum"
        } allowed star rating of ${
            value > this.range.max ? this.range.max : this.range.min
        }`;
    }
}
