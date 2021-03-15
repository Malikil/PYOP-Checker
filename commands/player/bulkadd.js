const Discord = require('discord.js');
const helpers = require('../../helpers/helpers');
const db = require('../../db-manager');
const ApiBeatmap = require('../../types/apibeatmap');
const { checkers } = require('../../checkers');

module.exports = {
    name: "bulkadd",
    description: "Add multiple maps to your pool at once. " +
        "There should be one map per line, and mods should be included for all. eg:\n" +
        "    !bulkadd <https://osu.ppy.sh/b/8708> NM\n    <https://osu.ppy.sh/b/8708> HD\n" +
        "    <https://osu.ppy.sh/b/75> HR\n    <https://osu.ppy.sh/b/75> DT\n",
    skipValidation: true,
    args: [
        {
            arg: 'any',
            name: "maps...",
            description: "map id/link and mods for each map",
            required: true
        }
    ],
    alias: [ 'addbulk' ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg) {
        // Get the user's team
        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Player not found");
        else if (team.eliminated)
            return msg.channel.send(`${team.teamname} has been eliminated. Maps cannot be added.`);

        // Make sure pools aren't closed
        const { lastClose, now } = helpers.closingTimes();
        // If it's less than a 16 hours since closing
        if ((now - lastClose) < (1000 * 60 * 60 * 16))
            return msg.channel.send(
                "Pools are closed, please allow an hour for processing before " +
                "submitting new maps. If you are replacing a map which was " +
                "rejected please send your replacement to Malikil directly."
            );

        console.log(`bulkadd: Adding maps to team ${team.teamname}`);
        // Skip over the !addbulk command and split into lines
        let lines = msg.content.substr("!addbulk ".length).split('\n');
        console.log(lines);
        let maps = lines.reduce((arr, line) => {
            let lineargs = line.split(/ +/);
            // try to get mapid and mods
            let mapid = helpers.parseMapId(lineargs[0]);
            let mods, cm;
            if (mapid)
            {
                mods = helpers.parseMod(lineargs[1]);
                cm = (lineargs[1] || '').toUpperCase().includes("CM");
            }
            else
            {
                mapid = helpers.parseMapId(lineargs[1]);
                mods = helpers.parseMod(lineargs[0]);
                cm = (lineargs[0] || '').toUpperCase().includes("CM");
            }
            if (mapid)
                arr.push({
                    mapid, mods, cm
                });
            return arr;
        }, []);

        // Add all the maps
        let added = await maps.reduce(async (count, map) => {
            console.log(`Checking map ${map.mapid} +${map.mods}${map.cm ? " CM" : ""}`);
            // Get the map
            const beatmap = await ApiBeatmap.buildFromApi(map.mapid, map.mods);
            let checkResult = await checkers[team.division].check(beatmap);
            if (!checkResult.passed)
                return count;
            let status;
            if (checkResult.approved)
                if (beatmap.version === "Aspire" || beatmap.approved > 3)
                    status = "Pending";
                else
                    status = "Approved (Automatic)";
            else
                status = "Screenshot Required";
            let pool = map.cm ? "cm" : helpers.getModpool(map.mods);
            let mapitem = beatmap.toDbBeatmap(status, pool);
            // Add map
            let added = await db.addMap(team.teamname, mapitem);
            if (added)
                return (await count) + 1;
            else
                return count;
        }, Promise.resolve(0));

        // Display success
        return msg.channel.send(`Added ${added} maps`);
    }
}