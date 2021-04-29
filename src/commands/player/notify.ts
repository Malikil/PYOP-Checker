import { Command } from "../../types/commands";
import { Message } from 'discord.js';
import db from '../../database/db-manager';

export default class implements Command {
    name = "notify";
    description = "Sets whether the bot will DM you when a map is rejected";
    args = [
        { arg: "setting", required: false }
    ];

    async run(msg: Message, { setting }: { setting: "off" | "on" }) {
        let update: boolean;
        if (setting === "off")
            update = false;
        else if (setting === "on")
            update = true;
        // If an argument for setting is given, update the setting
        let notify = await db.setNotify(msg.author.id, update);

        // Display the current setting regardless
        return msg.channel.send(
            `${this.description}. Toggle with on/off\n` +
            `Currently set to: ${notify}`
        );
    }
}