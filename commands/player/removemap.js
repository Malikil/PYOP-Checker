const Discord = require('discord.js');
const db = require('../../db-manager');
const helpers = require('../../helpers/helpers');

module.exports = {
    name: "removemap",
    description: "Remove a map from your pool. " +
        "If there's more than one matching map the first one will be removed.",
    args: [
        { arg: 'map', required: true },
        { arg: 'mods', required: false }
    ],
    alias: [ 'remove', 'rem' ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { map, mods }) {
        // Get which team the player is on
        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Couldn't find team");

        // Make sure pools aren't closed
        const { lastClose, now } = helpers.closingTimes();
        // If it's less than 16 hours since closing
        if ((now - lastClose) < (1000 * 60 * 60 * 16))
            return msg.channel.send(
                "Pools are closed, please wait until pools release before " +
                "submitting new maps. If you are replacing a map which was " +
                "rejected please send your replacement to Malikil directly."
            );
        
        console.log(`Removing mapid ${map} +${mods}`);
        const result = await db.removeMap(team.teamname, map, mods);
        if (result)
        {
            // Find the map info for this id, for user friendliness' sake
            let removed = team.maps.find(item => 
                item.bid === map &&
                (mods === undefined || item.mods === mods)
            );
            return msg.channel.send(
                `Removed ${helpers.mapString(removed)} +${helpers.modString(removed.mods)}`
            );
        }
        else
            return msg.channel.send("Map not found");
    }
}