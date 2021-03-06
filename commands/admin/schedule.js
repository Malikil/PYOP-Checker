const db = require('../../database/db-manager');
const scheduler = require('../../database/scheduler');
const Discord = require('discord.js');

module.exports = {
    name: "schedule",
    description: "Finds a time for a match to happen",
    args: [
        { arg: 'any', name: "team", description: "Team name", required: true },
        { arg: 'any', name: "team", description: "Team name", required: true }
    ],
    
    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { team }) {
        const team1 = await db.getTeamByName(team[0]);
        const team2 = await db.getTeamByName(team[1]);
        if (!team1 || !team2)
            return msg.channel.send("Teams not found");

        const resultEmbed = new Discord.MessageEmbed()
            .setTitle("Generated Match Time")
            .addField(
                team1.teamname,
                team1.players.reduce((p, c) => `${p} ${c.utc || ''}`, '').trim(),
                true
            ).addField(
                team2.teamname,
                team2.players.reduce((p, c) => `${p} ${c.utc || ''}`, '').trim(),
                true
            );

        // Get offsets
        const offsets = team1.players.map(p => p.utc)
            .concat(team2.players.map(p => p.utc));

        const time = await scheduler.getTime(offsets);
        console.log(time);
        if (time) {
            const timestamp = t => {
                const hours = t | 0;
                const minutes = ((t - hours) * 60) | 0;
                return `${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
            };
            // Only add a time range if enough matches have been played
            const range = time.stdev ?
                ` ±${timestamp(time.stdev)}` :
                "";
            resultEmbed.addField(
                "Scheduled Time",
                `${timestamp(time.time)}${range}`
            );
        }
        else {
            const generated = scheduler.generateTimes(offsets);
            if (generated) 
                // Display the found time range
                resultEmbed.addField(
                    "Time Range",
                    `${generated.start}:00 - ${generated.end}:00 UTC`
                );
            else
                resultEmbed.addField(
                    "No Time Found",
                    "The UTC offsets given couldn't generate a time under the current " +
                        "restrictions. This match should probably be scheduled manually."
                );
        }

        return msg.channel.send(resultEmbed.setTimestamp());
    }
}