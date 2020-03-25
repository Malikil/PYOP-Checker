/*
This module should contain all the basic commands to be called after args have been
split up.

Permissions should also be checked here. Ie if trying to add a team this module
needs to make sure the user has the proper permissions to do that.
*/
const Discord = require('discord.js');
const checker = require('./checker');
const db = require('./db-manager');
const util = require('util');
const google = require('./gsheets');
const helpers = require('./helpers');

const APPROVER = process.env.ROLE_MAP_APPROVER;
const MAP_COUNT = 10;

// There's probably a better way to do this, but for now I'm just using a
// global variable to store whether submissions are open or closed
var locked = false;

//#region Helper Functions
// ============================================================================
// ========================= Helper Functions =================================
// ============================================================================
const mapLink = map => `https://osu.ppy.sh/b/${map.id}`;

/**
 * Gets a mod pool string from a mod combination
 * @param {number} bitwise The bitwise number representation of the mods
 */
function getModpool(bitwise)
{
    switch (bitwise)
    {
        case 0:               return "nm";
        case helpers.MODS.HD: return "hd";
        case helpers.MODS.HR: return "hr";
        case helpers.MODS.DT: return "dt";
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
 * @param {number|string} mapid The map id or link to map
 * @returns {Promise<{
 *  message: string,
 *  beatmap: *
 * }>} A message indicating whether the map would be accepted,
 * and the map object that got checked
 */
async function checkMap(mapid, {
    mods = 0,
    division = undefined,
    osuid = undefined,
    discordid = undefined
}) {
    if (!mapid || isNaN(mapid))
        return {
            message: "Couldn't recognise beatmap id"
        };
    
    console.log(`Checking map ${mapid} with mods ${mods}`);
    // If division is included, use that. Otherwise try to
    // get the division based on who sent the message
    let lowdiv = false;
    if (division)
        lowdiv = division === '15k';
    else if (discordid || osuid)
    {
        let team = await db.getTeam(discordid || osuid);
        if (team)
        {
            lowdiv = team.division === "15k";
            osuid = team.players.find(p => p.discordid === discordid).osuid;
        }
    }
    
    let beatmap = await checker.getBeatmap(mapid, mods);
    let quick = checker.quickCheck(beatmap, osuid, lowdiv);
    console.log(`Quick check returned: ${quick}`);
    if (quick)
        return {
            message: quick,
            beatmap
        };
    
    let status = {
        passed: false,
        message: "Map isn't ranked"
    };
    if (beatmap.approved == 1)
        status = await checker.leaderboardCheck(mapid, mods, osuid);
    if (status.passed)
        return {
            message: "This map can be accepted automatically",
            beatmap
        };
    else
        return {
            message: `This map would need to be manually approved - ${status.message}`,
            beatmap
        };
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
 * Adds a map to the players's team and makes sure it's acceptable
 * @param {number|string} mapid Map id or link to a map
 * @param {Object} p1
 * @param {number} p1.mods
 * @param {boolean} p1.cm
 * @param {string} p1.discordid
 * @param {number} p1.osuid
 * 
 * @returns {Promise<{
 *   message: string,
 *   map: Object,
 *   added: boolean,
 *   replaced: Object,
 *   current: Object[]
 * }>}
 */
async function addMap(mapid, {
    mods = 0,
    cm = false,
    discordid,
    osuid
}) {
    // Get which team the player is on
    let team;
    if (discordid)
        team = await db.getTeam(discordid);
    else if (osuid)
        team = await db.getTeam(osuid)
    if (!team)
        return {
            message: "Couldn't find which team you're on",
            added: false
        };
    // Get osu id
    if (!osuid)
        osuid = team.players.find(item => item.discordid == discordid).osuid;
    if (!osuid)
        console.warn("Team found but osu id was not");
    // Make sure submissions are open
    // Stinky code
    if (locked)
        return {
            message: "Submissions are currently locked. " +
                "If you're submitting a replacement for a map that was rejected after submissions " +
                "closed, please send it to Malikil directly.",
            added: false
        };

    mapid = helpers.parseMapId(mapid);
    if (!mapid)
        return {
            message: `Couldn't recognise beatmap id`,
            added: false
        };
    // Check beatmap approval
    console.log(`Looking for map with id ${mapid} and mod ${mods}`);
    let beatmap = await checker.getBeatmap(mapid, mods);
    let quick = checker.quickCheck(beatmap, osuid, team.division === "15k");
    let status;
    if (quick)
        return {
            message: quick,
            map: beatmap,
            added: false
        };
    else if ((await checker.leaderboardCheck(mapid, mods, osuid)).passed)
        if (beatmap.approved == 1 && beatmap.version !== "Aspire")
            status = "Accepted";
        else
            status = "Pending"
    else
        status = "Screenshot Required";
    
    // Get the mod pool this map is being added to
    let modpool;
    if (cm)                       modpool = "cm";
    else switch (mods)
        {
            case 0:               modpool = "nm"; break;
            case helpers.MODS.HD: modpool = "hd"; break;
            case helpers.MODS.HR: modpool = "hr"; break;
            case helpers.MODS.DT: modpool = "dt"; break;
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
        mod: mods,
        pool: modpool
    };
    let replaced = await db.addMap(team.name, mapitem);
    if (replaced)
    {
        // Prepare the current pool state
        let cur = [];
        team.maps.forEach(m => {
            if (m.mod === mods)
            {
                // Make sure it's not the removed map
                if ((m.id !== replaced.id)
                    && (rejected
                        ? m.id !== rejected.id
                        : true))
                    cur.push(m);
            }
        });
        // Add the newly added map
        cur.push(mapitem);
        
        // Send status and current pool info
        return {
            replaced: rejected,
            added: true,
            map: mapitem,
            current: cur
        };
    }
    else
        return {
            added: false,
            message: "Add map failed.",
            map: beatmap
        };
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
            ? ` +${helpers.modString(map.mod)}`
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
            strs[map.pool] += `${mapString(map)} ${map.pool === 'cm' ? `+${helpers.modString(map.mod)} ` : ""}<${mapLink(map)}>\n`;
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
        str += `**__${helpers.modString(mod._id)}:__**\n`;
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
        str += `**__${helpers.modString(mod._id)}:__**\n`;
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
                `**__Map:__** https://osu.ppy.sh/b/${mapid} +${helpers.modString(mod)}\n` +
                `**__Message:__** ${desc}`);
    });
    dms.push(msg.channel.send(`Rejected ${mapid} +${helpers.modString(mod)} from ${result.modified} pools`));
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
    viewPending,    // Map approvers
    viewNoScreenshot,
    approveMap,
    rejectMap,
    rejectScreenshot,
    viewMissingMaps
};
