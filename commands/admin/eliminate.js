const db = require('../../db-manager');
const Logger = require('../../helpers/logger');
const util = require('util');

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
        //else if (team.eliminated)
            //return msg.channel.send(`${team.teamname} is already eliminated`);
        
        // Get the guild members for managing roles
        const guild = msg.guild;
        const members = guild.members;
        const playerRole = guild.roles.cache.get(process.env.ROLE_PLAYER);

        // Remove player role from the players
        await Promise.all(team.players.map(player => {
            const member = members.cache.get(player.discordid);
            Logger.log(`Removing ${playerRole} from ${member}`);
            console.log(util.inspect(member.roles.cache, false, 1, true));
            if (member) {
                return member.roles.remove(playerRole);
            }
        }));
        
        return msg.channel.send(`Eliminated ${teamname}`);
    }
}