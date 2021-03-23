const google = require('../../gsheets');

module.exports = {
    name: "export",
    description: "Exports all current maps to google sheets",
    permissions: [ process.env.ROLE_ADMIN ],

    /**
     * @param {import('discord.js').Message} msg 
     */
    async run(msg) {
        msg.channel.send("Exporting maps");
        await google.exportAllMaps();
        console.log("Maps exported");
        return msg.channel.send("Maps exported");
    }
}