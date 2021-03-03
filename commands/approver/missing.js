const Discord = require('discord.js');
const db = require('../../db-manager');
const divInfo = require('../../divisions.json');
const { inspect } = require('util');

module.exports = {
    name: "missing",
    description: "View a count of maps which are rejected or screenshot required.",
    permissions: [ process.env.ROLE_MAP_APPROVER ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg) {
        const missing = await db.findMissingMaps();

        const counts = {};
        divInfo.forEach(div =>
            counts[div.division] = {
                nm: 0,
                hd: 0,
                hr: 0,
                dt: 0,
                cm: 0
            }
        );
        missing.forEach(team => {
            // Add two maps for each pool
            counts[team.division].nm += 2;
            counts[team.division].hd += 2;
            counts[team.division].hr += 2;
            counts[team.division].dt += 2;
            counts[team.division].cm += 2;

            // Remove maps the team already has
            team.maps.forEach(map => {
                if (!map.status.startsWith("Rejected"))
                    counts[team.division][map.pool]--;
            });
        });

        // Return the results
        return msg.channel.send(`\`\`\`${inspect(counts)}\`\`\``);
    }
}