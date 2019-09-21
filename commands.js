/*
This module should contain all the commands from the discord bot. If the bot
will be connected to osu! irc at some point I'm not yet sure if those commands
should also be put here or in a different file.

Permissions should also be checked here. Ie if trying to add a team this module
needs to make sure the user has the proper permissions to do that.
*/
const Discord = require('discord.js');
const checker = require('./checker');
const db = require('./db-manager');
const util = require('util');

const ADMIN = process.env.ROLE_ADMIN;
const APPROVER = process.env.ROLE_MAP_APPROVER;

/**
 * Checks whether a given map would be accepted
 * @param {Discord.Message} msg The discord message starting with !check
 */
async function checkMap(msg)
{
    // Parse the map id from msg
    let args = msg.content.split(' ');
    if (args.length < 2 || args.length > 3)
        return;
    else if (args[1] == '?')
        return msg.channel.send("Usage: !check <map> [mod]\n" +
            "Map should be a link or map id\n" +
            "(Optional) mod should be some combination of HD|HR|DT|HT|EZ. Default is nomod, unrecognised items are ignored");
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
 * Adds a team to the database, requires Admin role
 * @param {Discord.Message} msg 
 */
async function addTeam(msg)
{
    if (!msg.member.roles.has(ADMIN))
        return msg.channel.send("This command is only available to admins");
    
    let args = msg.content.substr(9);
    if (args.length == 0)
        return;
    else if (args == '?')
        return msg.channel.send(`Adds a new team to the database`);
    
    let result = await db.addTeam(args);
    if (result === undefined)
        return msg.channel.send("A team with that name already exists");
    else if (result)
        return msg.channel.send(`Added team "${args}"`);
    else
        return msg.channel.send("Error while adding team");
}

/**
 * Adds a player to a team
 * @param {Discord.Message} msg 
 */
async function addPlayer(msg)
{
    if (!msg.member.roles.has(ADMIN))
        return msg.channel.send("This command is only available to admins");
    
    let args = msg.content.split(' ');
    if (args.length > 1 && args[1] == '?')
        return msg.channel.send("Adds a player to an existing team.\n" +
            "!addPlayer \"Team Name\" <osuname> <osuid> <discordid>");
    if (args.length < 5)
        return;

    // Remove the command argument, combining team name will require team to
    // be the first argument
    args.shift();

    // Making a note of possible regex
    // s.match(/(?:[^\s"]+|"[^"]*")+/g)
    // Recombine quoted team names
    if (args[0].startsWith('"'))
    {
        let team = args.shift();
        while (!args[0].endsWith('"'))
            team += " " + args.shift();
        team += " " + args.shift();
        args.unshift(team.substring(1, team.length - 1));
    }

    console.log(args);

    if (args.length != 4)
        return msg.channel.send("Incorrect number of arguments");

    // Make sure the player isn't already on a team
    await db.removePlayer(args[1]);

    // Add the player to the team
    if (await db.addPlayer(args[0], args[2], args[1], args[3]))
        return msg.channel.send("Player added");
    else
        return msg.channel.send("Couldn't add player");
}

/**
 * Removes a player from all the teams they're on
 * @param {Discord.Message} msg 
 */
async function removePlayer(msg)
{
    if (!msg.member.roles.has(ADMIN))
        return msg.channel.send("This command is only available to admins");
    
    let args = msg.content.split(' ');
    if (args.length != 2)
        return;

    if (args[1] == '?')
        return msg.channel.send("Removes a player from all teams they might be on.\n" +
            "!removePlayer osuname");
    
    console.log(`Removing ${args[1]}`);
    let result = await db.removePlayer(args[1]);
    if (result)
        return msg.channel.send(`Removed ${args[1]} from all teams`);
    else
        return msg.channel.send("Unable to remove player");
}

/**
 * Moves an existing player to a different team
 * @param {Discord.Message} msg 
 */
async function movePlayer(msg)
{
    if (!msg.member.roles.has(ADMIN))
        return msg.channel.send("This command is only available to admins");
    
    let args = msg.content.split(' ');
    if (args.length == 2 && args[1] == '?')
        return msg.channel.send("Moves an existing player to a different team.\n" +
            "!movePlayer <player> <Team Name>");
    else if (args.length < 3)
        return;

    // Recombine the team name into a single string
    let team = args[2];
    for (let i = 3; i < args.length; i++)
        team += " " + args[i];
    
    if (await db.movePlayer(team, args[1]))
        return msg.channel.send(`Moved ${args[1]} to ${team}`);
    else
        return msg.channel.send("Couldn't move player");
}

/**
 * Sends a list of available commands
 * @param {Discord.Message} msg 
 */
async function commands(msg)
{
    var info = "Available public commands:\n!check, !commands";
    if (msg.member.roles.has(APPROVER))
        info += "\n\nAvailable map approver commands:\nNone implemented yet!";
    info += "\n\nGet more info about a command by typing a ? after the name";
    return msg.channel.send(info);
}

module.exports = {
    checkMap,
    commands,
    addTeam,    // Teams/players
    addPlayer,
    removePlayer,
    movePlayer
};
