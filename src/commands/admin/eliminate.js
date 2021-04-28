const db = require('../../database/db-manager');
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
        await Promise.all(team.players.map(async player => {
            try {
                let member = members.cache.get(player.discordid);
                if (!member && player.discordid)
                        member = await members.fetch(player.discordid);

                // If the member isn't cached, attempt to fetch them
                Logger.log(`Removing ${playerRole} from ${member}`, "eliminate.js");

                if (member)
                    return member.roles.remove(playerRole);
            } catch (err) {
                console.log(typeof err);
                console.log(err);
            }
        }));
        
        return msg.channel.send(`Eliminated ${teamname}`);
    }
}