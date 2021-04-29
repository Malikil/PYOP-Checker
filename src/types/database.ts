import Mods from "./bancho/mods";

export interface DbPlayer {
    discordid: string,
    osuname: string,
    osuid: number,
    utc?: string,
    notify?: boolean
};

export enum MapStatus {
    Rejected = -1,
    ScreenshotRequired,
    Pending,
    AutoApproved,
    Approved
};

export interface DbBeatmap {
    bid: number,
    status: MapStatus,
    drain: number,
    stars: number,
    bpm: number,
    artist: string,
    title: string,
    version: string,
    creator: string,
    mods: Mods,
    passes?: string[],
    message?: string
};

export interface DbTeam {
    teamname: string,
    division: string,
    players: DbPlayer[],
    maps: DbBeatmap[],
    oldmaps: DbBeatmap[],
    eliminated?: boolean
};
