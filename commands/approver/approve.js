const Discord = require('discord.js');
const db = require('../../db-manager');

module.exports = {
    name: "approve",
    description: "Approve a map/mod combination. This will approve all " +
        "instances of the map, not just the ones with passes submitted.",
    permissions: [ process.env.ROLE_MAP_APPROVER ],
    args: [
        { arg: 'map', required: true },
        { arg: 'mods', required: false }
    ],
    alias: [ 'accept' ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { map, mods }) {
        if (!mods)
            mods = 0;
        
        let result = await db.approveMap(map, mods);
        return msg.channel.send(`Approved maps for ${result} teams`);
    }
}