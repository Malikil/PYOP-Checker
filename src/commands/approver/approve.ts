import { Command } from "../../types/types";
import { Message } from 'discord.js';
import db from '../../database/db-manager';
import { Mods } from "../../types/bancho";

export default class implements Command {
    name = "approve";
    description = "Approve a map/mod combination. This will approve all " +
        "instances of the map, not just the ones with passes submitted.";
    permissions = [ process.env.ROLE_MAP_APPROVER ];
    args = [
        { arg: 'map', required: true },
        { arg: 'mods', required: false }
    ];
    alias = [ 'accept' ];

    async run(msg: Message, { map, mods }: { map: number, mods: Mods }) {
        if (!mods)
            mods = Mods.None;
        
        let result = await db.approveMap(map, mods);
        return msg.channel.send(`Approved maps for ${result} teams`);
    }
}