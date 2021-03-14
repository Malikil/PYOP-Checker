const Discord = require('discord.js');
const { ApiBeatmap, DbBeatmap } = require('../../types');
const db = require('../../db-manager');
const helpers = require('../../helpers/helpers');

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

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { playerid, map, mods }) {
        const team = await db.getTeamByPlayerid(playerid);
        if (!team)
            return "Player not found";

        const beatmap = await ApiBeatmap.buildFromApi(map, mods.mods);
        if (!beatmap)
            return "No beatmap found";
        
        let result = await db.addMap(team.teamname, beatmap.toDbBeatmap("Approved", mods.pool));
        if (result)
        {
            if (result instanceof DbBeatmap)
                return msg.channel.send(`Replaced ${helpers.mapString(result)}`);
            else
                return msg.channel.send("Added map");
        }
        else
            return msg.channel.send("Couldn't add map");
    }
}