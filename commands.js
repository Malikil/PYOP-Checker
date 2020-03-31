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
const MAP_COUNT = 10;

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
    let _dt = false;
    let str = '';
    if (mod & checker.MODS.HD)      str += 'HD';
    if (mod & checker.MODS.DT)      _dt = true;
    else if (mod & checker.MODS.HT) str += 'HT';
    if (mod & checker.MODS.HR)      str += 'HR';
    else if (mod & checker.MODS.EZ) str = 'EZ' + str;
    if (_dt)                        str += 'DT';
    if (str == '')                  str = 'NoMod';
    return str;
}
/**
 * Converts a mod string into its number equivalent
 * @param {"NM"|"HD"|"HR"|"DT"|"EZ"|"HT"} modstr Mods in string form. Case insensitive
 * @returns The bitwise number representation of the selected mods
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

/**
 * Silently waits for an undo command, and if it's received the team 
 * state will be restored to the given one
 * @param {Discord.Message} msg 
 * @param {*} team 
 */
async function waitForUndo(msg, team)
{
    let undo = await getConfirmation(msg, '', ['!undo'], []);
    if (!undo.aborted)
    {
        db.setTeamState(team);
        msg.channel.send("Reset maps to previous state");
    }
}

/**
 * Will ask for confirmation in the channel of a received message,
 * from the user who sent that message
 * @param {Discord.Message} msg 
 * @param {string} prompt
 */
async function getConfirmation(msg, prompt = undefined, accept = ['y', 'yes'], reject = ['n', 'no'])
{
    // Prepare the accept/reject values
    let waitFor = accept.concat(reject);
    let waitForStr = waitFor.reduce((p, v) => p + `/${v}`, "").slice(1);
    if (prompt)
        await msg.channel.send(`${prompt} (${waitForStr})`);
    let err = "";
    let aborted = await msg.channel.awaitMessages(
        message => message.author.equals(msg.author)
            && waitFor.includes(message.content.toLowerCase()),
        { maxMatches: 1, time: 10000, errors: ['time'] }
    ).then(results => {
        console.log(results);
        let response = results.first();
        return reject.includes(response.content.toLowerCase());
    }).catch(reason => {
        console.log("Response timer expired");
        err = "Timed out. ";
        return true;
    });
    console.log(`Aborted? ${aborted}`);
    return {
        aborted,
        err
    };
}
//#endregion
//#region Public Commands
// ============================================================================
// ========================= Public Functions =================================
// ============================================================================
/**
 * Checks whether a given map would be accepted
 * @param {Discord.Message} msg The discord message starting with !check
 * @param {string[]} args
 */
async function checkMap(msg, args)
{
    if (args.length < 2 || args.length > 4)
        return;
    else if (args[1] == '?')
        return msg.channel.send("Usage: !check <map> [mod] [division]\n" +
            "Map: Should be a link or map id\n" +
            "(Optional) Mod: Should be some combination of HD|HR|DT|HT|EZ. Default is NoMod\n" +
            "(Optional) Division: Open or 15k. If left out will try to find which team you're " +
            "on, or use open division if it can't." +
            "Aliases: !map");
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send(`Couldn't recognise beatmap id`);
    
    let mod = 0;
    if (args.length > 2)
        mod = parseMod(args[2]);
    console.log(`Checking map ${mapid} with mods ${mod}`);
    // If division is included, use that. Otherwise try to
    // get the division based on who sent the message
    let lowdiv = false;
    let userid;
    if (args.length === 4)
        lowdiv = args[3] === "15k";
    else
    {
        let team = await db.getTeam(msg.author.id);
        if (team)
        {
            lowdiv = team.division === "15k";
            userid = team.players.find(p => p.discordid === msg.author.id).osuid;
        }
    }
    let beatmap = await checker.getBeatmap(mapid, mod);
    let quick = checker.quickCheck(beatmap, userid, lowdiv);
    console.log(`Quick check returned: ${quick}`);
    if (quick)
        return msg.channel.send(quick);
    
    let status = {
        passed: false,
        message: "Map isn't ranked"
    };
    if (beatmap.approved == 1)
        status = await checker.leaderboardCheck(mapid, mod, userid);
    if (status.passed)
        return msg.channel.send("This map can be accepted automatically");
    else
        return msg.channel.send("This map would need to be manually approved:\n" +
            status.message);
}

/**
 * Displays the current week's star/length requirements
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function viewRequirements(msg, args)
{
    // Make sure the first argument is actually the command.
    if (!['!req', '!requirements'].includes(args[0]))
        return;
    // Ignore if the command has too many args
    if (args.length > 2)
        return;
    
    if (args[1] === '?')
        return msg.channel.send("Usage: !requirements\n" +
            "Displays the star rating and length requirements for " +
            "the current week\n" +
            "Aliases: !req");
    
    const minStar = process.env.MIN_STAR;   // Minimum star rating
    const maxStar = process.env.MAX_STAR;   // Maximum star rating
    const lowMin = process.env.FIFT_MIN;
    const lowMax = process.env.FIFT_MAX;
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
        `Star rating:\n` +
        `    Open: ${minStar} - ${maxStar}\n` +
        `    15K: ${lowMin} - ${lowMax}\n` +
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

/**
 * Displays all teams currently registered, and the players on them
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function viewTeamPlayers(msg, args)
{
    if (args.length > 2 || (args[0] !== "!players" && args[0] !== "!teams"))
        return;
    if (args.length === 2)
        if (args[1] === '?')
            return msg.channel.send("Usage: !teams [open|15k]\n" +
                "Optionally limit to a division by specifying 'open' or '15k'\n" +
                "Shows the currently registered teams and players on those teams\n" +
                "Aliases: !players");
        else if (args[1] !== "open" && args[1] !== "Open"
                && args[1] !== "15k" && args[1] !== "15K")
            return;
    // Continue if args.length == 1
    // Create the tables
    var openname = 0;
    var fiftname = 0;
    let result = await db.performAction(async function(team) {
        let teaminfo = [];
        teaminfo.push(team.name);
        if (team.division === "Open" && team.name.length > openname)
            openname = team.name.length;
        else if (team.division === "15k" && team.name.length > fiftname)
            fiftname = team.name.length;
        team.players.forEach(player => teaminfo.push(player.osuname));
        return {
            range: team.division,
            info: teaminfo
        };
    });

    var openstr = "```\n";
    var fiftstr = "```\n";
    result.forEach(team => {
        // Prepare the current string
        let tname = team.info.shift();
        let tempstr = `${tname.padEnd(
            team.range === "Open"
            ? openname
            : fiftname, ' ')} | `;
        if (team.info.length > 0)
        {
            team.info.forEach(player => tempstr += `${player}, `);
            tempstr = tempstr.substring(0, tempstr.length - 2);
        }

        if (team.range === "Open")
            openstr += `\n${tempstr}`;
        else
            fiftstr += `\n${tempstr}`;
    });
    // Decide which table to include
    if (args[1] === "open" || args[1] === "Open")
        return msg.channel.send(`**Open division:**${openstr}\`\`\``);
    else if (args[1] === "15k" || args[1] === "15K")
        return msg.channel.send(`**15k division:**${fiftstr}\`\`\``);
    else
    {
        await msg.channel.send(`**Open division:**${openstr}\`\`\``);
        return msg.channel.send(`**15k division:**${fiftstr}\`\`\``);
    }
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
    
    let result = await db.addTeam(args, "Open");
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
 * @param {string[]} args
 */
async function addPlayer(msg, args)
{
    if (args[1] === '?')
        return msg.channel.send("Adds a player to an existing team.\n" +
            "!addPlayer \"Team Name\" (<osu name/id> <discordid/@>)...");
    if (args.length < 4)
        return;

    // Remove the command argument, combining team name will require team to
    // be the first argument
    args.shift();
    var team = args.shift();
    console.log(args);

    if (args.length % 2 !== 0)
        return msg.channel.send("Incorrect number of arguments");

    // There can be more than one player per command
    // args will come in pairs, osuid first then discordid
    let results = [];
    for (let i = 0; i < args.length; i += 2)
    {
        // Get the player's discord id
        let matches = args[i + 1].match(/[0-9]+/);
        if (!matches)
        {
            if (args[i + 1] === '_')
            {
                // Special case for adding players without a discord id
                console.log(`Adding player without discord`);
                let player = await checker.getPlayer(args[i]);
                if (!player)
                    results.push(0);
                else
                    results.push(await db.addPlayer(team, player.user_id, player.username, undefined));
                continue;
            }
            else
                results.push(0);
            continue;
        }
        let discordid = matches[0];
        // Make sure the player isn't already on a team
        // If the player is already on a team, move them to the new one
        if (await db.getTeam(discordid))
        {
            if (await db.movePlayer(team, args[i]) > 0)
                results.push(1);
        }
        else
        {
            // Get the player info from the server
            let player = await checker.getPlayer(args[i]);
            if (!player)
                results.push(0);
            else
                results.push(await db.addPlayer(team, player.user_id, player.username, discordid));
        }
    }
    // Figure out what the results mean
    let modified = results.reduce((prev, item) => prev + item, 0);
    return msg.channel.send(`Added ${modified} players`);
}

/**
 * Removes a player from all the teams they're on
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function removePlayer(msg, args)
{
    if (args.length !== 2)
        return;

    if (args[1] === '?')
        return msg.channel.send("Removes a player from all teams they might be on.\n" +
            "!removePlayer osuname");
    
    console.log(`Removing ${args[1]}`);
    let result = await db.removePlayer(args[1]);
    return msg.channel.send(`Removed ${args[1]} from ${result} teams`);
}

/**
 * Moves an existing player to a different team
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function movePlayer(msg, args)
{
    if (args.length === 2 && args[1] === '?')
        return msg.channel.send("Moves an existing player to a different team.\n" +
            "!movePlayer <player> <Team Name>");
    else if (args.length !== 3)
        return;
    
    if (await db.movePlayer(args[2], args[1]))
        return msg.channel.send(`Moved ${args[1]} to ${args[2]}`);
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
    return msg.channel.send("Pools locked.");
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

/**
 * Runs through all pools and updates statuses for maps.  
 * Ie this is used at the beginning of a new week, it will make sure the old maps
 * still meet star requirements.
 * @param {Discord.Message} msg 
 */
async function recheckMaps(msg)
{
    let update = async function (team) {
        // Check each map with the quick check.
        // It shouldn't require hitting the osu api, and all the required info
        // should already exist in the beatmap object.
        let rejects = [];
        console.log(`${team.name} is in ${team.division} bracket`);
        team.maps.forEach(map => {
            let result = checker.quickCheck(map, null, team.division === "15k");
            if (result)
                rejects.push({
                    id: map.id,
                    mod: map.mod
                });
            });
        return {
            division: team.division,
            rejects: rejects
        };
    };
    // Use the quick check from above on each database team
    let results = await db.performAction(update);
    // Results should be an array of arrays. Each inner array having rejects 
    // from one team.
    // Unwind the results arrays into a single array
    let openrejects = [];
    let fiftrejects = [];
    results.forEach(team => {
        if (team.division === "15k")
            team.rejects.forEach(reject => {
                if (!fiftrejects.includes(reject))
                    fiftrejects.push(reject);
            });
        else
            team.rejects.forEach(reject => {
                if (!openrejects.includes(reject))
                    openrejects.push(reject);
            });
    });
    console.log("Open rejects:");
    console.log(openrejects);
    console.log("15k rejects:");
    console.log(fiftrejects);
    // Update each map from the results with a reject message
    // Don't bother updating if there are no maps needed to update
    let updateCount = 0;
    if (openrejects.length === 0 && fiftrejects.length === 0)
        return msg.channel.send("No maps outside range");
    if (openrejects.length > 0)
        updateCount += await db.bulkReject(openrejects, "Map is below the new week's star range", "Open");
    if (fiftrejects.length > 0)
        updateCount += await db.bulkReject(fiftrejects, "Map is below the new week's star range", "15k");
    
    if (updateCount)
        return msg.channel.send(`Updated ${updateCount} teams`);
    else
        return msg.channel.send("No teams updated");
}
//#endregion
//#region Player Commands
// ============================================================================
// ========================== Player Commands =================================
// ============================================================================
/**
 * Updates the osu name of a given player
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function updatePlayerName(msg, args)
{
    // One arg updates themself, two updates the tagged user
    if (args[0] !== "!osuname" || args.length > 2)
        return;
    // Help message
    if (args[1] === "?")
        return msg.channel.send("Usage: !osuname\n" +
            "Updates your osu username if you've changed it");
    // Get the discord id to look for
    let discordid;
    if (args.length === 2)
    {
        let matches = args[1].match(/[0-9]+/);
        if (!matches)
        {
            console.log("Discord id not recognised. Exiting silently");
            return;
        }
        discordid = matches.pop();
    }
    else
        discordid = msg.author.id;
    // Get the player's current info
    let team = await db.getTeam(discordid);
    if (!team)
        return msg.channel.send("Couldn't find which team you're on");
    let player = team.players.find(p => p.discordid == discordid);
    // Get the player's new info from the server
    let newp = await checker.getPlayer(player.osuid);
    // Update in the database
    let result = await db.updatePlayer(discordid, newp.username);
    if (result)
        return msg.channel.send(`Updated name from ${player.osuname} to ${newp.username}`);
    else
        return msg.channel.send(`No updates made, found username: ${newp.username}`);
}

/**
 * Adds a map to the players's team
 * @param {Discord.Message} msg 
 * @param {Discord.TextChannel} channel Where any attached screenshots should be sent
 * @param {string[]} args
 */
async function addMap(msg, channel, args)
{
    if (args.length < 2 || args.length > 3)
        return;
    else if (args[1] === '?')
        return msg.channel.send("Usage: !add <map> [mod]\n" +
        "map: A map link or beatmap id\n" +
        "(optional) mod: What mods to use. Should be some combination of " +
        "CM|HD|HR|DT|HT|EZ. Default is nomod, unrecognised items are ignored. " +
        "To add the map as a custom mod, include CM.\n" +
        "You may optionally attach a screenshot to automatically use that as " +
        "your pass. It must be as an attachment, to use a separate link use " +
        "the !addpass command.\n" +
        "Aliases: !addmap\n\n" +
        "If there are already two maps in the selected mod pool, the first map " +
        "will be removed when adding a new one. To replace a specific map, " +
        "remove it first before adding another one.\n" +
        "If you make a mistake you can use `!undo` within 10 seconds to " +
        "return your maps to how they were before.");
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
            "closed, please send it to Malikil directly.");
    // Get beatmap information
    let mod = 0;
    let custom = false;
    if (args.length == 3)
    {
        mod = parseMod(args[2]);
        // Custom mod status
        if (args[2].toUpperCase().includes('CM')
                || ((mod - 1) & mod) != 0)
            custom = true;
    }
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send(`Couldn't recognise beatmap id`);
    // Check beatmap approval
    console.log(`Looking for map with id ${mapid} and mod ${mod}`);
    let beatmap = await checker.getBeatmap(mapid, mod);
    let quick = checker.quickCheck(beatmap, osuid, team.division === "15k");
    let status;
    if (quick)
        return msg.channel.send(quick);
    else if ((await checker.leaderboardCheck(mapid, mod, osuid)).passed)
        if (beatmap.approved == 1 && beatmap.version !== "Aspire")
            status = "Accepted";
        else
            status = "Pending"
    else
    {
        // Check here for if there's a screenshot attached.
        if (msg.attachments.size === 0)
            status = "Screenshot Required";
        else
        {
            // Copy to the screenshots channel, and status is pending
            let attach = msg.attachments.first();
            let nAttach = new Discord.Attachment(attach.url, attach.filename);
            channel.send(`Screenshot for https://osu.ppy.sh/b/${mapid} from ${team.name}\n`,
                nAttach);
            status = "Pending";
        }
    }
    
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
    // We need the first rejected map, and a count of maps in the modpool
    let rejected;
    let count = team.maps.reduce((n, m) => {
        if (m.pool === modpool)
        {
            if (!rejected && m.status.startsWith("Rejected"))
                rejected = m;
            return n + 1;
        }
        else return n;
    }, 0);
    if (rejected && count > 1)
        await db.removeMap(team.name, rejected.id, rejected.pool, rejected.mod);

    let mapitem = {
        id: mapid,
        status: status,
        drain: beatmap.drain,
        stars: beatmap.stars,
        bpm: beatmap.bpm,
        artist: beatmap.artist,
        title: beatmap.title,
        version: beatmap.version,
        creator: beatmap.creator,
        mod: mod,
        pool: modpool
    };
    let replaced = await db.addMap(team.name, mapitem);
    if (replaced)
    {
        // Check here whether to include a replaced map message
        let rep = "";
        if (rejected)
            rep = `Replaced ${mapString(rejected)}\n`;
        else if (isNaN(replaced))
            rep = `Replaced ${mapString(replaced)}\n`;

        // Prepare the current pool state
        let cur = `Current __${modString(mod)}__ maps:\n`;
        team.maps.forEach(m => {
            if (m.mod === mod)
            {
                // Make sure it's not the removed map
                if ((replaced
                        ? m.id !== replaced.id
                        : true)
                    && (rejected
                        ? m.id !== rejected.id
                        : true))
                    cur += `${mapString(m)}${m.pool === 'cm' ? " CM" : ""}\n`;
            }
        });
        // Add the newly added map
        cur += `${mapString(mapitem)}${modpool === 'cm' ? " CM" : ""}`;
        
        // Send status and current pool info
        await msg.channel.send(`${rep}Added map ${mapString(mapitem)} ` +
            `to ${modpool.toUpperCase()} mod pool.\n` +
            `Map approval satus: ${status}\n${cur}`);

        // Check for an undo command
        return waitForUndo(msg, team);
    }
    else
        return msg.channel.send("Add map failed.");
}

/**
 * Adds multiple maps at once
 * @param {Discord.Message} msg 
 */
async function addBulk(msg)
{
    if (msg.content[9] === '?')
        return msg.channel.send("Use !addbulk, then include map id/links and mods one per line. eg:\n" +
            "    !addbulk <https://osu.ppy.sh/b/8708> NM\n    <https://osu.ppy.sh/b/8708> HD\n" +
            "    <https://osu.ppy.sh/b/75> HR\n    <https://osu.ppy.sh/b/8708> DT\n");
    // Get the user
    let team = await db.getTeam(msg.author.id);
    if (!team)
        return msg.channel.send("Couldn't find which team you're on");
    console.log(`Found team ${team.name}`);
    let osuid = team.players.find(p => p.discordid === msg.author.id).osuid;
    console.log(`Found osuid ${osuid}`);
    // Skip over the !addbulk command and split into lines
    let lines = msg.content.substr(9).split('\n');
    console.log(lines);
    let added = await lines.reduce(async (count, line) => {
        // Split by spaces
        let lineargs = line.split(' ');
        console.log(`Adding map ${lineargs}`);
        if (lineargs.length < 2)
            return count;
        // Determine whether the first arg is a link or a mod
        let id = checker.parseMapId(lineargs[0]);
        let mod, custom;
        if (id)
        {
            mod = parseMod(lineargs[1]);
            custom = lineargs[1].toUpperCase().includes("CM");
        }
        else
        {
            mod = parseMod(lineargs[0]);
            custom = lineargs[0].toUpperCase().includes("CM");
            id = checker.parseMapId(lineargs[1]);
        }
        console.log(`Found id: ${id}, mods: ${mod}`);
        if (!id)
            return count;
        // Prepare and check map
        let beatmap = await checker.getBeatmap(id, mod);
        let quick = checker.quickCheck(beatmap, osuid, team.division === "15k");
        if (quick)
            return count;
        let status;
        if ((await checker.leaderboardCheck(id, mod, osuid)).passed)
            if (beatmap.approved == 1 && beatmap.version !== "Aspire")
                status = "Accepted";
            else
                status = "Pending"
        else
            status = "Screenshot Required";
        let pool;
        if (custom)                   pool = "cm";
        else switch (mod)
            {
                case 0:               pool = "nm"; break;
                case checker.MODS.HD: pool = "hd"; break;
                case checker.MODS.HR: pool = "hr"; break;
                case checker.MODS.DT: pool = "dt"; break;
                default:              pool = "cm"; break;
            }
        let mapitem = {
            id, status,
            drain: beatmap.drain,
            stars: beatmap.stars,
            bpm: beatmap.bpm,
            artist: beatmap.artist,
            title: beatmap.title,
            version: beatmap.version,
            creator: beatmap.creator,
            mod, pool
        };
        // Add map
        let added = await db.addMap(team.name, mapitem);
        if (added)
            return (await count) + 1;
        else
            return count;
    }, Promise.resolve(0));
    msg.channel.send(`Added ${added} maps`);
}

/**
 * Adds a pass to a map in the player's team's pool
 * @param {Discord.Message} msg 
 * @param {Discord.TextChannel} channel Where to send the screenshot reply
 * @param {string[]} args
 */
async function addPass(msg, channel, args)
{
    if (args.length < 2 || args.length > 3)
        return;
    else if (args[1] == '?')
        return msg.channel.send("Usage: !addpass <map> [screenshot]\n" +
        "map: A map link or beatmap id\n" +
        "screenshot: A link to a screenshot of your pass on the map\n" +
        "You can upload your screenshot as a message attachment in discord " +
        "instead of using a link if you prefer. You still need to include " +
        "the map link/id regardless.\n" +
        "Aliases: !pass");

    // Make sure there's something to update with
    if (args.length == 2 && msg.attachments.size == 0)
        return msg.channel.send("Please include a link or image attachment");

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

    // Forward the screenshot to the proper channel
    // Always include the attachment if there is one
    if (msg.attachments.size > 0)
    {
        let attach = msg.attachments.first();
        let attachment = new Discord.Attachment(attach.url, attach.filename);
        return channel.send(`Screenshot for https://osu.ppy.sh/b/${mapid} from ${team.name}\n` +
            (args[2] || ""), attachment);
    }
    else
        // Copy the link/image to the screenshots channel
        return channel.send(`Screenshot for https://osu.ppy.sh/b/${mapid} from ${team.name}\n` +
            args[2]);
}

/**
 * Removes a map from a player's team's pool
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function removeMap(msg, args)
{
    // Get args amd show help
    if (args.length < 2 || args.length > 3)
        return;
    else if (args[1] == '?')
        return msg.channel.send("Usage: !remove <map> [mod]\n" +
            "map: Beatmap link or id. You can specify `all` instead to clear " +
            "all maps from your pool\n" +
            "(optional) mod: Which mod pool to remove the map from. Should be " +
            "some combination of NM|HD|HR|DT|CM. " +
            "If left blank will remove the first found copy of the map.\n" +
            "Aliases: !rem, !removemap\n\n" +
            "If you make a mistake you can use !undo within 10 seconds to " +
            "return your maps to how they were before.");

    // Get which team the player is on
    let team = await db.getTeam(msg.author.id);
    if (!team)
        return msg.channel.send("Couldn't find which team you're on");

    // Get the beatmap id
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
    {
        // If they want to remove all maps, this is where it will be
        // because 'all' isn't a number
        if (args[1].toLowerCase() === "all")
        {
            // Ask for confirmation
            console.log("Confirming remove all");
            let conf = await getConfirmation(msg,
                "This will remove __ALL__ maps from your pool, there is no undo. Are you sure?");
            if (conf.aborted)
                return msg.channel.send(conf.err + "Maps not removed");
            else
            {
                // Remove all maps and return
                let changed = await db.removeAllMaps(team.name);
                if (changed)
                    return msg.channel.send(`Removed ${team.maps.length} maps`);
                else
                    return msg.channel.send("No maps to remove.");
            }
        }
        else
            return msg.channel.send(`Couldn't recognise beatmap id`);
    }

    // Get the mod pool and mods
    let mods;
    let modpool;
    if (args.length > 2)
    {
        args[2] = args[2].toUpperCase();
        // If CM is present, regardless of other mods
        if (args[2].includes("CM"))
            modpool = "cm";
        // Only if other mods are present
        if (args[2] !== "CM")
            mods = parseMod(args[2]);
    }

    console.log(`Removing mapid ${mapid} from ${modpool}`);
    let result = await db.removeMap(team.name, mapid, modpool, mods);
    if (result)
    {
        // Find the map info for this id, for user friendliness' sake
        let map = team.maps.find(item => {
            if (item.id == mapid)
            {
                if (modpool !== undefined)
                    if (item.pool !== modpool)
                        return false;
                if (mods !== undefined)
                    if (item.mod !== mods)
                        return false;
                return true;
            }
            return false;
        });
        await msg.channel.send(`Removed ${mapString(map)}${
            map.pool === "cm"
            ? ` +${modString(map.mod)}`
            : ""
        } from ${map.pool.toUpperCase()} pool`);
        return waitForUndo(msg, team);
    }
    else
        return msg.channel.send("Map not found");
}

/**
 * Views all the maps in a player's pool
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function viewPool(msg, args)
{
    if (args.length > 2
            || !['!view', '!viewpool', '!list'].includes(args[0]))
        return;
    else if (args[1] === '?')
        return msg.channel.send("Usage: !view [mod]\n" +
            "View maps in your pool and their statuses. " +
            "Optionally limit to a specific set of mods from NM|HD|HR|DT|CM\n" +
            "Aliases: !viewpool, !list");
    
    // Get which team the player is on
    let team = await db.getTeam(msg.author.id);
    if (!team)
        return msg.channel.send("Couldn't find which team you're on");

    // Add all mods if not otherwise requested
    if (args.length == 2)
        args[1] = args[1].toLowerCase();
    else
        args[1] = "nmhdhrdtcm";

    let strs = {};
    let pool = [];
    const modNames = {
        nm: "**__No Mod:__**\n",
        hd: "**__Hidden:__**\n",
        hr: "**__Hard Rock:__**\n",
        dt: "**__Double Time:__**\n",
        cm: "**__Custom Mod:__**\n"
    };
    // Loop over all the maps, add them to the proper output string,
    // and add them to the pool for checking.
    team.maps.forEach(map => {
        if (args[1].includes(map.pool))
        {
            // If the mod hasn't been seen yet, add it to the output
            if (!strs[map.pool])
                strs[map.pool] = modNames[map.pool];
            // Add the map's info to the proper string
            strs[map.pool] += `${mapString(map)} ${map.pool === 'cm' ? `+${modString(map.mod)} ` : ""}<${mapLink(map)}>\n`;
            strs[map.pool] += `\tDrain: ${checker.convertSeconds(map.drain)}, Stars: ${map.stars}, Status: ${map.status}\n`;

            pool.push(map);
        }
    });
    // Put all the output strings together in order
    let str = "";
    ['nm', 'hd', 'hr', 'dt', 'cm'].forEach(m => {
        if (!!strs[m])
            str += strs[m];
    });

    // Check the pool as a whole
    let result = await checker.checkPool(pool);

    // Don't display pool error messages if limited by a certain mod
    if (args[1] === "nmhdhrdtcm")
    {
        str += `\nTotal drain: ${checker.convertSeconds(result.totalDrain)}`;
        str += `\n${result.overUnder} maps are within 15 seconds of drain time limit`;
        // Show pool problems
        str += `\nThere are ${MAP_COUNT - team.maps.length} unfilled slots\n`;
        if (result.message.length > 0)
            result.message.forEach(item => str += `\n${item}`);
    }
    // Do display duplicate maps always though
    if (result.duplicates.length > 0)
    {
        str += "\nThe following maps were found more than once:";
        result.duplicates.forEach(dupe => str += `\n\t${mapString(dupe)}`);
    }

    if (str === "")
        return msg.channel.send("Nothing to display");
    return msg.channel.send(str);
}

/**
 * Toggles whether the player wants to receive notifications when their maps are rejected
 * @param {Discord.Message} msg 
 */
async function toggleNotif(msg)
{
    let args = msg.content.split(' ');
    if (args[0] !== "!notif")
        return;

    if (args.length === 1)
    {
        let status = await db.toggleNotification(msg.author.id);
        if (status === undefined)
            return msg.channel.send("Couldn't update your notification status");
        else
            return msg.channel.send(`Toggled notifications ${status ? "on" : "off"}`);
    }
    else if (args[1] === '?')
    {
        let team = await db.getTeam(msg.author.id);
        if (!team)
            return msg.channel.send("Couldn't find which team you're on");

        let status = team.players.find(p => p.discordid === msg.author.id).notif;
        // Show help and the current setting
        return msg.channel.send("Usage: !notif\n" +
            "Toggles whether the bot will DM you if one of your maps is rejected\n" +
            `Currently set to: ${status === false ? "Ignore" : "Notify"}`);
    }
}
//#endregion
//#region Approver Commands
// ============================================================================
// ======================== Approver Commands =================================
// ============================================================================
/**
 * Displays a list of all pending maps
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function viewPending(msg, args)
{
    if (args.length > 2 || args[0] !== "!pending")
        return;
    if (args[1] === '?')
        return msg.channel.send("Usage: !pending [pool]\n" +
            "Shows all maps with a pending status, " +
            "waiting to be approved.\n" +
            "(optional) pool: Only show maps from the listed modpool. NM|HD|HR|DT|CM");
    
    console.log("Finding pending maps");
    let maplist = await db.findMapsWithStatus("Pending");
    console.log(maplist);
    
    // Add all mods if not otherwise requested
    if (args.length === 2)
        args[1] = args[1].toLowerCase();
    else
        args[1] = "nmhdhrdtcm";
    
    let str = "";
    maplist.forEach(mod => {
        // Make sure this mod should be displayed
        if (!args[1].includes(getModpool(mod._id)))
            return;
        str += `**__${modString(mod._id)}:__**\n`;
        mod.maps.forEach(map => {
            if (str.length < 1800)
                str += `<${mapLink(map)}> ${mapString(map)}\n`;
        });
    });
    if (str.length >= 1800)
        str += "Message too long, some maps skipped...";
    else if (str === "")
        str = "No pending maps";
    return msg.channel.send(str);
}

/**
 * Displays a list of all 'Screenshot Required' maps
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function viewNoScreenshot(msg, args)
{
    if (args.length > 2 || args[0] !== "!ssrequired")
        return;
    if (args.length === 2)
        if (args[1] === '?')
            return msg.channel.send("Usage: !ssrequired\n" +
                "Shows all maps with a \"Screenshot Required\" status, " +
                "waiting for one to be submitted.\n" +
                "These maps aren't ready to be approved yet.");
        else
            return;
    // Continue if args.length == 1
    console.log("Finding screenshot required maps");
    let maplist = await db.findMapsWithStatus("Screenshot Required");
    console.log(maplist);

    let str = "";
    maplist.forEach(mod => {
        str += `**__${modString(mod._id)}:__**\n`;
        mod.maps.forEach(map =>
            str += `<${mapLink(map)}> ${mapString(map)}\n`
        );
    });
    if (str === "")
        str = "No maps";
    return msg.channel.send(str);
}

/**
 * Displays a count of how many maps are needed in each modpool
 * @param {Discord.Message} msg 
 */
async function viewMissingMaps(msg)
{
    if (msg.content === "!missing ?")
        return msg.channel.send("Usage: !missing\n" +
            "Shows how many map slots need to be filled for each mod " +
            "in either division.");
    else if (msg.content !== "!missing")
        return;
    
    let missing = await db.findMissingMaps();

    var counts = {
        "Open": { nm: 0, hd: 0, hr: 0, dt: 0, cm: 0 },
        "15k": { nm: 0, hd: 0, hr: 0, dt: 0, cm: 0 }
    };
    missing.forEach(team => {
        // Add two maps for each pool
        counts[team.division].nm += 2;
        counts[team.division].hd += 2;
        counts[team.division].hr += 2;
        counts[team.division].dt += 2;
        counts[team.division].cm += 2;

        // Remove maps the team already has
        team.maps.forEach(map => {
            if (!map.status.startsWith("Rejected"))
                counts[team.division][map.pool]--;
        });
    });

    // Write out the results
    return msg.channel.send(`\`\`\`${util.inspect(counts)}\`\`\``);
}

/**
 * Approves a map
 * @param {Discord.Message} msg 
 * @param {string[]} args
 */
async function approveMap(msg, args)
{
    if (args[1] == '?')
        return msg.channel.send("Usage: !approve <map> [mod]\n" +
            "Map: Map link or id to approve\n" +
            "(optional) mod: What mods are used. Should be some combination of " +
            "HD|HR|DT|HT|EZ. Default is nomod, unrecognised items are ignored.\n" +
            "Aliases: !accept");

    if (args.length < 2 || args.length > 3)
        return;
    
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send("Map not recognised");
    
    // Get the mods
    let mod = 0;
    if (args.length == 3)
        mod = parseMod(args[2].toUpperCase());
    
    let count = await db.approveMap(mapid, mod);
    return msg.channel.send(`Approved maps for ${count} teams`);
}

/**
 * Rejects a map and provides a reason for rejection
 * @param {Discord.Message} msg 
 * @param {Discord.Collection<string, Discord.GuildMember>} userlist Will DM
 * matching users from this list saying their map was rejected
 * @param {string[]} args
 */
async function rejectMap(msg, userlist, args)
{
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
    // Get the list of players, and send them a message if they're in the server
    let dms = result.playerNotif.map(player => {
        let member = userlist.get(player.discordid);
        if (member)
            return member.send("A map in your pool was rejected:\n" +
                `**__Map:__** https://osu.ppy.sh/b/${mapid} +${modString(mod)}\n` +
                `**__Message:__** ${desc}`);
    });
    dms.push(msg.channel.send(`Rejected ${mapid} +${modString(mod)} from ${result.modified} pools`));
    return Promise.all(dms);
}

/**
 * Sets a map back to screenshot required status
 * @param {Discord.Message} msg 
 * @param {Discord.Collection<string, Discord.GuildMember>} userlist Will DM
 * matching users from this list saying their map needs another screenshot
 * @param {string[]} args
 */
async function rejectScreenshot(msg, userlist, args)
{
    if (args[1] == '?')
        return msg.channel.send("Usage: !clearss <map> <team>\n" +
            "Map: Map link or id to reject\n" +
            "Team: The team name\n" +
            "Aliases: !unpass");
    if (args.length < 3)
        return;
    
    let mapid = checker.parseMapId(args[1]);
    if (!mapid)
        return msg.channel.send("Unrecognised map id");

    console.log(`Attempting to update team "${args[2]}" map id ${mapid} to unpass status`);
    let result = await db.pendingMap(args[2], mapid, false);
    if (result)
    {
        // Tell players on the team that they need a new screenshot
        let dms = result.players.map(player => {
            if (player.notif === undefined)
            {
                let member = userlist.get(player.discordid);
                if (member)
                    return member.send("A screenshot for one of your maps was reset:\n" +
                        `https://osu.ppy.sh/b/${mapid}`);
            }
        });
        dms.push(msg.channel.send("Set status to \"Screenshot Required\""));
        return Promise.all(dms);
    }
    else
        return msg.channel.send("Team not found or no matching map");
}

//#endregion
/**
 * Sends a list of available commands
 * @param {Discord.Message} msg 
 */
async function commands(msg)
{
    var info = "Available **Public** commands:\n" +
        "!check, !help, !requirements, !teams";
    if (msg.member && msg.member.roles.has(APPROVER))
        info += "\nAvailable **Map Approver** commands:\n" +
            "!pending, !approve, !reject, !clearss, !ssrequired, !missing";
    if (await db.getTeam(msg.author.id))
        info += "\nAvailable **Player** commands:\n" +
            "!add, !remove, !view, !addpass, !osuname, !notif";
    info += "\n\nGet more info about a command by typing a ? after the name";
    return msg.channel.send(info);
}

module.exports = {
    checkMap,   // Public
    commands,
    viewRequirements,
    viewTeamPlayers,
    addTeam,    // Admins
    addPlayer,
    removePlayer,
    movePlayer,
    lockSubmissions,
    exportMaps,
    recheckMaps,
    toggleNotif,    // Players
    updatePlayerName,
    addMap,         // Maps
    addPass,
    removeMap,
    viewPool,
    addBulk,
    viewPending,    // Map approvers
    viewNoScreenshot,
    approveMap,
    rejectMap,
    rejectScreenshot,
    viewMissingMaps
};
