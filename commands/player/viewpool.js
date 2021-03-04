const Discord = require('discord.js');
const helpers = require('../../helpers/helpers');
const { checkers } = require('../../checkers');
const db = require('../../db-manager');
const MAP_COUNT = 10;

module.exports = {
    name: "viewpool",
    description: "View maps in your pool and their statuses.",
    alias: [ 'view', 'list', 'pool', 'mappool' ],

    /**
     * 
     * @param {Discord.Message} msg 
     */
    async run(msg) {
        // Get which team the player is on
        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Could not find player");

        let strs = {};
        let pool = [];
        const modNames = {
            nm: "**__No Mod:__**\n",
            hd: "**__Hidden:__**\n",
            hr: "**__Hard Rock:__**\n",
            dt: "**__Double Time:__**\n",
            cm: "**__Custom Mod:__**\n"
        };
        // Loop over all the maps, add them to the proper output string,
        // and add them to the pool for checking.
        team.maps.forEach(map => {
            // If the mod hasn't been seen yet, add it to the output
            if (!strs[map.pool])
                strs[map.pool] = modNames[map.pool];
            // Add the map's info to the proper string
            strs[map.pool] += `${helpers.mapString(map)} ${map.pool === 'cm' ? `+${helpers.modString(map.mods)} ` : ""}<${helpers.mapLink(map)}>\n`;
            strs[map.pool] += `\tDrain: ${helpers.convertSeconds(map.drain)}, Stars: ${map.stars}, Status: ${map.status}\n`;

            pool.push(map);
        });
        // Put all the output strings together in order
        let str = ['nm', 'hd', 'hr', 'dt', 'cm'].reduce((s, m) => s + (strs[m] || ""), '');
        // Check the pool as a whole
        let result = await checkers[team.division].checkPool(pool);
        // Display pool stats
        str += `\nTotal drain: ${helpers.convertSeconds(result.totalDrain)}`;
        str += `\n${result.overUnder} maps are within ${process.env.DRAIN_BUFFER} seconds of drain time limit`;
        // Show pool problems
        str += `\nThere are ${MAP_COUNT - team.maps.length} unfilled slots\n`;
        if (result.messages.length > 0)
            result.messages.forEach(item => str += `\n${item}`);

        if (result.duplicates.length > 0)
        {
            str += "\nThe following maps were found more than once:";
            result.duplicates.forEach(dupe => str += `\n\t${helpers.mapString(dupe)}`);
        }

        return msg.channel.send(str || "Nothing to display");
    }
}