import { Mods } from "./bancho";

export interface ValueRange {
    low?: number;
    high?: number;
    buffer?: number;
    bufferCount?: number;
};

export enum RuleType {
    Stars = "StarRatingRule",
    Drain = "DrainTimeRule",
    Leaderboard = "LeaderboardRule",
    TotalTime = "TotalTimeRule"
};

export interface Division {
    division: string
    url?: string
    rankLimits?: ValueRange
    rules: {
        type: RuleType
        limits: ValueRange[]
    }[],
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
