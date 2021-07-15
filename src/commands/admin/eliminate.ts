import { Command } from "../../types/commands";
import { Message } from 'discord.js';
import db from '../../database/db-manager';

export default class implements Command {
    name = "eliminate";
    description = "Cleans up a team when they are eliminated";
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        {
            arg: "teamname",
            description: "The name of the eliminated team",
            required: true
        }
    ];

    async run(msg: Message, { teamname }: { teamname: string }) {
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
                console.log(`eliminate.js - Removing ${playerRole} from ${member}`);

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