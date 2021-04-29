import { Command, MapStatus } from "../../types/types";
import { Message, MessageEmbed } from 'discord.js';
import helpers from '../../helpers/helpers';
import { checkers } from '../../checkers';
import db from '../../database/db-manager';
const MAP_COUNT = 10;

export default class implements Command {
    name = "viewpool";
    description = "View maps in your pool and their statuses.";
    alias = [ 'view', 'list', 'pool', 'mappool' ];

    async run(msg: Message) {
        // Get which team the player is on
        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Could not find player");

        // Prepare the message embed
        const resultEmbed = new MessageEmbed()
            .setTitle(`Mappool for ${team.teamname}`)
            .setColor("#00ffa0");

        const modNames = {
            NM: "No Mod",
            HD: "Hidden",
            HR: "Hard Rock",
            DT: "Double Time",
            NC: "Nightcore",
            HT: "Half Time",
            EZ: "Easy"
        };
        // Loop over all the maps, add them to the proper output string,
        // and add them to the pool for checking.
        const fieldinfo = team.maps.map(map => {
            // Prepare basic info
            let mapinfo = {
                mods: map.mods,
                str: ""
            };
            // Convert the map to a string
            mapinfo.str += `[${helpers.mapString(map)}](${helpers.mapLink(map)}) ${map.bid}\n`;
            mapinfo.str += `\u2003Drain: ${helpers.convertSeconds(map.drain)}, Stars: ${map.stars}\n\u2003Status: ${MapStatus[map.status]}`;
            if (map.status === MapStatus.ScreenshotRequired) {
                let passes = (map.passes || []).length;
                let missing = 2 - passes;
                mapinfo.str += ` - ${passes} submitted, ${missing} missing`;
            }
            return mapinfo;
        }).sort((a, b) => a.mods - b.mods)
            .reduce((p, c) => {
                // Combine same mods into one string
                let last = p[p.length - 1];
                if (last.mods === c.mods)
                    last.str += `\n${c.str}`;
                else
                    p.push(c);
                return p;
            }, [{ mods: 0, str: '' }])
            .filter(f => f.str); // So it doesn't try to create an empty field when there aren't any NM maps
        // Put all the output strings together into fields
        resultEmbed.addFields(
            fieldinfo.map(info => {
                // Get the mod string from the mods
                let shortmod = helpers.modString(info.mods);
                let header = Object.keys(modNames).reduce((head, short) => {
                    if (shortmod.includes(short))
                        head += `${modNames[short]}, `;
                    return head;
                }, '');
                return {
                    name: header.slice(0, -2),
                    value: info.str
                };
            })
        );
        // Check the pool as a whole
        let result = await checkers[team.division].checkPool(team.maps);
        // Display pool stats
        let footer = `Total drain: ${helpers.convertSeconds(result.totalDrain)}\n` +
            `${result.overUnder} maps are within ${process.env.DRAIN_BUFFER} seconds of drain time limit\n` +
            `There are ${MAP_COUNT - team.maps.length} unfilled slots\n`;
        // Show pool problems
        if (result.messages.length > 0)
            result.messages.forEach(item => footer += `\n${item}`);

        if (result.duplicates.length > 0)
        {
            footer += "\nThe following maps were found more than once:";
            result.duplicates.forEach(dupe => footer += `\n\u2003${helpers.mapString(dupe)}`);
        }
        resultEmbed.addField("\u200b", footer);

        return msg.channel.send(resultEmbed);
    }
}