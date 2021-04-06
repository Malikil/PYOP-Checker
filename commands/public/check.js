const { checkers } = require('../../checkers');
const db = require('../../db-manager');
const ApiBeatmap = require('../../types/apibeatmap');
const Discord = require('discord.js');
const util = require('util');

module.exports = {
    name: "check",
    description: "Checks whether a map would be allowed in a pool",
    args: [
        { arg: "map", required: true },
        { arg: "mods" },
        { arg: "division" }
    ],
    alias: [ "map" ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { map, mods, division }) {
        if (!mods)
            mods = 0;
        console.log(`Checking map ${map} with mods ${mods} using ${division} division`);
        // If division is included, use that. Otherwise try to
        // get the division based on who sent the message
        if (!checkers[division])
        {
            let team = await db.getTeamByPlayerid(msg.author.id);
            if (team)
                division = team.division;
            else // Use the first division as default
                division = Object.keys(checkers)[0];
        }
        let beatmap = await ApiBeatmap.buildFromApi(map, mods);
        if (!beatmap)
            return msg.channel.send(`Couldn't find map with id ${map}`);
        let check = await checkers[division].check(beatmap);
        console.log(`Rules check returned: ${util.inspect(check)}`);

        return msg.channel.send(`${division} division: ${check.message}`);
    }
}