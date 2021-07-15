import { Command } from "../../types/commands";
import { Message } from 'discord.js';
import db from '../../database/db-manager';
import helpers from '../../helpers/helpers';
import { Mods } from "../../types/bancho";

export default class implements Command {
    name = "reject";
    description = "Rejects a map with a message for the players indicating " +
        "why the map was rejected. Mods are required to help prevent " +
        "rejecting unintended maps.";
    permissions = [ process.env.ROLE_MAP_APPROVER ];
    args = [
        { arg: 'map', required: true },
        { arg: 'mods', required: true },
        {
            arg: "message",
            description: "The rejection message. Quotes aren't required, " +
                "everything after the mods will be used",
            required: true
        }
    ];
    skipValidation = true;

    async run(msg: Message, { map, mods }: { map: number, mods: Mods }) {
        if (!map)
            return msg.channel.send("Map not recognised");
        if (!mods && mods !== 0)
            return msg.channel.send("Mods not recognised");

        // Remove the command, map, and mods from message content to get the rejection message
        const messageArr = msg.content.split(/ +/).slice(3);
        if (!messageArr || messageArr.length < 1)
            return msg.channel.send("Please include a reject message");
        const message = messageArr.reduce((p, c) => `${p} ${c}`);
        
        const result = await db.rejectMap(map, mods, message);
        // Get the list of players, and send them a message if they're in the server
        const guild = msg.client.guilds.cache.get(process.env.DISCORD_GUILD);
        let dms = result.playerNotif.map(player => {
            const member = guild.members.cache.get(player.discordid);
            if (member)
                return member.send("A map in your pool was rejected:\n" +
                    `**__Map:__** https://osu.ppy.sh/b/${map} +${helpers.modString(mods)}\n` +
                    `**__Message:__** ${message}`);
        });
        dms.push(msg.channel.send(`Rejected ${map} +${helpers.modString(mods)} from ${result.modified} pools`));
        return Promise.all(dms);
    }
}