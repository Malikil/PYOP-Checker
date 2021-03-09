const db = require('../../database/db-manager');

module.exports = {
    name: "schedule",
    description: "Finds a time for a match to happen",
    args: [
        { arg: 'any', name: "playerid1", description: "Player on team 1", required: true },
        { arg: 'any', name: "playerid2", description: "Player on team 2", required: true }
    ],
    
    /**
     * 
     * @param {import('discord.js').Message} msg 
     */
    async run(msg, { playerid1, playerid2 }) {
        const team1 = await db.getTeamByPlayerid(playerid1);
        const team2 = await db.getTeamByPlayerid(playerid2);

        if (!team1 || !team2)
            return msg.channel.send("Teams not found");

        const str1 = team1.teamname + team1.players.reduce((p, c) => `${p} ${c.utc}`, '');
        const str2 = team2.teamname + team2.players.reduce((p, c) => `${p} ${c.utc}`, '');

        return msg.channel.send(`${str1}\n${str2}`);
    }
}