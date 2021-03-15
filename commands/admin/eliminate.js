const db = require('../../db-manager');
const Logger = require('../../helpers/logger');

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
        const team = await db.eliminateTeam(teamname);
        if (!team)
            return msg.channel.send("Could not find team");
        else if (team.eliminated)
            return msg.channel.send(`${team.teamname} is already eliminated`);
        
        // Get the guild members for managing roles
        const members = msg.guild.members;

        // Remove player role from the players
        const playerRole = process.env.ROLE_PLAYER;
        const promiseResults = team.players.map(player => {
            const member = members.cache.get(player.discordid);
            Logger.log(`Removing ${playerRole} from ${member}`);
            Logger.log(member);
            if (member) {
                return member.roles.remove(playerRole);
            }
        });

        // Mark the team as eliminated in the db
        promiseResults.push(msg.channel.send(`Eliminated ${teamname}`));
        return Promise.all(promiseResults);
    }
}