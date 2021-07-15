import { Command } from "../../types/commands";
import { Message, MessageEmbed } from 'discord.js';
import db from '../../database/db-manager';
import { getTime, generateTimes } from '../../database/scheduler';

export default class implements Command {
    name = "schedule";
    description = "Finds a time for a match to happen";
    args = [
        { arg: "team", description: "Team name", required: true },
        { arg: "team", description: "Team name", required: true }
    ];
    
    async run(msg: Message, { team }: { team: string[] }) {
        const team1 = await db.getTeamByName(team[0]);
        const team2 = await db.getTeamByName(team[1]);
        if (!team1 || !team2)
            return msg.channel.send("Teams not found");

        const resultEmbed = new MessageEmbed()
            .setTitle("Generated Match Time")
            .addField(
                team1.teamname,
                team1.players.reduce((p, c) => `${p} ${c.utc || ''}`, '').trim(),
                true
            ).addField(
                team2.teamname,
                team2.players.reduce((p, c) => `${p} ${c.utc || ''}`, '').trim(),
                true
            );

        // Get offsets
        const offsets = team1.players.map(p => p.utc)
            .concat(team2.players.map(p => p.utc));

        const time = await getTime(offsets);
        console.log(time);
        if (time) {
            const timestamp = (t: number) => {
                const hours = t | 0;
                const minutes = ((t - hours) * 60) | 0;
                return `${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
            };
            // Only add a time range if enough matches have been played
            const range = time.stdev ?
                ` ±${timestamp(time.stdev)}` :
                "";
            resultEmbed.addField(
                "Scheduled Time",
                `${timestamp(time.time)}${range}`
            );
        }
        else {
            const generated = generateTimes(offsets);
            if (generated) 
                // Display the found time range
                resultEmbed.addField(
                    "Time Range",
                    `${generated.start}:00 - ${generated.end}:00 UTC`
                );
            else
                resultEmbed.addField(
                    "No Time Found",
                    "The UTC offsets given couldn't generate a time under the current " +
                        "restrictions. This match should probably be scheduled manually."
                );
        }

        return msg.channel.send(resultEmbed);
    }
}