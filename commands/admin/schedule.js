const db = require('../../database/db-manager');
const scheduler = require('../../database/scheduler');

module.exports = {
    name: "schedule",
    description: "Finds a time for a match to happen",
    args: [
        { arg: 'any', name: "team", description: "Team name", required: true },
        { arg: 'any', name: "team", description: "Team name", required: true }
    ],
    
    /**
     * 
     * @param {import('discord.js').Message} msg 
     */
    async run(msg, { team }) {
        const team1 = await db.getTeamByName(team[0]);
        const team2 = await db.getTeamByName(team[1]);

        if (!team1 || !team2)
            return msg.channel.send("Teams not found");

        const str1 = team1.teamname + team1.players.reduce((p, c) => `${p} ${c.utc}`, '');
        const str2 = team2.teamname + team2.players.reduce((p, c) => `${p} ${c.utc}`, '');

        // Get offsets
        const offsets = team1.players.map(p => p.utc)
            .concat(team2.players.map(p => p.utc));

        const time = await scheduler.getTime(offsets);
        console.log(time);
        let result = "No time available";
        if (time) {
            const timestamp = t => {
                const hours = t | 0;
                const minutes = Math.round((t - hours) * 60);
                return `${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
            }
            result = `Time: ${timestamp(time.time)} ±${timestamp(time.stdev)}`;
        }

        return msg.channel.send(`${str1}\n${str2}\n${result}`);
    }
}