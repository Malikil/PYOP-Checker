import { Command } from "../../types/commands";
import { Message, MessageEmbed } from 'discord.js';
import { setTime } from '../../database/scheduler';
import db from '../../database/db-manager';
import { inspect } from 'util';

export default class implements Command {
    name = "played";
    description = "Adds a given time to the schedule knowledge base using " +
        "offsets from two given teams";
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        { arg: "team", description: "Team name", required: true },
        { arg: "team", description: "Team name", required: true },
        {
            arg: "time",
            description: "The time the team played at, in decimal hours form",
            required: true
        }
    ];

    async run(msg: Message, { team, time }: { team: string[], time: string }) {
        // Make sure time is in a valid format
        const timeval = parseFloat(time);
        if (isNaN(timeval) || timeval < 0 || timeval >= 24)
            return msg.channel.send("Invalid time given");
        
        const team1 = await db.getTeamByName(team[0]);
        const team2 = await db.getTeamByName(team[1]);
        if (!team1 || !team2)
            return msg.channel.send("Teams not found");
        
        // Get offsets
        const offsets = team1.players.map(p => p.utc)
            .concat(team2.players.map(p => p.utc))
            .reduce((arr, t) => {
                if (!arr.includes(t))
                    arr.push(t);
                return arr;
            }, []);

        const result = await setTime(offsets, timeval);
        // Construct an embed for the result
        const embed = new MessageEmbed()
            .setTitle("Updated Scheduler Times")
            .setDescription(`Using offsets:\n${inspect(offsets)}`)
            .addField("Old Time", "```js\n" + inspect(result.oldTime) + "\n```")
            .addField("New Time", "```js\n" + inspect(result.newTime) + "\n```");

        return msg.channel.send(embed.setTimestamp());
    }
}