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
const google = require('./gsheets');

const APPROVER = process.env.ROLE_MAP_APPROVER;
const SCREENSHOTS = process.env.CHANNEL_SCREENSHOTS;

// There's probably a better way to do this, but for now I'm just using a
// global variable to store whether submissions are open or closed
var locked = false;

//#region Helper Functions
// ============================================================================
// ========================= Helper Functions =================================
// ============================================================================
const mapString = map => `${map.artist} - ${map.title} [${map.version}]`;
const mapLink = map => `https://osu.ppy.sh/b/${map.id}`;
function modString(mod)
{
    let str = '';
    if (mod & checker.MODS.HD)      str += 'HD';
    if (mod & checker.MODS.HR)      str += 'HR';
    else if (mod & checker.MODS.EZ) str += 'EZ';
    if (mod & checker.MODS.DT)      str += 'DT';
    else if (mod & checker.MODS.HT) str += 'HT';
    if (str == '')                  str = 'NoMod';
    return str;
}
/**
 * Converts a mod string into its number equivalent
 * @param {"NM"|"HD"|"HR"|"DT"|"EZ"|"HT"} modstr Mods in string form
 * @returns {number} The bitwise number representation of the selected mods
 */
function parseMod(modstr)
{
    let mod = 0;
    modstr = modstr.toUpperCase();
    // Parse mods
    if (modstr.includes('HD')) mod = mod | checker.MODS.HD;
    if (modstr.includes('HR')) mod = mod | checker.MODS.HR;
    else if (modstr.includes('EZ')) mod = mod | checker.MODS.EZ;
    if (modstr.includes('DT')) mod = mod | checker.MODS.DT;
    else if (modstr.includes('HT')) mod = mod | checker.MODS.HT;
    
    return mod;
}
/**
 * Gets a mod pool string from a mod combination
 * @param {number} bitwise The bitwise number representation of the mods
 */
function getModpool(bitwise)
{
    switch (bitwise)
    {
        case 0:               return "nm";
        case checker.MODS.HD: return "hd";
        case checker.MODS.HR: return "hr";
        case checker.MODS.DT: return "dt";
        default:              return "cm";
    }
}
//#endregion
//#region Public Commands
// ============================================================================
// ========================= Public Functions =================================
// ============================================================================
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
            "(Optional) mod should be some combination of HD|HR|DT|HT|EZ. Default is nomod, unrecognised items are ignored\n" +
            "Aliases: !map");
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
 * Displays the current week's star/length requirements
 * @param {Discord.Message} msg 
 */
async function viewRequirements(msg)
{
    let args = msg.content.split(' ');
    if (args[1] === '?')
        return msg.channel.send("Usage: !requirements\n" +
            "Displays the star rating and length requirements for " +
            "the current week\n" +
            "Aliases: !req");
    const minStar = process.env.MIN_STAR;   // Minimum star rating
    const maxStar = process.env.MAX_STAR;   // Maximum star rating
    const minLength = parseInt(process.env.MIN_LENGTH); // Minimum drain time
    const maxLength = parseInt(process.env.MAX_LENGTH); // Maximum drain time
    const absoluteMax = parseInt(process.env.ABSOLUTE_MAX); // Maximum length limit
    const minTotal = parseInt(process.env.MIN_TOTAL);       // Pool drain limit, per map
    const maxTotal = parseInt(process.env.MAX_TOTAL);       // Pool drain limit, per map
    const poolCount = 10; // 10 maps per pool
    let minPool = minTotal * poolCount;
    let maxPool = maxTotal * poolCount;
    const leaderboard = parseInt(process.env.LEADERBOARD);      // How many leaderboard scores are required for auto-approval

    return msg.channel.send("Requirements for this week:\n" +
        `Star rating: ${minStar} - ${maxStar}\n` +
        `Drain length: ${checker.convertSeconds(minLength)}` +
        ` - ${checker.convertSeconds(maxLength)}\n` +
        `   Total length must be less than ${checker.convertSeconds(absoluteMax)}\n` +
        `Total pool drain time must be ${checker.convertSeconds(minPool)}` +
        ` - ${checker.convertSeconds(maxPool)}\n\n` +
        `Maps with less than ${leaderboard} scores with the selected ` +
        `mod on the leaderboard will need to be submitted with a ` +
        `screenshot of one of the players on your team passing the map.\n` +
        `Maps without a leaderboard will always need a screenshot.`);
}
//#endregion
//#region Admin Commands
// ============================================================================
// ========================== Admin Functions =================================
// ============================================================================
/**
 * Adds a team to the database, requires Admin role
 * @param {Discord.Message} msg 
 */
async function addTeam(msg)
{
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
    if (await db.addPlayer(args[0], args[2], args[1].toLowerCase(), args[3]))
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
    let args = msg.content.split(' ');
    if (args.length != 2)
        return;

    if (args[1] == '?')
        return msg.channel.send("Removes a player from all teams they might be on.\n" +
            "!removePlayer osuname");
    
    console.log(`Removing ${args[1]}`);
    let result = await db.removePlayer(args[1].toLowerCase());
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
    
    if (await db.movePlayer(team, args[1].toLowerCase()))
        return msg.channel.send(`Moved ${args[1]} to ${team}`);
    else
        return msg.channel.send("Couldn't move player");
}

/**
 * Locks submissions for the week, makes an announcement to players as well
 * @param {Discord.Message} msg 
 */
async function lockSubmissions(msg)
{
    if (locked)
        return msg.channel.send("Submissions are already locked");

    locked = true;
    return msg.channel.send(
        'Pool submissions are now closed. If you have a map that gets ' +
        'rejected you will still have a chance to replace it.\n' +
        'Pools and schedules should be released sometime tomorrow.'
    );
}

/**
 * Pushes all maps for all teams to google sheets
 * @param {Discord.Message} msg 
 */
async function exportMaps(msg)
{
    let mapdata = await db.performAction(google.getSheetData);
    let rowdata = [];
    // Unwind team-specific rows into a big set of rows
    mapdata.forEach(item => 
        item.forEach(row => rowdata.push(row))
    );
    let response = await google.pushMaps(rowdata);
    // console.log(response);
    if (response.status === 200)
        msg.channel.send('Maps exported');
    else
        msg.channel.send(util.inspect(response, { depth: 4 }));
}
//#endregion
//#region Player Commands
// ============================================================================
// ========================== Player Commands =================================
// ============================================================================
/**
 * Adds a map to the players's team
 * @param {Discord.Message} msg 
 */
async function addMap(msg)
{
    let args = msg.content.split(' ');
    if (args.length < 2 || args.length > 3)
        return;
    else if (args[1] == '?')
        return msg.channel.send("Usage: !addmap <map> [mod]\n" +
        "map: A map link or beatmap id\n" +
        "(optional) mod: What mods to use. Should be some combination of " +
        "CM|HD|HR|DT|HT|EZ. Default is nomod, unrecognised items are ignored. " +
        "To add the map as a custom mod, include CM.\n" +
        "Aliases: !add\n\n" +
        "If there are already two maps in the selected mod pool, the first map " +
        "will be removed when adding a new one. To replace a specific map, " +
        "remove it first before adding another one.");
    // Get which team the player is on
    let team = await db.getTeam(msg.author.id);
    if (!team)
        return msg.channel.send("Couldn't find which team you're on");
    // Get osu id
    let osuid = team.players.find(item => item.discordid == msg.author.id).osuid;
    if (!osuid)
        console.warn("Team found but osu id was not");
    // Make sure submissions are open
    if (locked)
        return msg.channel.send("Submissions are currently locked. "+
            "Please wait until after pools are released before submitting next week's maps.\n" +
            "If you're submitting a replacement for a map that was rejected after submissions " +
            "closed, please send it to a Map Approver directly.");
    // Get beatmap information
    let mod = 0;
    let custom = false;
    if (args.length == 3)
    {
        let modstr = args[2].toUpperCase();
        // Parse mods
        if (modstr.includes('HD')) mod = mod | checker.MODS.HD;
        if (modstr.includes('HR')) mod = mod | checker.MODS.HR;
        else if (modstr.includes('EZ')) mod = mod | checker.MODS.EZ;
        if (modstr.includes('DT')) mod = mod | checker.MODS.DT;
        else if (modstr.includes('HT')) mod = mod | checker.MODS.HT;
        // Custom mod status
        if (modstr.includes('CM')
                || ((mod - 1) & mod) != 0)
            custom = true;
    }
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send(`Couldn't recognise beatmap id`);
    // Check beatmap approval
    console.log(`Looking for map with id ${mapid} and mod ${mod}`);
    let beatmap = await checker.getBeatmap(mapid, mod);
    let quick = checker.quickCheck(beatmap, osuid);
    let status;
    if (quick)
        return msg.channel.send(quick);
    else if (beatmap.approved == 1
            && await checker.leaderboardCheck(mapid, mod, osuid))
        status = "Accepted";
    else
        status = "Screenshot Required";
    
    // Get the mod pool this map is being added to
    let modpool;
    if (custom)                   modpool = "cm";
    else switch (mod)
        {
            case 0:               modpool = "nm"; break;
            case checker.MODS.HD: modpool = "hd"; break;
            case checker.MODS.HR: modpool = "hr"; break;
            case checker.MODS.DT: modpool = "dt"; break;
            default:              modpool = "cm"; break;
        }

    // Check if a map should be removed to make room for this one
    // If there's a rejected map, remove that one
    let rejectmap = team.maps[modpool].find(map => map.status.startsWith("Rejected"));
    if (rejectmap && team.maps[modpool].length > 1)
        await db.removeMap(team.name, rejectmap.id, modpool, rejectmap.mod);

    let mapitem = {
        id: mapid,
        status: status,
        drain: beatmap.hit_length,
        stars: beatmap.difficultyrating,
        bpm: beatmap.bpm,
        artist: beatmap.artist,
        title: beatmap.title,
        version: beatmap.version,
        creator: beatmap.creator
    };
    if (modpool == 'cm') mapitem.mod = mod;
    if (await db.addMap(team.name, modpool, mapitem))
        return msg.channel.send(`Added map ${mapString(mapitem)} ` +
            `to ${modpool.toUpperCase()} mod pool.\n` +
            `Map approval satus: ${status}`);
    else
        return msg.channel.send("Add map failed.");
}

/**
 * Adds a pass to a map in the player's team's pool
 * @param {Discord.Message} msg 
 * @param {Discord.TextChannel} channel Where to send the screenshot reply
 */
async function addPass(msg, channel)
{
    let args = msg.content.split(' ');
    if (args.length < 2 || args.length > 3)
        return;
    else if (args[1] == '?')
        return msg.channel.send("Usage: !addpass <map> [screenshot]\n" +
        "map: A map link or beatmap id\n" +
        "screenshot: A link to a screenshot of your pass on the map\n" +
        "Aliases: !pass");

    // Make sure there's something to update with
    if (args.length == 2)
        return msg.channel.send("Image attachments are not currently " +
            "supported. Please send as a link instead");

    // Get which team the player is on
    let team = await db.getTeam(msg.author.id);
    if (!team)
        return msg.channel.send("Couldn't find which team you're on");
    
    // Get the beatmap id
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send(`Couldn't recognise beatmap id`);

    // Update the status
    let result = await db.pendingMap(team.name, mapid, true);
    if (result == 1)
        msg.channel.send("Submitted new pass screenshot");
    else if (result == -1)
        return msg.channel.send("Couldn't update the map status");
    else
        msg.channel.send("Updated screenshot");

    // Copy the link/image to the screenshots channel
    return channel.send(`Screenshot for https://osu.ppy.sh/b/${mapid} from ${team.name}\n` +
        args[2]);
}

/**
 * Removes a map from a player's team's pool
 * @param {Discord.Message} msg 
 */
async function removeMap(msg)
{
    // Get args amd show help
    let args = msg.content.split(' ');
    if (args.length < 2 || args.length > 3)
        return;
    else if (args[1] == '?')
        return msg.channel.send("Usage: !removemap <map> [mod]\n" +
            "map: Beatmap link or id\n" +
            "(optional) mod: Which mod pool to remove the map from. Should be " +
            "some combination of NM|HD|HR|DT|CM. If left blank NM is assumed.\n" +
            "Aliases: !rem, !remove\n\n" +
            "If two identical maps are in the same mod bracket, both of them " +
            "will be removed. Ie in the same modpool or in custom mod using " +
            "the same mod combination. To replace just one of them you can use " +
            "the add map command instead. That will replace one map with the new one.");

    // Get which team the player is on
    let team = await db.getTeam(msg.author.id);
    if (!team)
        return msg.channel.send("Couldn't find which team you're on");

    // Get the beatmap id
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send(`Couldn't recognise beatmap id`);

    if (locked)
    {
        console.log("Submissions locked, asking confirmation");
        await msg.channel.send("Map submissions are locked. Any changes made now won't be " +
            "seen until the following pool. Do you still want to remove this map? (y/yes/n/no)");
        let err = "";
        let aborted = await msg.channel.awaitMessages(
            message => ['y', 'yes', 'n', 'no'].includes(message.content.toLowerCase()),
            { maxMatches: 1, time: 20000, errors: ['time'] }
        ).then(results => {
            console.log(results);
            let response = results.first();
            return ['n', 'no'].includes(response.content.toLowerCase());
        }).catch(reason => {
            console.log("Response timer expired");
            err = "Timed out. ";
            return true;
        });
        console.log(`Aborted? ${aborted}`);
        if (aborted)
            return msg.channel.send(err + "Map not removed");
    }
        

    // Get the mod pool and mods
    let mods;
    let modpool;
    if (args.length > 2)
    {
        mods = parseMod(args[2]);
        if (args[2].toUpperCase().includes("CM"))
            modpool = 'cm';
    }
    else
        mods = 0;
    if (!modpool)
        modpool = getModpool(mods);

    console.log(`Removing mapid ${mapid} from ${modpool}`);
    let result = await db.removeMap(team.name, mapid, modpool, mods);
    if (result)
    {
        // Find the map info for this id, for user friendliness' sake
        let map = team.maps[modpool].find(item => item.id == mapid);
        return msg.channel.send(`Removed ${mapString(map)} from ${modpool} pool`);
    }
    else
        return msg.channel.send("Map not found");
}

/**
 * Views all the maps in a player's pool
 * @param {Discord.Message} msg 
 */
async function viewPool(msg)
{
    let args = msg.content.split(' ');
    if (args.length > 3
            || !['!view', '!viewpool', '!list'].includes(args[0]))
        return;
    else if (args[1] === '?')
        return msg.channel.send("Usage: !viewpool [mod]\n" +
            "View maps in your pool and their statuses. " +
            "Optionally limit to a specific set of mods from NM|HD|HR|DT|CM\n" +
            "Aliases: !view, !list");
    
    // Get which team the player is on
    let team = await db.getTeam(msg.author.id);
    if (!team)
        return msg.channel.send("Couldn't find which team you're on");

    // Add all mods if not otherwise requested
    if (args.length == 3)
        args[2] = args[2].toUpperCase();
    else
        args[2] = "NMHDHRDTCM";

    let str = "";
    let pool = [];
    if (args[2].includes('NM'))
    {
        str += "**__No Mod:__**\n";
        team.maps.nm.forEach(item => {
            str += `${mapString(item)} <${mapLink(item)}>\n` +
                `\tDrain: ${checker.convertSeconds(item.drain)}, Stars: ${item.stars}, Status: ${item.status}\n`;
            pool.push(item);
        }); 
    }
    if (args[2].includes('HD'))
    {
        str += "**__Hidden:__**\n";
        team.maps.hd.forEach(item => {
            str += `${mapString(item)} <${mapLink(item)}>\n` +
                `\tDrain: ${checker.convertSeconds(item.drain)}, Stars: ${item.stars}, Status: ${item.status}\n`;
            pool.push(item);
        });
    }
    if (args[2].includes('HR'))
    {
        str += "**__Hard Rock:__**\n";
        team.maps.hr.forEach(item => {
            str += `${mapString(item)} <${mapLink(item)}>\n` +
                `\tDrain: ${checker.convertSeconds(item.drain)}, Stars: ${item.stars}, Status: ${item.status}\n`;
            pool.push(item);
        });
    }
    if (args[2].includes('DT'))
    {
        str += "**__Double Time:__**\n";
        team.maps.dt.forEach(item => {
            str += `${mapString(item)} <${mapLink(item)}>\n` +
                `\tDrain: ${checker.convertSeconds(item.drain)}, Stars: ${item.stars}, Status: ${item.status}\n`;
            pool.push(item);
        });
    }
    if (args[2].includes('CM'))
    {
        str += "**__Custom Mod:__**\n";
        team.maps.cm.forEach(item => {
            str += `${mapString(item)} +${modString(item.mod)} <${mapLink(item)}>\n` +
                `\tDrain: ${checker.convertSeconds(item.drain)}, Stars: ${item.stars}, Status: ${item.status}\n`;
            pool.push(item);
        });
    }

    // Check the pool as a whole
    let result = await checker.checkPool(pool);

    str += `\nTotal drain: ${checker.convertSeconds(result.totalDrain)}`;
    str += `\n${result.overUnder} maps are within 15 seconds of drain time limit\n`;
    if (result.message.length > 0)
        result.message.forEach(item => str += `\n${item}`);
    if (result.duplicates.length > 0)
    {
        str += "\nThe following maps were found more than once:";
        result.duplicates.forEach(dupe => str += `\n\t${mapString(dupe)}`);
    }

    return msg.channel.send(str);
}
//#endregion
//#region Approver Commands
// ============================================================================
// ======================== Approver Commands =================================
// ============================================================================
/**
 * Displays a list of all pending maps
 * @param {Discord.Message} msg 
 */
async function viewPending(msg)
{
    console.log("Finding pending maps");
    let teamlist = await db.findPendingTeams();
    console.log(teamlist);
    let hd = [], hr = [], dt = [], cm = [];
    let str = "**No Mod:**";
    teamlist.forEach(team => {
        team.maps.nm.forEach(map => {
            if (map.status == "Pending") str += `\n<${mapLink(map)}> ${mapString(map)}`;
        });
        team.maps.hd.forEach(map => {
            if (map.status == "Pending") hd.push(map);
        });
        team.maps.hr.forEach(map => {
            if (map.status == "Pending") hr.push(map);
        });
        team.maps.dt.forEach(map => {
            if (map.status == "Pending") dt.push(map);
        });
        team.maps.cm.forEach(map => {
            if (map.status == "Pending") cm.push(map);
        });
    });

    str += "\n**Hidden:**";
    hd.forEach(map => str += `\n<${mapLink(map)}> ${mapString(map)}`);
    str += "\n**Hard Rock:**";
    hr.forEach(map => str += `\n<${mapLink(map)}> ${mapString(map)}`);
    str += "\n**Double Time:**";
    dt.forEach(map => str += `\n<${mapLink(map)}> ${mapString(map)}`);
    str += "\n**Custom Mod:**";
    cm.forEach(map => str += `\n<${mapLink(map)}> ${mapString(map)} +${modString(map.mod)}`);

    return msg.channel.send(str);
}

/**
 * Approves a map
 * @param {Discord.Message} msg 
 */
async function approveMap(msg)
{
    // Split the arguments
    let args = msg.content.split(' ');

    if (args[1] == '?')
        return msg.channel.send("Usage: !approve <map> [mod]\n" +
            "Map: Map link or id to approve\n" +
            "(optional) mod: What mods are used. Should be some combination of " +
            "CM|HD|HR|DT|HT|EZ. Default is nomod, unrecognised items are ignored.\n" +
            "Aliases: !accept");

    if (args.length < 2 || args.length > 3)
        return;
    
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send("Map not recognised");
    
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
    let modpool;
    switch (mod)
    {
        case 0:               modpool = "nm"; break;
        case checker.MODS.HD: modpool = "hd"; break;
        case checker.MODS.HR: modpool = "hr"; break;
        case checker.MODS.DT: modpool = "dt"; break;
    }
    
    let count = await db.approveMap(mapid, modpool, mod);
    return msg.channel.send(`Approved maps for ${count} teams`);
}

/**
 * Rejects a map and provides a reason for rejection
 * @param {Discord.Message} msg 
 */
async function rejectMap(msg)
{
    // Split the arguments
    let args = msg.content.split(' ');
    
    if (args[1] == '?')
        return msg.channel.send("Usage: !reject <map> <mod> <message>\n" +
            "Map: Map link or id to reject\n" +
            "mod: What mods are used. Should be some combination of NM|CM|HD|HR|DT|HT|EZ." +
            " It is required even for nomod and items do need to be correct.\n" +
            "Message: A rejection message so the player knows why the map was rejected. " +
            "Including quotes around the message isn't required, everything after the " +
            "mod string will be captured.");

    if (args.length < 3)
        return;

    // Get the map, mod, and message
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send("Map not recognised");
    // Combine all the last arguments into the description
    let desc = "";
    while (args.length > 3)
        desc = args.pop() + " " + desc;
    
    let mod = parseMod(args[2]);
    if (mod === 0 && !args[2].toUpperCase().includes("NM"))
        return msg.channel.send(("Mod not recognised"));

    console.log(`Mod: ${mod}, Message: ${desc}`);
    
    // Require a reject message
    if (!desc)
        return msg.channel.send('Please add a reject message');

    let result = await db.rejectMap(mapid, mod, desc);
    return msg.channel.send(`Rejected ${mapid} +${modString(mod)} from ${result} pools`);
}
//#endregion
/**
 * Sends a list of available commands
 * @param {Discord.Message} msg 
 */
async function commands(msg)
{
    var info = "Available **Public** commands:\n!check, !help, !requirements";
    if (msg.member && msg.member.roles.has(APPROVER))
        info += "\nAvailable **Map Approver** commands:\n!pending, !approve, !reject";
    if (await db.getTeam(msg.author.id))
        info += "\nAvailable **Player** commands:\n!addmap, !removemap, !viewpool";
    info += "\n\nGet more info about a command by typing a ? after the name";
    return msg.channel.send(info);
}

module.exports = {
    checkMap,   // Public
    commands,
    viewRequirements,
    addTeam,    // Admins
    addPlayer,
    removePlayer,
    movePlayer,
    lockSubmissions,
    exportMaps,
    addMap,     // Maps
    addPass,
    removeMap,
    viewPool,
    viewPending,    // Map approvers
    approveMap,
    rejectMap
};
