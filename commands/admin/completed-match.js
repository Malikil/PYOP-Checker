const scheduler = require('../../database/scheduler');
const db = require('../../database/db-manager');
const util = require('util');
const Discord = require('discord.js');

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
     * @param {Discord.Message} msg 
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
            .concat(team2.players.map(p => p.utc))
            .reduce((arr, t) => {
                if (!arr.includes(t))
                    arr.push(t);
                return arr;
            }, []);

        const result = await scheduler.setTime(offsets, timeval);
        // Construct an embed for the result
        const embed = new Discord.MessageEmbed()
            .setTitle("Updated Scheduler Times")
            .setDescription(`Using offsets:\n${util.inspect(offsets)}`)
            .addField("Old Time", "```js\n" + util.inspect(result.oldTime) + "\n```")
            .addField("New Time", "```js\n" + util.inspect(result.newTime) + "\n```");

        return msg.channel.send(embed.setTimestamp());
    }
}