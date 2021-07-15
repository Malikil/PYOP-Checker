import { Mods } from "./bancho";
import { Aggregate, ValueRange } from "./rules";

export interface Division {
    division: string
    /** The id part of the challonge url, that is: challonge.com/&lt;this part&gt; */
    url?: string
    rankLimits?: ValueRange
    rules: {
        type: string,
        limits: ValueRange[],
        strict: boolean
    }[]
    poolRules: Aggregate[]
    pools: {
        mods: Mods | "Custom",
        count: number
    }[]
};

/**
 * @deprecated This represents what used to be found in divisions.json  
 * Use 'Division' when working with the database
 */
export interface LegacyDivision {
    division: string
    url: string
    ranklimits: ValueRange
    starlimits: ValueRange[]
    drainlimits: ValueRange[]
    lengthlimits: ValueRange[]
    leaderboardlimits: ValueRange[]
};
