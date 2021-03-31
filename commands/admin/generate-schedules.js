const db = require('../../database/db-manager');
const scheduler = require('../../database/scheduler');
const Discord = require('discord.js');
const challonge = require('../../challonge-manager');

module.exports = {
    name: "generate-schedule",
    description: "Generates times for all pending matches in the given division",
    permissions: [ process.env.ROLE_ADMIN ],
    args: [{ arg: 'division', required: true }],
    alias: [ "schedgen" ],
    
    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { division }) {
        const matches = await challonge.getOpenMatches(division.url);
        const teams = challonge.getParticipants(division.division);
        const dbTeams = await db.map(async t => t);
        const resultEmbed = new Discord.MessageEmbed()
            .setTitle(`Scheduling ${division.division} matches`)
            .setColor("#5555aa")
            .setFooter(`Found ${matches.length} matches`);
        const timestamp = t => {
            const hours = t | 0;
            const minutes = ((t - hours) * 60) | 0;
            return `${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
        };

        await Promise.all(matches.map(async match => {
            // Find the participants
            const p1 = teams.find(t => t.id === match.player1Id);
            const p2 = teams.find(t => t.id === match.player2Id);
            const offsets = dbTeams.find(t => t.teamname === p1.name).players.map(p => p.utc)
                .concat(dbTeams.find(t => t.teamname === p2.name).players.map(p => p.utc));
            console.log(offsets);

            // Schedule the match
            const time = await scheduler.getTime(offsets);
            if (time) {
                const range = time.stdev ?
                    ` ±${timestamp(time.stdev)}` :
                    "";
                return resultEmbed.addField(
                    `${match.suggestedPlayOrder}: (${p1.name}) vs (${p2.name})`,
                    `${timestamp(time.time)}${range}`,
                    true
                );
            }
            else {
                const generated = scheduler.generateTimes(offsets);
                if (generated)
                    return resultEmbed.addField(
                        `${match.suggestedPlayOrder}: (${p1.name}) vs (${p2.name})`,
                        `${generated.start}:00 - ${generated.end}:00 UTC`,
                        true
                    );
                else
                    return resultEmbed.addField(
                        `${match.suggestedPlayOrder}: (${p1.name}) vs (${p2.name})`,
                        `Couldn't generate time for offsets ${offsets}`,
                        true
                    );
            }
        }));

        return msg.channel.send(resultEmbed.setTimestamp());
    }
};