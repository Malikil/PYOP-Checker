const Discord = require('discord.js');
const db = require('../../db-manager');
const ApiBeatmap = require('../../types/apibeatmap');
const { checkers } = require('../../checkers');
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
        else if (team.eliminated)
            return msg.channel.send(`${team.teamname} has been eliminated. Maps cannot be added.`);

        // Make sure pools aren't closed
        const { lastClose, now } = helpers.closingTimes();
        // If it's less than 16 hours since closing
        if ((now - lastClose) < (1000 * 60 * 60 * 16))
            return msg.channel.send(
                "Pools are closed, please wait until pools release before " +
                "submitting new maps. If you are replacing a map which was " +
                "rejected please send your replacement to Malikil directly."
            );
        // Maps can't be used more than once
        if (team.oldmaps.find(m => m.bid === map))
            return msg.channel.send("You can't reuse maps you've picked before.");

        // Check beatmap approval
        console.log(`Looking for map with id ${map} and mod ${mods.mods}`);
        const beatmap = await ApiBeatmap.buildFromApi(map, mods.mods);
        if (!beatmap)
            return msg.channel.send(`Could not find map with id ${map}`);
        // Make sure a team member didn't map it
        if (beatmap.approved < 1 && team.players.find(p => p.osuid === beatmap.creator_id))
            return msg.channel.send("You cannot use your own maps unless they're ranked");

        // Prepare the message embed
        const resultEmbed = new Discord.MessageEmbed()
            .setAuthor(`${helpers.mapString(beatmap)}`, null, helpers.mapLink(beatmap))
            //.setURL(helpers.mapLink(beatmap))
            .setColor("#00ffa0");
            
        let checkResult = await checkers[team.division].check(beatmap);
        console.log("Result of map check:");
        console.log(checkResult);
        if (!checkResult.passed)
            return msg.channel.send(
                resultEmbed.addField(
                    "Rejected",
                    checkResult.message
                ).setTimestamp()
            );
        else if (checkResult.approved)
            if (beatmap.version === "Aspire" || beatmap.approved > 3)
                status = "Pending";
            else
                status = "Approved (Automatic)";
        else
            status = "Screenshot Required";

        // Check if a map should be removed to make room for this one
        // We need to see if there's an available spot for this map, and which
        // modpool it's in. If there aren't enough spaces a map should be removed
        // to make space
        let rejected;
        const modMaps = team.maps.filter(m => m.pool === mods.pool);
        const cmMaps = team.maps.filter(m => m.pool === 'cm');
        // There is an available spot
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

            resultEmbed.addField(
                `Added to ${mapitem.pool.toUpperCase()} mod pool`,
                `Map approval status: ${mapitem.status}${
                    replaced
                    ? `\nReplaced [${helpers.mapString(replaced)}](${helpers.mapLink(replaced)}) ${replaced.bid}`
                    : ""
                }`
            ).addField(
                `Current ${helpers.modString(mapitem.mods)} maps`,
                cur.reduce((str, map) =>
                    `${str}[${helpers.mapString(map)}](${helpers.mapLink(map)}) ${map.pool === "cm" ? "CM" : ""}\n`
                , '')
            );
            
            return msg.channel.send(resultEmbed.setTimestamp());
        }
        else
            return msg.channel.send(
                resultEmbed.addField(
                    "Error",
                    "Couldn't add beatmap"
                ).setTimestamp()
            );
    }
}