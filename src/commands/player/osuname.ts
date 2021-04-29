import { Command } from "../../types/types";
import { Message } from 'discord.js';
import db from '../../database/db-manager';
import { Player } from '../../types/bancho';

export default class implements Command {
    name = "osuname";
    description = "Updates your osu username. Only works if you're a player.";

    async run(msg: Message) {
        // Get the player's current info
        const player = await db.getPlayer(msg.author.id);
        if (!player)
            return msg.channel.send("Couldn't find player");
        
        // Get the player's new info from the server
        const newp = await Player.buildFromApi(player.osuid);
        if (!newp)
            return msg.channel.send("Osu api returned null");
        
        // Update in the database
        let result = await db.updatePlayerName(player.osuid, newp.username);
        if (result)
            return msg.channel.send(`Updated name from ${player.osuname} to ${newp.username}`);
        else
            return msg.channel.send(`No updates made, found username: ${player.osuname}`);
    }
}