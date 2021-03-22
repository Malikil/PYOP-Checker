const db = require('../../database/db-manager');

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

        return msg.channel.send(`${str1}\n${str2}`);
    }
}