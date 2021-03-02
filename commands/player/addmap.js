const Discord = require('discord.js');
const db = require('../../db-manager');
const ApiBeatmap = require('../../types/apibeatmap');
const checkers = require('../../checkers');
const helpers = require('../../helpers/helpers');

module.exports = {
    name: "addmap",
    description: "Adds a map to your pool. " +
        "If there are already two maps in the selected mod pool, the first map " +
        "will be removed when adding a new one. To replace a specific map, " +
        "remove it first before adding another. Rejected maps will be " +
        "replaced in preference to pending/accepted.",
    args: [
        { arg: "map", required: true },
        { arg: "mods", required: false }
    ],
    alias: [ "add" ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { map, mods }) {
        if (!mods)
            mods = {
                mods: 0,
                pool: 'nm'
            };

        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Could not find team");

        // Check beatmap approval
        console.log(`Looking for map with id ${map} and mod ${mods.mods}`);
        const beatmap = await ApiBeatmap.buildFromApi(map, mods.mods);
        if (!beatmap)
            return msg.channel.send(`Could not find map with id ${map}`);
        let checkResult = await checkers[team.division].check(beatmap);
        console.log("Result of map check:");
        console.log(checkResult);
        if (!checkResult.passed)
            return msg.channel.send(
                `Rejected ${helpers.mapString(beatmap)}:\n` +
                `Message: ${checkResult.message}`
            );
        else if (checkResult.approved)
            if (beatmap.version === "Aspire" || beatmap.approved > 3)
                status = "Pending";
            else
                status = "Approved (Automatic)";
        else
            status = "Screenshot Required";

        // Check if a map should be removed to make room for this one
        // We need the first rejected map, and a count of maps in the modpool
        let rejected;
        let count = team.maps.reduce((n, m) => {
            if (m.pool === mods.pool)
            {
                if (!rejected && m.status.startsWith("Rejected"))
                    rejected = m;
                return n + 1;
            }
            else return n;
        }, 0);
        if (rejected && count > 1)
            await db.removeMap(team.teamname, rejected.bid, rejected.pool, rejected.mods);
        else // We don't need to remove a map, because there's still an empty space
            rejected = undefined;

        let mapitem = beatmap.toDbBeatmap(status, mods.pool);
        
        let result = await db.addMap(team.teamname, mapitem);
        if (result)
        {
            // Prepare the current pool state
            let cur = [];
            let skipped = false; // Whether we've skipped a map yet
            team.maps.forEach(m => {
                // Get maps with matching mods
                if (m.mods === mods.mods)
                {
                    // Make sure it's not the removed map
                    if (skipped || (m.bid !== result.bid)
                        && (rejected
                            ? m.bid !== rejected.bid
                            : true))
                        cur.push(m);
                    else
                        skipped = true;
                }
            });
            // Add the newly added map
            cur.push(mapitem);
            
            // Send status and current pool info
            let replaced = rejected;
            if (result.bid)
                replaced = result;
            
            return msg.channel.send((replaced ? `Replaced ${helpers.mapString(replaced)} (${replaced.bid})\n` : "") +
                `Added ${helpers.mapString(mapitem)} to ${mapitem.pool.toUpperCase()} mod pool.\n` +
                `Map approval status: ${mapitem.status}\n` +
                `Current __${helpers.modString(mapitem.mods)}__ maps:` +
                cur.reduce((str, map) =>
                    `${str}\n${helpers.mapString(map)} ${map.pool === "cm" ? "CM" : ""}`
                , '')
            );
        }
        else
            return msg.channel.send(
                `Couldn't add ${beatmap ? helpers.mapString(beatmap) : "unknown beatmap"}\n` +
                `Message: ${result.message}`
            );
    }
}