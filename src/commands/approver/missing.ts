import { Command, MapStatus } from "../../types/types";
import { Message } from 'discord.js';
import db from '../../database/db-manager';
import { inspect } from 'util';
import { LegacyDivision } from "../../types/divisions";
import helpers from "../../helpers/helpers";

const divInfo: LegacyDivision[] = require('../../../divisions.json');

export default class implements Command {
    name = "missing";
    description = "View a count of maps which are rejected or screenshot required.";
    permissions = [ process.env.ROLE_MAP_APPROVER ];

    async run(msg: Message) {
        const missing = await db.findMissingMaps();

        const counts: {
            [key: string]: { nm: number, hd: number, hr: number, dt: number, cm: number }
        } = {};
        divInfo.forEach(div =>
            counts[div.division] = {
                nm: 0,
                hd: 0,
                hr: 0,
                dt: 0,
                cm: 0
            }
        );
        missing.forEach(team => {
            // Add two maps for each pool
            counts[team.division].nm += 2;
            counts[team.division].hd += 2;
            counts[team.division].hr += 2;
            counts[team.division].dt += 2;
            counts[team.division].cm += 2;

            // Remove maps the team already has
            team.maps.forEach(map => {
                if (map.status !== MapStatus.Rejected)
                    counts[team.division][helpers.getModpool(map.mods)]--;
            });
        });

        // Return the results
        return msg.channel.send(`\`\`\`${inspect(counts)}\`\`\``);
    }
}