import { Command } from "../../types/types";
import { Message } from 'discord.js';
import { exportAllMaps } from '../../gsheets';

export default class implements Command {
    name = "export";
    description = "Exports all current maps to google sheets";
    permissions = [ process.env.ROLE_ADMIN ];

    async run(msg: Message) {
        msg.channel.send("Exporting maps");
        await exportAllMaps();
        console.log("Maps exported");
        return msg.channel.send("Maps exported");
    }
}