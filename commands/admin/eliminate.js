const db = require('../../db-manager');

module.exports = {
    name: "eliminate",
    description: "Cleans up a team when they are eliminated",
    permissions: [ process.env.ROLE_ADMIN ],
    args: [
        {
            arg: 'any',
            name: "teamname",
            description: "The name of the eliminated team",
            required: true
        }
    ],

    /**
     * @param {import('discord.js').Message} msg 
     */
    async run(msg, { teamname }) {
        const team = await db.getTeamByName(teamname);
        if (!team)
            return msg.channel.send("Could not find team");
        
        // Get the guild members for managing roles
        const members = msg.guild.members;

        // Remove player role from the players
        const playerRole = process.env.ROLE_PLAYER;
        const promiseResults = team.players.map(player => {
            const member = members.cache.get(player.discordid);
            if (member)
                return member.roles.remove(playerRole);
        });

        // Mark the team as eliminated in the db
        promiseResults.push(db.eliminateTeam(teamname));
        promiseResults.push(msg.channel.send(`Eliminated ${teamname}`));
        return Promise.all(promiseResults);
    }
}