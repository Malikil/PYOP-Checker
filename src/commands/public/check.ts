import { checkers } from '../../checkers';
import db from '../../database/db-manager';
import { Beatmap, Mods } from '../../types/bancho';
import { Message } from 'discord.js';
import { inspect } from 'util';
import { Command } from '../../types/types';

export default class implements Command {
    name = "check";
    description = "Checks whether a map would be allowed in a pool";
    args = [
        { arg: "map", required: true },
        { arg: "mods", required: false },
        { arg: "division", required: false }
    ];
    alias = [ "map" ];

    async run(msg: Message, { map, mods, division }: { map: number, mods: Mods, division: any }) {
        if (division)
            division = division.division;
        if (!mods)
            mods = Mods.None;
        console.log(`Checking map ${map} with mods ${mods} using ${division} division`);
        // If division is included, use that. Otherwise try to
        // get the division based on who sent the message
        if (!checkers[division])
        {
            let team = await db.getTeamByPlayerid(msg.author.id);
            if (team)
                division = team.division;
            else // Use the first division as default
                division = Object.keys(checkers)[0];
        }
        let beatmap = await Beatmap.buildFromApi(map, mods);
        if (!beatmap)
            return msg.channel.send(`Couldn't find map with id ${map}`);
        let check = await checkers[division].check(beatmap);
        console.log(`Rules check returned: ${inspect(check)}`);

        return msg.channel.send(`${division} division: ${check.message}`);
    }
}
