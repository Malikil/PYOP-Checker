/*
This module should contain all the commands from the discord bot. If the bot
will be connected to osu! irc at some point I'm not yet sure if those commands
should also be put here or in a different file.
*/
const Discord = require('discord.js');
const checker = require('./checker');
/**
 * Checks whether a given map would be accepted
 * @param {Discord.Message} msg The discord message starting with !check
 */
async function checkMap(msg)
{
    // Parse the map id from msg
    let args = msg.content.split(' ');
    if (args.length < 2 || args.length > 3)
        return msg.reply(`!check <map> [mod]
            Map should be a link or map id
            (Optional) mod should be one of HD/HR/DT/HT/EZ, leave blank for nomod`);
    
    if (args.length == 3)
        var mod = checker.MODS[args[2]] || 0;
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.reply(`Couldn't recognise beatmap id`);
    
    // Try to get the user id based on who sent the message
    console.log(`Message received from ${msg.author.id}`);

    let beatmap = checker.getBeatmap(mapid, mod);
    let quick = checker.quickCheck(beatmap);
    if (quick)
        return msg.reply(quick);
    return checker.leaderboardCheck(mapid, mod)
        .then(passed => {
            if (passed)
                return msg.reply("This map can be accepted automatically");
            else
                return msg.reply("This map would need to be manually approved");
        });
}

module.exports = {
    checkMap
};
