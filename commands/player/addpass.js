const Discord = require('discord.js');
const db = require('../../db-manager');
const helpers = require('../../helpers/helpers');

module.exports = {
    name: "addpass",
    description: "Adds a screenshot of a pass for one of your maps. " +
        "Mods should not be included, the map is only in your pool " +
        "once so link/id is enough to identify it.\n" +
        "You may upload the image directly to discord or include a link to your image.",
    args: [
        { arg: 'map', required: true },
        { arg: 'any', name: "link", description: "Link to screenshot of pass" }
    ],
    alias: [ 'pass' ],

    /**
     * @param {Discord.Message} msg 
     */
    async run(msg, { map, link }) {
        // Make sure there's something to update with
        if (msg.attachments.size === 0 && !(link && link.includes("http")))
            return msg.channel.send("Please include a link or image attachment");

        // Try to update the map status
        // Get which team the player is on
        const team = await db.getTeamByPlayerid(msg.author.id);
        if (!team)
            return msg.channel.send("Couldn't find team");

        const player = team.players.find(p => p.discordid === msg.author.id);
        // Make sure the map exists and needs a pass
        const beatmap = team.maps.find(m => m.bid === map);
        if (!beatmap)
            return msg.channel.send("Map not found");
        else if (beatmap.status.startsWith("Approved"))
            return msg.channel.send(`Screenshot for ${beatmap.bid} not required`);

        // Forward the screenshot to the screenshots channel
        const passChannel = msg.client.channels.cache.get(process.env.CHANNEL_SCREENSHOTS);
        let passReference;
        if (passChannel && passChannel.isText()) {
            if (msg.attachments.size > 0) {
                // Copy the attachment itself into the screenshots channel
                const attachment = msg.attachments.first();
                passReference = await passChannel.send(
                    `Screenshot for https://osu.ppy.sh/b/${map} from ${player.osuname}`,
                    attachment
                );
            }
            else
                // Copy the image link to the screenshots channel
                passReference = await passChannel.send(
                    `Screenshot for ${helpers.mapLink(beatmap)} from ${player.osuname}\n${link}`
                );
        }
        else
            return msg.channel.send(
                `Could not find screenshots channel. Found ${passChannel} (${process.env.CHANNEL_SCREENSHOTS}) instead.\n` +
                "This is not a good thing, please tell Malikil."
            );
        
        console.log(`addpass: Attempting to add ${player.osuname}'s screenshot for ${beatmap.bid}`);
        console.log(passReference.url);
        console.log(
            `Map has ${(beatmap.passes || []).length + 1} passes. ` +
            `Should it be set to pending? ${!!beatmap.passes && beatmap.passes.length > 0}`
        );
        // Update the status
        let result = await db.addScreenshot(
            player.discordid,
            beatmap.bid,
            passReference.url,
            beatmap.passes && beatmap.passes.length > 0
        );

        if (result)
            return msg.channel.send(`Added screenshot for ${helpers.mapString(beatmap)}`);
        else
            return msg.channel.send("Could not add screenshot");
    }
}