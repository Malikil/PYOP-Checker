import { Beatmap } from "../types/bancho";
import { DbBeatmap } from "../types/database";
import { CheckResult, ValueRange } from "../types/rules";

// Is this even correct?
export interface RuleConstructor {
    /**
     * Creates a new rule.
     * @param range The range of values the rule will pass
     * @param strict Whether to immediately reject this map or allow it with approval
     */
    new(range: ValueRange, strict: boolean): Rule;
    (range: ValueRange, strict: boolean): Rule;
    readonly prototype: Rule;
};

export abstract class Rule {
    constructor(
        public readonly range: ValueRange,
        public readonly strict: boolean
    ){};
    ruleType() { return this.constructor.name; }

    abstract check(value: Beatmap | DbBeatmap | number): Promise<CheckResult>;
    protected generateResult(value: number) {
        let result: CheckResult = {
            result: "passed",
            actual: value
        };
        if (this.range.min !== undefined && value < this.range.min) {
            result.expected = this.range.min;
            result.message = this.rejectMessage(value);
            // The value is too low for the regular range, check if it falls inside the buffer
            if (value >= (this.range.min - this.range.buffer))
                result.result = 'buffer';
            else
                result.result = 'failed';
        }
        else if (this.range.max !== undefined && value > this.range.max) {
            // The result is too high
            result.expected = this.range.max;
            result.message = this.rejectMessage(value);
            if (value <= (this.range.max + this.range.buffer))
                result.result = 'buffer';
            else
                result.result = 'failed';
        }

        return result;
    }
    protected abstract rejectMessage(value: number): string;
};
