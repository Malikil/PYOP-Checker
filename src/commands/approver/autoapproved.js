const Discord = require('discord.js');
const db = require('../../database/db-manager');
const helpers = require('../../helpers/helpers');

module.exports = {
    name: "autoapproved",
    description: "Shows all maps with an auto accepted status. " +
        "These are the maps that PoolBot thinks we don't need to check.\n" +
        "Optionally limit to a specific mod combination.",
    permissions: [ process.env.ROLE_MAP_APPROVER ],
    args: [
        { arg: 'mods', required: false }
    ],
    alias: [ 'autoaccepted', 'automaps' ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { mods }) {
        const maplist = await db.findMapsWithStatus("Accepted (Automatic)");
        console.log(maplist);
            
        // Generate the output string
        let str = "";
        maplist.forEach(modpool => {
            if (!mods || mods.mods === modpool._id) {
                str += `**__${helpers.modString(modpool._id)}:__**\n`;
                modpool.maps.forEach(map => {
                    if (str.length < 1800)
                        str += `<${helpers.mapLink(map)}> ${helpers.mapString(map)}\n`;
                });
            }
        });
        // Display the string
        if (str.length >= 1800)
            str += "Message too long, some maps skipped...";
        return msg.channel.send(str || "No maps");
    }
}