const Discord = require('discord.js');

module.exports = {
    name: "manualadd",
    description: "Manually add a map to a player's pool, bypassing " +
        "checks and setting it as approved. This should only be used " +
        "for situations like when the bot is finding a different star " +
        "rating than what is shown in-game.",
    permissions: [ process.env.ROLE_MAP_APPROVER ],
    args: [
        { arg: 'playerid', required: true },
        { arg: 'map', required: true },
        { arg: 'mods', required: false }
    ],

    async run(msg, { playerid, map, mods }) {
        
    }
}