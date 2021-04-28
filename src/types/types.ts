import { Message, RoleResolvable } from "discord.js";
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

export interface PlayerId {
    discordid?: string,
    osuname?: string,
    osuid?: number
};

export interface CommandArg {
    arg: string,
    required: boolean,
    name?: string,
    description?: string
};

export interface Command {
    name: string;
    description: string;
    permissions?: RoleResolvable[];
    args?: CommandArg[];
    alias?: string[];
    skipValidation?: boolean;
    run: (msg: Message, args?: object) => Promise<any>
};
