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
     * @param {Discord.Message} msg 
     */
    async run(msg) {
        // Get which team the player is on
        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Could not find player");

        // Prepare the message embed
        const resultEmbed = new Discord.MessageEmbed()
            .setTitle(`Mappool for ${team.teamname}`)
            .setColor("#00ffa0");

        let pool = {};
        const modNames = {
            nm: "No Mod",
            hd: "Hidden",
            hr: "Hard Rock",
            dt: "Double Time",
            cm: "Custom Mod"
        };
        // Loop over all the maps, add them to the proper output string,
        // and add them to the pool for checking.
        team.maps.forEach(map => {
            // If the mod hasn't been seen yet, add it to the output
            if (!pool[map.pool])
                pool[map.pool] = "";
            // Add the map's info to the proper string
            pool[map.pool] += `[${helpers.mapString(map)}](${helpers.mapLink(map)}) ${map.bid} ${map.pool === 'cm' ? `+${helpers.modString(map.mods)} ` : ""}\n`;
            pool[map.pool] += `\u2003Drain: ${helpers.convertSeconds(map.drain)}, Stars: ${map.stars}\n\u2003Status: ${map.status}`;
            if (map.status === "Screenshot Required") {
                let passes = (map.passes || []).length;
                let missing = 2 - passes;
                pool[map.pool] += ` - ${passes} submitted, ${missing} missing`;
            }
            pool[map.pool] += "\n";
        });
        // Put all the output strings together in order
        resultEmbed.addFields(
            ['nm', 'hd', 'hr', 'dt', 'cm'].map(m => ({
                name: modNames[m],
                value: pool[m]
            })).filter(f => f.value)
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

        return msg.channel.send(resultEmbed.setTimestamp());
    }
}