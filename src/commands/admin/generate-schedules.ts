import { Command } from "../../types/commands";
import { Message, MessageEmbed } from 'discord.js';
import db from '../../database/db-manager';
import { getTime, generateTimes } from '../../database/scheduler';
import { getParticipants, getOpenMatches, getNextMatches } from '../../challonge-manager';
import { LegacyDivision } from "../../types/divisions";

export default class implements Command {
    name = "generate-schedule";
    description = "Generates times for all pending matches in the given division";
    permissions = [ process.env.ROLE_ADMIN ];
    args = [
        { arg: 'division', required: true },
        {
            arg: "set",
            description: '"potential" if potential losers matches should be scheduled',
            required: false
        }
    ];
    alias = [ "schedgen" ];
    
    async run(msg: Message, { division, set }: { division: LegacyDivision, set: string }) {
        console.log(`Looking for matches from ${division.url}`);
        const matches = await getMatches(division.url, set === "potential");
        const teams = getParticipants(division.division);
        console.log(`Got ${matches.length} matches for ${teams.length} teams`);
        const dbTeams = await db.map(async t => t);
        const resultEmbed = new MessageEmbed()
            .setTitle(`Scheduling ${division.division} matches`)
            .setColor("#5555aa")
            .setFooter(`Found ${matches.length} matches`);
        const timestamp = t => {
            const hours = t | 0;
            const minutes = ((t - hours) * 60) | 0;
            return `${hours}:${minutes < 10 ? "0" : ""}${minutes}`;
        };

        await Promise.all(matches.map(async match => {
            // Find the participants
            const p1 = teams.find(t => t.id === match.player1Id);
            const p2 = teams.find(t => t.id === match.player2Id);
            const offsets = dbTeams.find(t => t.teamname === p1.name).players.map(p => p.utc)
                .concat(dbTeams.find(t => t.teamname === p2.name).players.map(p => p.utc));
            console.log(offsets);

            // Schedule the match
            const time = await getTime(offsets);
            if (time) {
                const range = time.stdev ?
                    ` ±${timestamp(time.stdev)}` :
                    "";
                return resultEmbed.addField(
                    `${match.suggestedPlayOrder}: (${p1.name}) vs (${p2.name})`,
                    `${timestamp(time.time)}${range}`,
                    true
                );
            }
            else {
                const generated = generateTimes(offsets);
                if (generated)
                    return resultEmbed.addField(
                        `${match.suggestedPlayOrder}: (${p1.name}) vs (${p2.name})`,
                        `${generated.start}:00 - ${generated.end}:00 UTC`,
                        true
                    );
                else
                    return resultEmbed.addField(
                        `${match.suggestedPlayOrder}: (${p1.name}) vs (${p2.name})`,
                        `Couldn't generate time for offsets ${offsets}`,
                        true
                    );
            }
        }));

        return msg.channel.send(resultEmbed);
    }
};

/**
 * @param div Division url
 * @param pending Should pending matches be found
 */
async function getMatches(div: string, pending: boolean): Promise<any[]> {
    if (!pending)
        return <Promise<any[]>>getOpenMatches(div);

    const pend = await getNextMatches(div)
        .then(pend => pend.filter(m =>
            // We only want the losers bracket potential matches
            !m.player1IsPrereqMatchLoser &&
            !m.player2IsPrereqMatchLoser &&
            m.round < 0
        ));
    
    // Create dummy matches based on the potential ones
    return pend.reduce((res, m) => {
        // Create four matches for each one match
        m.player1Id = m.player1PrereqMatch.player1Id;
        m.player2Id = m.player2PrereqMatch.player1Id;
        res.push({ ...m }); // P1 v P1
        m.player2Id = m.player2PrereqMatch.player2Id;
        res.push({ ...m }); // P1 v P2
        m.player1Id = m.player1PrereqMatch.player2Id;
        res.push({ ...m }); // P2 v P2
        m.player2Id = m.player2PrereqMatch.player1Id;
        res.push({ ...m }); // P2 v P1
        return res;
    }, []);
}