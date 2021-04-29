import { Command } from "../../types/types";
import { Message, MessageEmbed } from 'discord.js';
import helpers from '../../helpers/helpers';
import db from '../../database/db-manager';
import { Beatmap, Mods } from '../../types/bancho';
import { checkers } from '../../checkers';
import { hours } from '../../helpers/mstime';

export default class implements Command {
    name = "bulkadd";
    description = "Add multiple maps to your pool at once. " +
        "There should be one map per line, and mods should be included for all. eg:\n" +
        "    !bulkadd <https://osu.ppy.sh/b/8708> NM\n    <https://osu.ppy.sh/b/8708> HD\n" +
        "    <https://osu.ppy.sh/b/75> HR\n    <https://osu.ppy.sh/b/75> DT\n";
    skipValidation = true;
    args = [
        {
            arg: 'any',
            name: "maps...",
            description: "map id/link and mods for each map",
            required: true
        }
    ];
    alias = [ 'addbulk' ];

    async run(msg: Message) {
        // Get the user's team
        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Player not found");
        else if (team.eliminated)
            return msg.channel.send(`${team.teamname} has been eliminated. Maps cannot be added.`);

        // Make sure pools aren't closed
        const { lastClose, now } = helpers.closingTimes();
        // If it's less than a 16 hours since closing
        if ((now.getTime() - lastClose.getTime()) < hours(16))
            return msg.channel.send(
                "Pools are closed, please wait until pools release before " +
                "submitting new maps. If you are replacing a map which was " +
                "rejected please send your replacement to Malikil directly."
            );

        console.log(`bulkadd: Adding maps to team ${team.teamname}`);
        const resultEmbed = new MessageEmbed()
            .setTitle("Adding multiple maps")
            .setColor("#a0ffa0");
        // Skip over the !addbulk command and split into lines
        let lines = msg.content.substr("!addbulk ".length).split('\n');
        console.log(lines);
        const maps = lines.reduce((arr, line) => {
            let lineargs = line.trim().split(/\s+/);
            // try to get mapid and mods
            let mapid = helpers.parseMapId(lineargs[0]);
            let mods;
            if (mapid)
                mods = helpers.parseMod(lineargs[1]);
            else
            {
                mapid = helpers.parseMapId(lineargs[1]);
                mods = helpers.parseMod(lineargs[0]);
            }
            if (mapid)
                arr.push({
                    mapid, mods
                });
            return arr;
        }, <{ mapid: number, mods: Mods }[]>[]);

        // Add all the maps
        let addStr = await maps.reduce(async (res, map) => {
            console.log(`Checking map ${map.mapid} +${map.mods}`);
            let prev = await res;
            let adding = `[${map.mapid}](https://osu.ppy.sh/b/${map.mapid}) +${helpers.modString(map.mods)} => `;
            // Don't add a map that has already been used
            if (team.oldmaps.find(m => m.bid === map.mapid))
                return {
                    str: `${prev.str}${adding}You can't reuse maps you've picked before\n`,
                    count: prev.count
                };
            // Get the map
            const beatmap = await Beatmap.buildFromApi(map.mapid, map.mods);
            let checkResult = await checkers[team.division].check(beatmap);
            if (!checkResult.passed)
                return {
                    str: `${prev.str}${adding}${checkResult.message}\n`,
                    count: prev.count
                };
            let status;
            if (checkResult.approved)
                if (beatmap.version === "Aspire" || beatmap.approved > 3)
                    status = "Pending";
                else
                    status = "Approved (Automatic)";
            else
                status = "Screenshot Required";
            const mapitem = beatmap.toDbBeatmap(status);
            // Add map
            let added = await db.addMap(team.teamname, mapitem);
            if (added) {
                if (added !== true)
                    return {
                        str: `${prev.str}${adding}Replaced [${helpers.mapString(added)}](${helpers.mapLink(added)}) ${added.bid}\n`,
                        count: prev.count + 1
                    };
                else
                    return {
                        str: `${prev.str}${adding}Added map\n`,
                        count: prev.count + 1
                    };
            }
            else
                return {
                    str: `${prev.str}${adding}Something went wrong\n`,
                    count: prev.count
                };
        }, Promise.resolve({ str: '', count: 0 }));
        resultEmbed.setDescription(addStr.str)
            .setFooter(`Added ${addStr.count} maps`)
            .setTimestamp();

        // Display success
        return msg.channel.send(resultEmbed);
    }
}