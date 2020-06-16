/*
This module should contain all the basic commands to be called from either
bancho or discord
*/
const Discord = require('discord.js');
const checker = require('./checker');
const db = require('./db-manager');
const util = require('util');
const google = require('./gsheets');
const helpers = require('./helpers');
const { DbBeatmap, CheckableMap } = require('./types');

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
 *  passed: boolean,
 *  error?: string,
 *  check?: {
 *      rejected: boolean,
 *      reject_on?: "Drain" | "Length" | "Stars" | "User" | "Data",
 *      reject_type?: "High" | "Low",
 *      issues?: ("2b"|"slider2b"|"spinner"|"position"|"leaderboard")[]
 *  },
 *  beatmap?: *,
 *  division?: "open"|"15k"
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
            passed: false,
            error: "Couldn't recognise beatmap id"
        };
    
    console.log(`Checking map ${mapid} with mods ${mods}`);
    // If division is included, use that. Otherwise try to
    // get the division based on who sent the message
    let osuname;
    if (!division && (discordid || osuid))
    {
        let player = await db.getPlayer(discordid || osuid);
        if (player)
        {
            division = player.division;
            osuname = player.osuname;
            osuid = player.osuid;
        }
    }
    try
    {
        let beatmap = await helpers.beatmapObject(mapid, mods);
        let quick = await checker.mapCheck(beatmap, division, osuname);
        console.log(`Quick check returned: ${util.inspect(quick)}`);
        if (quick.rejected ||
                    (quick.issues &&
                        (quick.issues[0] !== "user"
                        || quick.issues.length > 1)))
            return {
                passed: false,
                check: quick,
                beatmap,
                division
            };
        
        let status = await checker.leaderboardCheck(mapid, mods, osuid);
        console.log(status);
        if (status.passed)
            return {
                passed: true,
                beatmap,
                division
            };
        else
            return {
                passed: false,
                check: {
                    rejected: !!quick.issues,
                    reject_on: "Data",
                    issues: ["leaderboard"].concat(quick.issues)
                },
                beatmap,
                division
            };
    }
    catch (err)
    {
        return {
            passed: false,
            error: err.error || err,
            beatmap: err.map,
            division
        };
    }
}

/**
 * Get a list of all players in either division
 * @returns {Promise<{
 *  open: string[],
 *  fift: string[]
 * }>} Lists of player names for each division
 */
async function getPlayers()
{
    // Create the player lists
    var open = [];
    var fift = [];
    await db.performAction(async function(player) {
        if (player.division === "15k" && !player.unconfirmed)
            fift.push(player.osuname);
        else if (!player.unconfirmed)
            open.push(player.osuname);
    });

    return {
        open,
        fift
    }
}

/**
 * Adds a player in an unconfirmed state
 * @param {string|number} osuid The player's osu id or osu username
 * @param {string} discordid The player's discord id
 * @param {string} utc The player's utc timezone
 * @param {"open"|"15k"} division Which division to add the team to
 * @returns {Promise<{
 *  added: boolean,
 *  confirmed?: boolean,
 *  reject?: boolean
 * }>} How many players got added/updated
 */
async function addPlayer(osuid, discordid, utc, division)
{
    // If the player already exists, update their division
    let player = await db.getPlayer(discordid || osuid);
    if (player)
    {
        player.division = division;
        player.utc = utc;
        db.updatePlayer(player);
        return {
            added: false,
            confirmed: !player.unconfirmed
        };
    }
    else
    {
        // Get the player info
        let player = await helpers.getPlayer(osuid);
        if (player)
        {
            // Make sure the player is in the correct rank range
            if (division === '15k' && player.pp_rank < 15000)
                return {
                    added: false,
                    reject: true
                };
                
            // Add the player's info to the db
            let pobj = {
                osuid: player.user_id,
                osuname: player.username,
                discordid, utc, division
            };
            let result = await db.updatePlayer(pobj);
            return {
                added: !!result,
                confirmed: false
            };
        }
        return {
            added: false
        };
    }
}
//#endregion
//#region Admin Commands
// ============================================================================
// ========================== Admin Functions =================================
// ============================================================================
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
 * Pushes all maps for all teams to google sheets
 * @returns {Promise<{
 *  ok: boolean,
 *  message?: string
 * }>}
 */
async function exportMaps()
{
    try
    {
        let sheetfuncs = await google.createExportInterface();

        console.log(await db.performAction(sheetfuncs.parsePlayer));
        let response = await sheetfuncs.commitChanges();
        console.log(response);
        return { ok: true }
    }
    catch (err)
    {
        console.error(err);
        return {
            ok: false,
            message: err
        };
    }
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
        updateCount += await db.bulkReject(openrejects, "Map is below the new week's star range", "open");
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
 * If the given discordid matches a player in the database, finish their registration
 * @param {number} osuid 
 * @param {string} discordid 
 * @returns {Promise<{
 *  confirmed: boolean,
 *  updated: boolean
 * }>} Confirmed indicates the confirmed status of the player,
 * updated indicates if the player should have been updated
 */
async function confirmRegistration(osuname, discordid)
{
    let player = await db.getPlayer(osuname);
    if (player && player.discordid === discordid)
        if (player.unconfirmed)
        {
            let result = await db.confirmPlayer(player.osuid, discordid);
            if (result)
            {
                google.addPlayer(player);
                return {
                    confirmed: true,
                    updated: true
                };
            }
            else
                return {
                    confirmed: false,
                    updated: true
                };
        }
        else
            return {
                confirmed: true,
                updated: false
            };
    else
        return {
            confirmed: false,
            updated: false
        };
}

/**
 * Updates the osu name of a given player
 * @param {string} playerid Discord id or osuname
 */
async function updatePlayerName(playerid)
{
    // Get the player's current info
    let player = await db.getPlayer(playerid);
    if (!player)
        return "Couldn't find player";
    let oldname = player.osuname;
    // Get the player's new info from the server
    let newp = await helpers.getPlayer(player.osuid);
    player.osuname = newp.username;
    // Update in the database
    let result = await db.updatePlayer(player);
    if (result)
        return `Updated name from ${oldname} to ${player.osuname}`;
    else
        return `No updates made, found username: ${player.osuname}`;
}

/**
 * Adds a map to the players's team and makes sure it's acceptable
 * @param {number} mapid Map id
 * @param {Object} p1
 * @param {number} p1.mods
 * @param {boolean} p1.cm
 * @param {string} p1.discordid Optional
 * @param {number|string} p1.osuid Optional, osu id or osu username
 * 
 * @returns {Promise<{
 *   added: boolean,
 *   error?: string,
 *   check?: {
 *      rejected: boolean,
 *      reject_on?: "Drain"|"Length"|"Stars"|"User"|"Data",
 *      reject_type?: "High"|"Low",
 *      issues?: ("2b"|"slider2b"|"spinner"|"position"|"leaderboard")[]
 *   },
 *   beatmap?: DbBeatmap|CheckableMap,
 *   division?: "open"|"15k",
 *   replaced?: DbBeatmap,
 *   current?: DbBeatmap[]
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
            error: "Player not found or registration not completed"
        };

    // Check beatmap approval
    console.log(`Looking for map with id ${mapid} and mod ${mods}`);
    try
    {
        let beatmap = await helpers.beatmapObject(mapid, mods);
        let quick = await checker.mapCheck(beatmap, player.division, player.osuname);
        console.log(quick);
        let status;
        if (quick.rejected)
            return {
                check: quick,
                beatmap,
                division: player.division,
                added: false
            };
        else if ((await checker.leaderboardCheck(mapid, mods, player.division, player.osuid)).passed)
            if (beatmap.version !== "Aspire" && (!quick.issues || quick.issues.length === 0))
                status = "Accepted (Automatic)";
            else
                status = "Pending";
        else if (!quick.issues || !quick.issues.includes("user"))
            status = "Screenshot Required";
        else // The map had a user issue and no leaderboard
            return {
                check: quick,
                beatmap,
                division: player.division,
                added: false
            };
        
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
                // Get maps with matching mods
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
                beatmap: mapitem,
                current: cur
            };
        }
        else
            return {
                added: false,
                error: "Add map failed.",
                beatmap
            };
    }
    catch (err)
    {
        return {
            added: false,
            error: err.error || err,
            beatmap: err.map
        }
    }
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
    let player = await db.getPlayer(discordid || osuid);
    if (!player)
        return {
            error: "Player not found",
            added: 0
        };
    console.log(`Found player ${player.osuname}`);
    let added = await maps.reduce(async (count, map) => {
        console.log(`Checking map ${map.mapid} +${map.mods}${map.cm ? " CM" : ""}`);
        // Get the map
        let beatmap = await helpers.beatmapObject(map.mapid, map.mods);
        let quick = await checker.mapCheck(beatmap, player.division, player.osuname);
        if (quick.rejected)
            return count;
        let status;
        if ((await checker.leaderboardCheck(map.mapid, map.mods, player.division, player.osuid)).passed)
            if (beatmap.version !== "Aspire")
                status = "Accepted (Automatic)";
            else
                status = "Pending";
        else if (!quick.issues || !quick.issues.includes("user"))
            status = "Screenshot Required";
        else // The map had a user issue and no leaderboard
            return count;
        let pool = map.cm ? "cm" : helpers.getModpool(map.mods);
        let mapitem = new DbBeatmap({ ...beatmap, status, pool });
        // Add map
        let added = await db.addMap(player.osuid, mapitem);
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
 *  added: boolean,
 *  error?: string,
 *  player?: string
 * }>}
 */
async function addPass(mapid, discordid)
{
    // Get which team the player is on
    let player = await db.getPlayer(discordid);
    if (!player)
        return {
            added: false,
            error: "Couldn't find player"
        };

    // Update the status
    let result = await db.pendingMap(player.discordid, mapid);
    if (!result.matched)
        return {
            added: false,
            error: "Couldn't find map",
            player: player.osuname
        };
    return {
        added: !!result.added,
        player: player.osuname
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
 *  error?: string,
 *  removed: DbBeatmap[]
 * }>}
 */
async function removeMap(mapid, {
    mods,
    cm = false,
    discordid,
    osuid
}) {
    // Get which team the player is on
    let player = await db.getPlayer(discordid || osuid);
    if (!player)
        return {
            error: "Couldn't find player",
            removed: []
        };
    // Special case for removing all maps
    if (mapid === "all")
    {
        await db.removeAllMaps(player.osuid)
        return { removed: player.maps };
    }
    let modpool = (cm ? "cm" : undefined);
    console.log(`Removing mapid ${mapid} from ${modpool}`);
    let result = await db.removeMap(player.osuid, mapid, modpool, mods);
    if (result)
    {
        // Find the map info for this id, for user friendliness' sake
        let map = player.maps.find(item => 
            item.bid === mapid &&
            (!modpool || item.pool === modpool) &&
            (!mods || item.mods === mods)
        );
        return { removed: [ map ] };
    }
    else
        return { removed: [] };
}

/**
 * Views all the maps in a player's pool
 * @param {string} discordid
 * @param {("nm"|"hd"|"hr"|"dt"|"cm")[]} mods
 * 
 * @returns {Promise<{
 *  error?: string,
 *  poolstr?: string
 * }>}
 */
async function viewPool(discordid, mods)
{
    // Get which team the player is on
    let player = await db.getPlayer(discordid);
    if (!player)
        return { error: "Couldn't find player" };

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
    player.maps.forEach(map => {
        if (mods.includes(map.pool))
        {
            // If the mod hasn't been seen yet, add it to the output
            if (!strs[map.pool])
                strs[map.pool] = modNames[map.pool];
            // Add the map's info to the proper string
            strs[map.pool] += `${helpers.mapString(map)} ${map.pool === 'cm' ? `+${helpers.modString(map.mods)} ` : ""}<${helpers.mapLink(map)}>\n`;
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
        str += `\nThere are ${MAP_COUNT - player.maps.length} unfilled slots\n`;
        if (result.message.length > 0)
            result.message.forEach(item => str += `\n${item}`);
    }
    // Do display duplicate maps always though
    if (result.duplicates.length > 0)
    {
        str += "\nThe following maps were found more than once:";
        result.duplicates.forEach(dupe => str += `\n\t${helpers.mapString(dupe)}`);
    }

    return {
        poolstr: str || "Nothing to display"
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
    
    let player = await db.getPlayer(discordid);
    if (!player)
        return;

    let status = player.notif;
    return !!status;
}
//#endregion
//#region Approver Commands
// ============================================================================
// ======================== Approver Commands =================================
// ============================================================================
/**
 * Gets a list of maps with a given status
 * @param {("nm"|"hd"|"hr"|"dt"|"cm")[]} mods
 * @param {string} status
 * @returns {Promise<{
 *  pool: "nm"|"hd"|"hr"|"dt"|"cm",
 *  maps: {
 *      bid: number,
 *      artist: string,
 *      title: string,
 *      version: string
 *  }[]
 * }[]>}
 */
async function viewPending(mods, status = "Pending")
{
    console.log("Finding pending maps");
    let maplist = await db.findMapsWithStatus(status);
    console.log(maplist);
    
    // Add all mods if not otherwise requested
    if (!mods || mods.length === 0)
        mods = ['nm', 'hd', 'hr', 'dt', 'cm'];
        
    let result = [];
    maplist.forEach(mod => {
        if (mods.includes(helpers.getModpool(mod._id)))
            result.push({
                pool: helpers.modString(mod._id),
                maps: mod.maps
            });
    });
    return result;
}

/**
 * Gets a count of how many maps are needed in each modpool 
 */
async function viewMissingMaps()
{
    let missing = await db.findMissingMaps();

    var counts = {
        "open": { nm: 0, hd: 0, hr: 0, dt: 0, cm: 0 },
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
 * Adds a map to a player's pool without checking it first
 * @param {string|number} player The discordid or osuname of the player who gets the map
 * @param {number} mapid The id of the map
 * @param {number} mods Bitwise mod number
 * @param {custom} boolean Should be added to cm?
 * @returns {Promise<string>} A short message describing results
 */
async function manualAddMap(playerid, mapid, mods, custom) {
    let player = await db.getPlayer(playerid);
    if (!player)
        return "No player found";

    let map = await helpers.apiBeatmap(mapid, mods);
    if (!map)
        return "No beatmap found";
    
    let result = await db.addMap(player.discordid, new DbBeatmap({
        ...map,
        pool: custom ? "cm" : helpers.getModpool(mods),
        status: "Accepted"
    }));
    if (result)
    {
        if (result instanceof DbBeatmap)
            return "Replaced " + helpers.mapString(result);
        else
            return "Added map";
    }
    else
        return "Couldn't add map";
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
    exportMaps,
    recheckMaps,
    toggleNotif,    // Players
    updatePlayerName,
    confirmRegistration,
    addMap,         // Maps
    addPass,
    removeMap,
    viewPool,
    addBulk,
    viewPending,    // Map approvers
    approveMap,
    rejectMap,
    rejectScreenshot,
    viewMissingMaps,
    manualAddMap
};
