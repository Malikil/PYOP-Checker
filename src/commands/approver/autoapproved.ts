import { Command } from "../../types/commands";
import { MapStatus } from '../../types/database';
import { Message } from 'discord.js';
import db from '../../database/db-manager';
import helpers from '../../helpers/helpers';
import { Mods } from "../../types/bancho";

export default class implements Command {
    name = "autoapproved";
    description = "Shows all maps with an auto accepted status. " +
        "These are the maps that PoolBot thinks we don't need to check.\n" +
        "Optionally limit to a specific mod combination.";
    permissions = [ process.env.ROLE_MAP_APPROVER ];
    args = [
        { arg: 'mods', required: false }
    ];
    alias = [ 'autoaccepted', 'automaps' ];

    async run(msg: Message, { mods }: { mods: Mods} ) {
        const maplist = await db.findMapsWithStatus(MapStatus.AutoApproved);
        console.log(maplist);
            
        // Generate the output string
        let str = "";
        maplist.forEach(modpool => {
            if (!mods || mods === modpool._id) {
                str += `**__${helpers.modString(modpool._id)}:__**\n`;
                modpool.maps.forEach(map => {
                    if (str.length < 1800)
                        str += `<${helpers.mapLink(map)}> ${helpers.mapString(map)}\n`;
                });
            }
        });
        // Display the string
        if (str.length >= 1800)
            str += "Message too long, some maps skipped...";
        return msg.channel.send(str || "No maps");
    }
}