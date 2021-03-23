const Discord = require('discord.js');
const db = require('../../db-manager');
const helpers = require('../../helpers/helpers');

module.exports = {
    name: "pending",
    description: "Shows all maps with a pending status, waiting to " +
        "be approved. Optionally limit to a specific mod combination.",
    permissions: [ process.env.ROLE_MAP_APPROVER ],
    args: [
        { arg: 'mods', required: false }
    ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { mods }) {
        const maplist = await db.findMapsWithStatus("Pending");
        console.log(maplist);
            
        // Generate the output string
        let str = "";
        let skipped = 0;
        maplist.forEach(modpool => {
            if (!mods || mods.mods === modpool._id) {
                str += `**__${helpers.modString(modpool._id)}:__** (${modpool.maps.length})\n`;
                modpool.maps.forEach(map => {
                    if (str.length < 1500) {
                        str += `<${helpers.mapLink(map)}> ${helpers.mapString(map)}\n`
                        if (map.passes)
                            map.passes.forEach(pass => {
                                str += `    <${pass}>\n`;
                            });
                    }
                    else
                        skipped++;
                });
            }
        });
        // Display the string
        if (str.length >= 1500)
            str += `Message too long, ${skipped} maps skipped...`;
        return msg.channel.send(str || "No pending maps");
    }
}