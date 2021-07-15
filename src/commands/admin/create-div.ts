import { Message } from "discord.js";
import { Command } from "../../types/commands";
import { createDivision } from '../../database/db-divisions';

export default class implements Command {
    name = "newdivision";
    description = "Creates a new division with the given name";
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        { arg: "divName", description: "The name of the division", required: true }
    ];
    alias = [ "newdiv" ];
    async run(msg: Message, { divName }: { divName: string }) {
        const result = await createDivision(divName);
        if (result.ok)
            return msg.channel.send(`Created division: ${divName}`);
        else
            return msg.channel.send(`Couldn't create division: ${divName}`);
    }
}