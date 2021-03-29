const scheduler = require('../../database/scheduler');
const db = require('../../database/db-manager');
const util = require('util');

module.exports = {
    name: "played",
    description: "Adds a given time to the schedule knowledge base using " +
        "offsets from two given teams",
    permissions: [ process.env.ROLE_ADMIN ],
    args: [
        { arg: 'any', name: "team", description: "Team name", required: true },
        { arg: 'any', name: "team", description: "Team name", required: true },
        {
            arg: 'any',
            name: "time",
            description: "The time the team played at, in decimal hours form",
            required: true
        }
    ],

    /**
     * @param {import('discord.js').Message} msg 
     */
    async run(msg, { team, time }) {
        // Make sure time is in a valid format
        const timeval = parseFloat(time);
        if (isNaN(timeval) || timeval < 0 || timeval >= 24)
            return msg.channel.send("Invalid time given");
        
        const team1 = await db.getTeamByName(team[0]);
        const team2 = await db.getTeamByName(team[1]);
        if (!team1 || !team2)
            return msg.channel.send("Teams not found");
        
        // Get offsets
        const offsets = team1.players.map(p => p.utc)
            .concat(team2.players.map(p => p.utc));

        const result = await scheduler.setTime(offsets, timeval);
        return msg.channel.send(
            `Using offsets: ${util.inspect(offsets)}\n` +
            `\`\`\`\nOld time:\n${util.inspect(result.oldTime)}\n\n` +
            `New time:\n${util.inspect(result.newTime)}\n\`\`\``
        );
    }
}