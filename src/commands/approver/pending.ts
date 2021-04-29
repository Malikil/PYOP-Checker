import { Command, MapStatus } from "../../types/types";
import { Message, MessageEmbed } from 'discord.js';
import db from '../../database/db-manager';
import helpers from '../../helpers/helpers';
import { Mods } from "../../types/bancho";

export default class implements Command {
    name = "pending";
    description = "Shows all maps with a pending status, waiting to " +
        "be approved. Optionally limit to a specific mod combination.";
    permissions = [ process.env.ROLE_MAP_APPROVER ];
    args = [
        { arg: 'mods', required: false }
    ];

    async run(msg: Message, { mods }: { mods: Mods }) {
        const maplist = await db.findMapsWithStatus(MapStatus.Pending);
        console.log(maplist);

        // Try using an embed here
        // It sounds like the maximum amount of characters across all field is 6k
        // I'm not sure if that includes json/etc structure characters or just
        // content characters. For now I'll assume content characters because they're
        // easier to count. Even though that's probably wrong.
        // Start the count with colour and title
        let skipped = 0;
        let total = 0;
        const pendingEmbed = new MessageEmbed();
        pendingEmbed
            .setColor("#a0ffff")
            .setTitle("Pending Maps")
            .addFields(
                maplist.filter(m => !mods || m._id === mods)
                    .map(modpool => {
                        // Update the total count
                        total += modpool.maps.length;
                        // Each pool can only have 1k characters
                        let poolChars = 0;
                        // Prepare the field for each modpool
                        const modstr = helpers.modString(modpool._id);
                        const mapstr = modpool.maps.reduce((s, map) => {
                            let str = "";
                            str += `[${helpers.mapString(map)}](${helpers.mapLink(map)}) ${map.bid}`;
                            if (map.passes)
                                map.passes.forEach((pass, i) =>
                                    str += ` [${i + 1}](${pass})`
                                );
                            str += "\n";
                            // If this map would put us above the character limit, don't do it
                            if (poolChars + str.length > 1024)
                                skipped++;
                            else {
                                s += str;
                                poolChars += str.length;
                            }
                            return s;
                        }, "");

                        // Create the field
                        return {
                            name: `${modstr} - ${modpool.maps.length}`,
                            value: mapstr.trim()
                        };
                    })
            );
        if (skipped > 0)
            pendingEmbed.setFooter(`${total} maps - ${skipped} maps skipped`);
            
        return msg.channel.send(pendingEmbed);
    }
}