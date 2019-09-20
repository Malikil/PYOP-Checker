/*
This module should contain all the commands from the discord bot. If the bot
will be connected to osu! irc at some point I'm not yet sure if those commands
should also be put here or in a different file.
*/
const Discord = require('discord.js');
const checker = require('./checker');
const db = require('./db-manager');
const util = require('util');

/**
 * Checks whether a given map would be accepted
 * @param {Discord.Message} msg The discord message starting with !check
 */
async function checkMap(msg)
{
    // Parse the map id from msg
    let args = msg.content.split(' ');
    if (args.length < 2 || args.length > 3)
        return msg.channel.send(`Usage: !check <map> [mod]
            Map should be a link or map id
            (Optional) mod should be one of HD|HR|DT|HT|EZ, leave blank for nomod`);
    let mod = 0;
    if (args.length == 3)
    {
        let modstr = args[2].toUpperCase();
        // Parse mods
        if (modstr.includes('HD')) mod = mod | checker.MODS.HD;
        if (modstr.includes('HR')) mod = mod | checker.MODS.HR;
        else if (modstr.includes('EZ')) mod = mod | checker.MODS.EZ;
        if (modstr.includes('DT')) mod = mod | checker.MODS.DT;
        else if (modstr.includes('HT')) mod = mod | checker.MODS.HT;
    }
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send(`Couldn't recognise beatmap id`);
    console.log(`Checking map ${mapid} with mods ${mod}`);
    // Try to get the user id based on who sent the message
    let userid = await db.getOsuId(msg.author.id);

    let beatmap = await checker.getBeatmap(mapid, mod);
    let quick = checker.quickCheck(beatmap, userid);
    console.log(`Quick check returned: ${quick}`);
    if (quick)
        return msg.channel.send(quick);
    
    let passed = false;
    if (beatmap.approved == 1)
        passed = await checker.leaderboardCheck(mapid, mod, userid);
    if (passed)
        return msg.channel.send("This map can be accepted automatically");
    else
        return msg.channel.send("This map would need to be manually approved");
}

/**
 * Lists everything in the database for debugging purposes
 * @param {Discord.Message} msg 
 */
async function listDb(msg)
{
    let docs = await db.getAllDocuments();
    return msg.channel.send(util.inspect(docs, {
        maxArrayLength: 5,
        depth: 5
    }), {
        code: 'js'
    });
}

/**
 * Sends a list of available commands
 * @param {Discord.Message} msg 
 */
async function commands(msg)
{
    msg.channel.send(`Available commands are:
        !check, !commands`);
}

/**
 * @param {Discord.Message} msg 
 */
async function debug(msg)
{
    db.getOsuId(msg.author.id);
}

module.exports = {
    checkMap,
    listDb,
    commands,
    debug
};
