import { Command } from "../../types/commands";
import { MapStatus } from '../../types/database';
import { Message } from 'discord.js';
import { Beatmap, Mods } from '../../types/bancho';
import db from '../../database/db-manager';
import helpers from '../../helpers/helpers';

export default class implements Command {
    name = "manualadd";
    description = "Manually add a map to a player's pool, bypassing " +
        "checks and setting it as approved. This should only be used " +
        "for situations like when the bot is finding a different star " +
        "rating than what is shown in-game.";
    permissions = [ process.env.ROLE_MAP_APPROVER ];
    args = [
        { arg: 'playerid', required: true },
        { arg: 'map', required: true },
        { arg: 'mods', required: false }
    ];

    async run(msg: Message, { playerid, map, mods }: { playerid: string, map: number, mods: Mods }) {
        const team = await db.getTeamByPlayerid(playerid);
        if (!team)
            return msg.channel.send("Player not found");

        const beatmap = await Beatmap.buildFromApi(map, mods);
        if (!beatmap)
            return msg.channel.send("No beatmap found");
        
        let result = await db.addMap(team.teamname, beatmap.toDbBeatmap(MapStatus.Approved));
        if (result)
        {
            if (result !== true)
                return msg.channel.send(`Replaced ${helpers.mapString(result)}`);
            else
                return msg.channel.send("Added map");
        }
        else
            return msg.channel.send("Couldn't add map");
    }
}