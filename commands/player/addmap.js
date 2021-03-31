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
            mods = 0;

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

        // Prepare the message embed
        const resultEmbed = new Discord.MessageEmbed().setColor("#00ffa0");

        // Maps can't be used more than once
        const oldmap = team.oldmaps.find(m => m.bid === map);
        if (oldmap)
            return msg.channel.send(
                resultEmbed.addField(
                    "Rejected",
                    "You can't reuse maps you've picked before."
                ).setAuthor(`${helpers.mapString(oldmap)}`, null, helpers.mapLink(oldmap))
                .setTimestamp()
            );

        // Check beatmap approval
        console.log(`Looking for map with id ${map} and mod ${mods}`);
        const beatmap = await ApiBeatmap.buildFromApi(map, mods);
        if (!beatmap)
            return msg.channel.send(`Could not find map with id ${map}`);
        resultEmbed.setAuthor(`${helpers.mapString(beatmap)}`, null, helpers.mapLink(beatmap))
        // Make sure a team member didn't map it
        if (beatmap.approved < 1 && team.players.find(p => p.osuid === beatmap.creator_id))
            return msg.channel.send(
                resultEmbed.addField(
                    "Rejected",
                    "You cannot use your own maps unless they're ranked"
                ).setTimestamp()
            );
            
        const checkResult = await checkers[team.division].check(beatmap);
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

        // If the current pool is full, look for a rejected map first
        if (team.maps.length >= 10) {
            let rejected = team.maps.find(m => m.status.startsWith("Rejected"));
            if (rejected)
                await db.removeMap(team.teamname, rejected.bid, rejected.mods);
        }
        
        const mapitem = beatmap.toDbBeatmap(status);
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
                    if (skipped || (m.bid !== result.bid))
                        cur.push(m);
                    else
                        skipped = true;
                }
            });
            // Add the newly added map
            cur.push(mapitem);
            
            // Send status and current pool info
            resultEmbed.addField(
                `Added to ${mapitem.pool.toUpperCase()} mod pool`,
                `Map approval status: ${mapitem.status}${
                    result.bid
                    ? `\nReplaced [${helpers.mapString(result)}](${helpers.mapLink(result)}) ${result.bid}`
                    : ""
                }`
            ).addField(
                `Current ${helpers.modString(mapitem.mods)} maps`,
                cur.reduce((str, map) =>
                    `${str}[${helpers.mapString(map)}](${helpers.mapLink(map)})\n`
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