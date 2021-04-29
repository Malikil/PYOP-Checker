import { Message, MessageEmbed } from 'discord.js';
import db from '../../database/db-manager';
import { Beatmap, Mods } from '../../types/bancho';
import { checkers } from '../../checkers';
import helpers from '../../helpers/helpers';
import { Command, DbBeatmap, MapStatus } from '../../types/types';
import { hours } from '../../helpers/mstime';

export default class implements Command {
    name = "addmap";
    description = "Adds a map to your pool. " +
        "If there aren't any available spaces for the new map, the first map " +
        "added will be removed to make space for the new one. To replace a " +
        "specific map, remove it first before adding another.";
    args = [
        { arg: "map", required: true },
        { arg: "mods", required: false }
    ];
    alias = [ "add" ];

    async run(msg: Message, { map, mods }: { map: number, mods: Mods }) {
        if (!mods)
            mods = Mods.None;

        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Could not find team");
        else if (team.eliminated)
            return msg.channel.send(`${team.teamname} has been eliminated. Maps cannot be added.`);

        // Make sure pools aren't closed
        const { lastClose, now } = helpers.closingTimes();
        // If it's less than 16 hours since closing
        if ((now.getTime() - lastClose.getTime()) < hours(16))
            return msg.channel.send(
                "Pools are closed, please wait until pools release before " +
                "submitting new maps. If you are replacing a map which was " +
                "rejected please send your replacement to Malikil directly."
            );

        // Prepare the message embed
        const resultEmbed = new MessageEmbed().setColor("#00ffa0");

        // Maps can't be used more than once
        const oldmap = team.oldmaps.find(m => m.bid === map);
        if (oldmap)
            return msg.channel.send(
                resultEmbed.addField(
                    "Rejected",
                    "You can't reuse maps you've picked before."
                ).setAuthor(`${helpers.mapString(oldmap)}`, null, helpers.mapLink(oldmap))
            );

        // Check beatmap approval
        console.log(`Looking for map with id ${map} and mod ${mods}`);
        const beatmap = await Beatmap.buildFromApi(map, mods);
        if (!beatmap)
            return msg.channel.send(`Could not find map with id ${map}`);
        resultEmbed.setAuthor(`${helpers.mapString(beatmap)}`, null, helpers.mapLink(beatmap))
        // Make sure a team member didn't map it
        if (beatmap.approved < 1 && team.players.find(p => p.osuid === beatmap.creator_id))
            return msg.channel.send(
                resultEmbed.addField(
                    "Rejected",
                    "You cannot use your own maps unless they're ranked"
                )
            );
            
        const checkResult = await checkers[team.division].check(beatmap);
        console.log("Result of map check:");
        console.log(checkResult);
        let status: MapStatus;
        if (!checkResult.passed)
            return msg.channel.send(
                resultEmbed.addField(
                    "Rejected",
                    checkResult.message
                )
            );
        else if (checkResult.approved)
            if (beatmap.version === "Aspire" || beatmap.approved > 3)
                status = MapStatus.Pending;
            else
                status = MapStatus.AutoApproved;
        else
            status = MapStatus.ScreenshotRequired;

        // If the current pool is full, look for a rejected map first
        if (team.maps.length >= 10) {
            let rejected = team.maps.find(m => m.status === MapStatus.Rejected);
            if (rejected)
                await db.removeMap(team.teamname, rejected.bid, rejected.mods);
        }
        
        const mapitem: DbBeatmap = {
            bid: beatmap.beatmap_id,
            artist: beatmap.artist,
            bpm: beatmap.bpm,
            creator: beatmap.creator,
            drain: beatmap.hit_length,
            mods: beatmap.mods,
            stars: beatmap.difficultyrating,
            status,
            title: beatmap.title,
            version: beatmap.version
        };
        const result = await db.addMap(team.teamname, mapitem);
        if (result)
        {
            // Prepare the current pool state
            let cur = [];
            let skipped = false; // Whether we've skipped a map yet
            team.maps.forEach(m => {
                // Get maps with matching mods
                if (m.mods === mods)
                {
                    // Make sure it's not the removed map
                    if (skipped || (result === true || m.bid !== result.bid))
                        cur.push(m);
                    else
                        skipped = true;
                }
            });
            // Add the newly added map
            cur.push(mapitem);
            
            // Send status and current pool info
            resultEmbed.addField(
                `Added to ${helpers.modString(mapitem.mods)} mod pool`,
                `Map approval status: ${MapStatus[mapitem.status]}${
                    typeof result === "object"
                    ? `\nReplaced [${helpers.mapString(result)}](${helpers.mapLink(result)}) +${helpers.modString(result.mods)} ${result.bid}`
                    : ""
                }`
            ).addField(
                `Current ${helpers.modString(mapitem.mods)} maps`,
                cur.reduce((str, map) =>
                    `${str}[${helpers.mapString(map)}](${helpers.mapLink(map)})\n`
                , '')
            );
            
            return msg.channel.send(resultEmbed);
        }
        else
            return msg.channel.send(
                resultEmbed.addField(
                    "Error",
                    "Couldn't add beatmap"
                )
            );
    }
}