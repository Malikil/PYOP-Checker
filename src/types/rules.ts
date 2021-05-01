export interface ValueRange {
    min?: number;
    max?: number;
    buffer?: number;
    bufferCount?: number;
};

export interface CheckResult {
    result: "passed" | "failed" | "buffer";
    expected?: number;
    actual?: number;
    message?: string
};

export interface Aggregate {
    type: string
    limits: {
        min?: number
        max?: number
    }
};
