import { Message } from "discord.js";
import { Command } from "../../types/commands";
import { createDivision, setRankLimit } from '../../database/db-divisions';
import { ValueRange } from "../../types/rules";

export default class implements Command {
    name = "newdivision";
    description = "Creates a new division with the given name";
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        { arg: "divName", description: "The name of the division", required: true },
        { arg: "range", required: false }
    ];
    alias = [ "newdiv" ];
    async run(msg: Message, { divName, range }: { divName: string, range?: ValueRange }) {
        const result = await createDivision(divName);

        // Do we need to set the rank limits now?
        if (result.ok && range) {
            // The validator puts the smaller value in minimum, which is backwards
            // for ranking numbers
            [range.min, range.max] = [range.max, range.min];

            if (!(await setRankLimit(divName, range)))
                return msg.channel.send(`Created division ${divName}. Failed to set rank limits.`);
        }

        if (result.ok)
            return msg.channel.send(`Created division: ${divName}`);
        else
            return msg.channel.send(`Couldn't create division: ${divName}`);
    }
}