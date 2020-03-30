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
    
    let beatmap = await helpers.getBeatmap(mapid, mods);
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
 * Get strings to display all teams currently registered,
 * and the players on them
 */
async function getTeamPlayers()
{
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
            tempstr = team.info.reduce((p, c) => `${p}${c}, `, tempstr).slice(0, -2);

        if (team.range === "Open")
            openstr += `\n${tempstr}`;
        else
            fiftstr += `\n${tempstr}`;
    });
    
    return {
        openstr,
        fiftstr
    }
}
//#endregion
//#region Admin Commands
// ============================================================================
// ========================== Admin Functions =================================
// ============================================================================

/**
 * Adds a player to a team
 * @param {string} team The team name
 * @param {{
 *  osuid: string|number,
 *  discordid?: string
 * }[]} players An array of player objects containing osuid and discordid
 * @param {string} division Which division to add the team to
 * @returns {Promise<number>} How many players got added/moved
 */
async function addPlayer(team, players, division = "open")
{
    console.log(`Adding ${players.length} players to ${team}`);

    let playercount = players.reduce(async (pcount, player) => {
        // Make sure the player isn't already on a team
        if (await db.getTeam(player.osuid))
            // If the player is on a team, move them instead
            return pcount + await db.movePlayer(team, player.osuid);

        let osuplayer = await helpers.getPlayer(player.osuid);
        if (!osuplayer)
            return pcount;
        
        // We should have a player now, add them to their team
        return pcount + await db.addPlayer(team, osuplayer.user_id, osuplayer.username, player.discordid);
    }, 0);
    
    return playercount;
}

/**
 * Removes a player from all the teams they're on
 * @param {string} osuid
 */
async function removePlayer(osuname)
{
    console.log(`Removing ${osuname}`);
    return db.removePlayer(osuname);
}

/**
 * Moves an existing player to a different team
 * @param {string|number} osuname Osu username or id
 * @param {string} team
 * @returns How many teams got changed, or -1 if no player was found
 */
async function movePlayer(osuname, team)
{
    return db.movePlayer(team, osuname);
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
 * @param {string} discordid
 */
async function updatePlayerName(discordid)
{
    // Get the player's current info
    let team = await db.getTeam(discordid);
    if (!team)
        return "Couldn't find which team you're on";
    let player = team.players.find(p => p.discordid == discordid);
    // Get the player's new info from the server
    let newp = await helpers.getPlayer(player.osuid);
    // Update in the database
    let result = await db.updatePlayer(discordid, newp.username);
    if (result)
        return `Updated name from ${player.osuname} to ${newp.username}`;
    else
        return `No updates made, found username: ${newp.username}`;
}

/**
 * Adds a map to the players's team and makes sure it's acceptable
 * @param {number} mapid Map id
 * @param {Object} p1
 * @param {number} p1.mods
 * @param {boolean} p1.cm
 * @param {string} p1.discordid Optional
 * @param {number} p1.osuid Optional
 * 
 * @returns {Promise<{
 *   error: string,
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
        team = await db.getTeam(osuid);
    if (!team)
        return {
            error: "Couldn't find which team you're on",
            added: false
        };
    // Get osu id
    if (!osuid)
        osuid = team.players.find(item => item.discordid == discordid).osuid;
    if (!osuid)
        console.warn("Team found but osu id was not");

    // Check beatmap approval
    console.log(`Looking for map with id ${mapid} and mod ${mods}`);
    let beatmap = await helpers.getBeatmap(mapid, mods);
    let quick = checker.quickCheck(beatmap, osuid, team.division === "15k");
    let status;
    if (quick)
        return {
            error: quick,
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
            replaced: rejected || replaced,
            added: true,
            map: mapitem,
            current: cur
        };
    }
    else
        return {
            added: false,
            error: "Add map failed.",
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
    let mapid = helpers.parseMapId(args[1]);
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
 * @param {number|"all"} mapid The mapid to remove, or "all" to remove all maps
 * @param {object} p1
 * @param {number} p1.mods
 * @param {boolean} p1.cm
 * @param {string} p1.discordid
 * @param {number} p1.osuid
 * 
 * @returns {Promise<{
 *  error: string,
 *  count: number,
 *  removed: *[]
 * }>}
 */
async function removeMap(mapid, {
    mods,
    cm = false,
    discordid,
    osuid
}) {
    // Get which team the player is on
    let team = await db.getTeam(discordid || osuid);
    if (!team)
        return {
            error: "Couldn't find which team you're on",
            count: 0,
            removed: []
        };
    // Special case for removing all maps
    if (mapid === "all")
    {
        await db.removeAllMaps(team.name)
        return {
            count: team.maps.length,
            removed: team.maps
        };
    }
    let modpool = (cm ? "cm" : undefined);
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
        return {
            count: 1,
            removed: [ map ]
        };
    }
    else
        return {
            count: 0,
            removed: []
        };
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
            strs[map.pool] += `${mapString(map)} ${map.pool === 'cm' ? `+${helpers.modString(map.mod)} ` : ""}<${helpers.mapLink(map)}>\n`;
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
 * @param {string} discordid Who to toggle the status of
 * @param toggle Set to false if no changes should be made, only check the current value
 * 
 * @returns {Promise<boolean>} The current notification status of the player,
 * or undefined if player not found
 */
async function toggleNotif(discordid, toggle = true)
{
    if (toggle)
        return db.toggleNotification(discordid);
    
    let team = await db.getTeam(discordid);
    if (!team)
        return;

    let status = team.players.find(p => p.discordid === discordid).notif;
    return !!status;
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
                str += `<${helpers.mapLink(map)}> ${mapString(map)}\n`;
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
            str += `<${helpers.mapLink(map)}> ${mapString(map)}\n`
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

module.exports = {
    checkMap,  // Public
    getTeamPlayers,
    addPlayer, // Admins
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
