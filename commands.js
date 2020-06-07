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
const { DbBeatmap } = require('./types');

const MAP_COUNT = 10;

//#region Helper Functions
// ============================================================================
// ========================= Helper Functions =================================
// ============================================================================

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
        lowdiv = division.toLowerCase() === '15k';
    else if (discordid || osuid)
    {
        let player = await db.getPlayer(discordid || osuid);
        if (player)
        {
            lowdiv = player.division === "15k";
            osuid = player.osuid;
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
 * Get a list of all players in either division
 */
async function getPlayers()
{
    // Create the player lists
    var open = [];
    var fift = [];
    await db.performAction(async function(player) {
        if (player.division === "15k")
            fift.push(player.osuname);
        else
            open.push(player.osuname);
    });

    return {
        open,
        fift
    }
}
//#endregion
//#region Admin Commands
// ============================================================================
// ========================== Admin Functions =================================
// ============================================================================

/**
 * Adds a player in an unconfirmed state
 * @param {string|number} osuid The player's osu id
 * @param {string} discordid The player's discord id
 * @param {string} utc The player's utc timezone
 * @param {string} division Which division to add the team to
 * @returns {Promise<number>} How many players got added/moved
 */
async function addPlayer(osuid, discordid, utc, division = "Open")
{
    // If the player already exists, update their division
    //let player = await db.getPlayer(playerid.discordid);
    /*if (player)
    {
        player.division = division;
        db.updatePlayer(player)
    }*/
    // Get the player info
    let player = await helpers.getPlayer(osuid);
    if (player)
    {
        // Add the player's info to db
        let pobj = {
            osuid = player.user_id,
            osuname = player.username,
            discordid, utc, division
        };
        return db.updatePlayer(pobj);
    }
    return 0;
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
 * Pushes all maps for all teams to google sheets
 * @returns {Promise<{
 *  ok: boolean,
 *  message?: string
 * }>}
 */
async function exportMaps()
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
        return {
            ok: true
        };
    else
        return {
            ok: false,
            message: util.inspect(response, { depth: 4 })
        };
}

/**
 * Runs through all pools and updates statuses for maps.  
 * Ie this is used at the beginning of a new week, it will make sure the old maps
 * still meet star requirements.
 */
async function recheckMaps()
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
    if (openrejects.length > 0)
        updateCount += await db.bulkReject(openrejects, "Map is below the new week's star range", "Open");
    if (fiftrejects.length > 0)
        updateCount += await db.bulkReject(fiftrejects, "Map is below the new week's star range", "15k");
    return updateCount;
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
 *   error?: string,
 *   check?: {
 *      rejected: boolean,
 *      reject_on?: "Drain"|"Length"|"Stars"|"User"|"Data",
 *      reject_type?: "High"|"Low",
 *      message?: string
 *   },
 *   map?: Object,
 *   added: boolean,
 *   replaced?: Object,
 *   current?: Object[]
 * }>}
 */
async function addMap(mapid, {
    mods = 0,
    cm = false,
    discordid,
    osuid
}) {
    var player = await db.getPlayer(osuid || discordid);
    if (!player || player.unconfirmed)
        return {
            added: false,
            error: "Player not found"
        };

    // Check beatmap approval
    console.log(`Looking for map with id ${mapid} and mod ${mods}`);
    let beatmap = await helpers.beatmapObject(mapid, mods);
    let quick = await checker.mapCheck(beatmap);
    let status;
    if (quick.rejected)
        return {
            check: quick,
            map: beatmap,
            added: false
        };
    else if ((await checker.leaderboardCheck(mapid, mods, division, player.osuid)).passed)
        if (beatmap.version !== "Aspire")
            status = "Accepted (Automatic)";
        else
            status = "Pending";
    else
        status = "Screenshot Required";
    
    // Get the mod pool this map is being added to
    let modpool = cm ? "cm" : helpers.getModpool(mods);

    // Check if a map should be removed to make room for this one
    // We need the first rejected map, and a count of maps in the modpool
    let rejected;
    let count = player.maps.reduce((n, m) => {
        if (m.pool === modpool)
        {
            if (!rejected && m.status.startsWith("Rejected"))
                rejected = m;
            return n + 1;
        }
        else return n;
    }, 0);
    if (rejected && count > 1)
        await db.removeMap(player.osuid, rejected.bid, rejected.pool, rejected.mods);
    else // We don't need to remove a map, because there's still an empty space
        rejected = undefined;

    let mapitem = new DbBeatmap({
        ...beatmap,
        status,
        pool: modpool
    });
    
    let result = await db.addMap(player.osuid, mapitem);
    if (result)
    {
        // Prepare the current pool state
        let cur = [];
        let skipped = false; // Whether we've skipped a map yet
        player.maps.forEach(m => {
            if (m.mods === mods)
            {
                // Make sure it's not the removed map
                if (skipped || (m.bid !== result.bid)
                    && (rejected
                        ? m.bid !== rejected.bid
                        : true))
                    cur.push(m);
                else
                    skipped = true;
            }
        });
        // Add the newly added map
        cur.push(mapitem);
        
        // Send status and current pool info
        let replaced = rejected;
        if (result.bid)
            replaced = result;
        return {
            replaced,
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
 * Adds multiple maps at once
 * @param {{
 *  mapid: number,
 *  mods: number,
 *  cm: boolean
 * }[]} maps
 * @param {object} o1
 * 
 * @param {string} o1.discordid
 * @param {number} o1.osuid
 * 
 * @returns {Promise<{
 *  error?: string,
 *  added: number
 * }>}
 */
async function addBulk(maps, {
    discordid,
    osuid
}) {
    // Get the user's team
    let team = await db.getTeam(discordid || osuid);
    if (!team)
        return {
            error: "Couldn't find which team you're on",
            added: 0
        };
    console.log(`Found team ${team.name}`);
    if (!osuid)
        osuid = team.players.find(p => p.discordid === discordid).osuid;
    console.log(`Found osuid ${osuid}`);
    let added = await maps.reduce(async (count, map) => {
        console.log(`Checking map ${map.mapid} +${map.mods}${map.cm ? " CM" : ""}`);
        // Get the map
        let beatmap = await helpers.getBeatmap(map.mapid, map.mods);
        let quick = checker.quickCheck(beatmap, osuid, team.division === "15k");
        if (quick)
            return count;
        let status;
        if ((await checker.leaderboardCheck(map.mapid, map.mods, osuid)).passed)
            if (beatmap.approved == 1 && beatmap.version !== "Aspire")
                status = "Accepted";
            else
                status = "Pending"
        else
            status = "Screenshot Required";
        let pool;
        if (map.cm)
            pool = "cm";
        else
            pool = helpers.getModpool(map.mods);
        let mapitem = {
            id: map.mapid, status,
            drain: beatmap.drain,
            stars: beatmap.stars,
            bpm: beatmap.bpm,
            artist: beatmap.artist,
            title: beatmap.title,
            version: beatmap.version,
            creator: beatmap.creator,
            mod: map.mods, pool
        };
        // Add map
        let added = await db.addMap(team.name, mapitem);
        if (added)
            return (await count) + 1;
        else
            return count;
    }, Promise.resolve(0));
    return {
        added
    };
}

/**
 * Adds a pass to a map in the player's team's pool
 * @param {number} mapid
 * @param {string} discordid 
 * 
 * @returns {Promise<{
 *  error: string,
 *  team: *
 * }>}
 */
async function addPass(mapid, discordid)
{
    // Get which team the player is on
    let team = await db.getTeam(discordid);
    if (!team)
        return {
            error: "Couldn't find which team you're on"
        };

    // Update the status
    let result = await db.pendingMap(team.name, mapid, true);
    if (result)
        return {
            team: result
        };
    else
        return {
            error: "Couldn't update screenshot"
        };
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
 * @param {string} discordid
 * @param {("nm"|"hd"|"hr"|"dt"|"cm")[]} mods
 * 
 * @returns {Promise<{
 *  error: string,
 *  poolstr: string
 * }>}
 */
async function viewPool(discordid, mods)
{
    // Get which team the player is on
    let team = await db.getTeam(discordid);
    if (!team)
        return {
            error: "Couldn't find which team you're on"
        };

    // Add all mods if not otherwise requested
    if (!mods || mods.length === 0)
        mods = ["nm", "hd", "hr", "dt", "cm"];

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
        if (mods.includes(map.pool))
        {
            // If the mod hasn't been seen yet, add it to the output
            if (!strs[map.pool])
                strs[map.pool] = modNames[map.pool];
            // Add the map's info to the proper string
            strs[map.pool] += `${helpers.mapString(map)} ${map.pool === 'cm' ? `+${helpers.modString(map.mod)} ` : ""}<${helpers.mapLink(map)}>\n`;
            strs[map.pool] += `\tDrain: ${helpers.convertSeconds(map.drain)}, Stars: ${map.stars}, Status: ${map.status}\n`;

            pool.push(map);
        }
    });
    // Put all the output strings together in order
    let str = mods.reduce((s, m) => s + (strs[m] || ""), '');
    // Check the pool as a whole
    let result = await checker.checkPool(pool);
    // Don't display pool error messages if limited by a certain mod
    if (mods.length === 5)
    {
        str += `\nTotal drain: ${helpers.convertSeconds(result.totalDrain)}`;
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
        result.duplicates.forEach(dupe => str += `\n\t${helpers.mapString(dupe)}`);
    }

    if (str === "")
        return {
            poolstr: "Nothing to display"
        };
    return {
        poolstr: str
    };
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
 * @param {("nm"|"hd"|"hr"|"dt"|"cm")[]} mods
 */
async function viewPending(mods)
{
    console.log("Finding pending maps");
    let maplist = await db.findMapsWithStatus("Pending");
    console.log(maplist);
    
    // Add all mods if not otherwise requested
    if (!mods || mods.length === 0)
        mods = ['nm', 'hd', 'hr', 'dt', 'cm'];
        
    
    let str = "";
    maplist.forEach(mod => {
        // Make sure this mod should be displayed
        if (!mods.includes(helpers.getModpool(mod._id)))
            return;
        str += `**__${helpers.modString(mod._id)}:__**\n`;
        mod.maps.forEach(map => {
            if (str.length < 1800)
                str += `<${helpers.mapLink(map)}> ${helpers.mapString(map)}\n`;
        });
    });
    if (str.length >= 1800)
        str += "Message too long, some maps skipped...";
    else if (str === "")
        str = "No pending maps";
    return str;
}

/**
 * Gets a count of how many maps are needed in each modpool 
 */
async function viewMissingMaps()
{
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

    // Return the results
    return counts;
}

/**
 * Approves a map
 * @param {number} mapid
 * @param {number} mods
 */
async function approveMap(mapid, mods)
{
    // You ever feel like a function is kind of pointless?
    return db.approveMap(mapid, mods);
}

/**
 * Rejects a map and provides a reason for rejection
 * @param {number} mapid
 * @param {number} mods
 * @param {string} desc A reject message for the map
 */
async function rejectMap(mapid, mods, desc)
{
    console.log(`Mod: ${mods}, Message: ${desc}`);
    return db.rejectMap(mapid, mods, desc);
}

/**
 * Sets a map back to screenshot required status
 * @param {number} mapid
 * @param {string} team
 */
async function rejectScreenshot(mapid, team)
{
    console.log(`Attempting to update team "${team}" map id ${mapid} to unpass status`);
    let result = await db.pendingMap(team, mapid, false);
    if (result)
        return {
            ok: true,
            players: result.players
        };
    else
        return {
            ok: false,
            players: []
        };
}
//#endregion

module.exports = {
    checkMap,  // Public
    getPlayers,
    addPlayer, // Admins
    removePlayer,
    movePlayer,
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
    approveMap,
    rejectMap,
    rejectScreenshot,
    viewMissingMaps
};
