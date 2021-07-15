import { Message, RoleResolvable } from "discord.js";

export interface CommandArg {
    arg: string,
    required: boolean,
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
