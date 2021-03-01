/*
This module should contain all the basic commands to be called from either
bancho or discord
It will interact with sheets/db modules, but not with discord/bancho
*/
//const Discord = require('discord.js');
const checkers = require('./checkers');
const db = require('./db-manager');
const google = require('./gsheets');
const helpers = require('./helpers/helpers');
const { DbBeatmap, ApiBeatmap, DbPlayer, ApiPlayer } = require('./types');
const divInfo = require('./divisions.json');

const MAP_COUNT = 10;
const DRAIN_BUFFER = parseInt(process.env.DRAIN_BUFFER);

//#region Public Commands
// ============================================================================
// ========================= Public Functions =================================
// ============================================================================
/**
 * Adds a team
 * @param {string} teamname The team's name
 * @param {string} division Which division to add the team to
 * @param {{
 *  osuid: number|string,
 *  discordid: string,
 *  utc: string
 * }[]} players A list of players on the team
 * @returns {Promise<{
 *  added: boolean,
 *  players?: {
 *      osuid: number,
 *      osuname: string,
 *      discordid: string
 *  }[],
 *  message?: string
 * }>} How many players got added/updated
 */
async function addTeam(division, teamname, players)
{
    // Make sure none of the players are already on a team
    let team = await db.getTeamByPlayerlist(players);
    if (team)
        return {
            added: false,
            message: "Some players are already on a team. Please let Malikil know " +
                "if you need to make changes to an existing team."
        };
    // Find division requirements
    let div = divInfo.find(d => d.division === division);
    // Verify the players
    let apiplayers = await Promise.all(
        players.map(p => ApiPlayer.buildFromApi(p.osuid))
    );
    
    // Make sure the players are in rank range
    let allowed = apiplayers.reduce((p, c) => p &&
            c.pp_rank >= div.ranklimits.high &&
            c.pp_rank < div.ranklimits.low
    , true);
    if (!allowed)
        return {
            added: false,
            message: "Some players don't meet rank requirements"
        };
    
    // Convert players to db format
    let playerlist = apiplayers.map(apip => {
        let player = players.find(p =>
            p.osuid.toString().toLowerCase() === apip.username.toLowerCase().replace(/ /g, '_') ||
            p.osuid === apip.user_id
        );
        console.log(`Looking for ${apip.username}`);
        console.log(player);
        let obj = {
            osuid: apip.user_id,
            osuname: apip.username,
            discordid: player.discordid
        };
        if (player.utc !== "_")
            obj.utc = player.utc;
        return obj;
    });
    console.log(playerlist);

    // Add the team to the db
    let result = await db.addTeam(teamname, division, playerlist);
    if (result)
        return {
            added: true,
            players: playerlist
        };
    else
        return {
            added: false,
            message: "Error writing to database"
        };
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
        //let sheetfuncs = await google.createExportInterface();

        let players = await db.performAction(p => p);
        console.log(players);
        await google.pushMaps(players);
        //let response = await sheetfuncs.commitChanges();
        //console.log(response);
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
    /** @param {DbPlayer} player */
    let update = async function (player) {
        // Check each map with the quick check.
        // It shouldn't require hitting the osu api, and all the required info
        // should already exist in the beatmap object.
        let rejects = [];
        player.maps.forEach(map => {
            let result = checker.quickCheck(map, player.division);
            if (result)
                rejects.push({
                    bid: map.bid,
                    mods: map.mods
                });
            });
        if (rejects.length > 0)
        {
            console.log(`${player.osuname} has rejects:`);
            console.log(rejects);
        }
        return {
            division: player.division,
            rejects
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
 * Adds multiple maps at once
 * @param {{
 *  mapid: number,
 *  mods: number,
 *  cm: boolean
 * }[]} maps
 * @param {string} discordid
 * 
 * @returns {Promise<{
 *  error?: string,
 *  added: number
 * }>}
 */
async function addBulk(maps, discordid) {
    // Get the user's team
    let team = await db.getTeamByPlayerid(discordid);
    if (!team)
        return {
            error: "Team not found",
            added: 0
        };
    console.log(`commands.js:addBulk - Found ${team.teamname}`);
    let added = await maps.reduce(async (count, map) => {
        console.log(`Checking map ${map.mapid} +${map.mods}${map.cm ? " CM" : ""}`);
        // Get the map
        let beatmap = await ApiBeatmap.buildFromApi(map.mapid, map.mods);
        let checkResult = await checkers[team.division].check(beatmap);
        if (!checkResult.passed)
            return count;
        let status;
        if (checkResult.approved)
            if (beatmap.version === "Aspire" || beatmap.approved > 3)
                status = "Pending";
            else
                status = "Accepted (Automatic)";
        else
            status = "Screenshot Required";
        let pool = map.cm ? "cm" : helpers.getModpool(map.mods);
        let mapitem = beatmap.toDbBeatmap(status, pool);
        // Add map
        let added = await db.addMap(team.teamname, mapitem);
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
 * @param {string} referenceLink
 * 
 * @returns {Promise<{
 *  added: boolean,
 *  error?: string,
 *  player?: string
 * }>}
 */
async function addPass(mapid, discordid, referenceLink)
{
    // Get which team the player is on
    let team = await db.getTeamByPlayerid(discordid);
    if (!team)
        return {
            added: false,
            error: "Couldn't find team"
        };

    // Update the status
    let result = await db.pendingMap(discordid, mapid, referenceLink);
    if (!result.matched)
        return {
            added: false,
            error: "Couldn't find map"
        };
    return {
        added: !!result.added
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
    discordid
}) {
    // Get which team the player is on
    let team = await db.getTeamByPlayerid(discordid);
    if (!team)
        return {
            error: "Couldn't find team",
            removed: []
        };
    // Special case for removing all maps
    if (mapid === "all")
    {
        await db.removeAllMaps(team.teamname)
        return { removed: team.maps };
    }
    let modpool = (cm ? "cm" : undefined);
    console.log(`Removing mapid ${mapid} from ${modpool}`);
    let result = await db.removeMap(team.teamname, mapid, modpool, mods);
    if (result)
    {
        // Find the map info for this id, for user friendliness' sake
        let map = team.maps.find(item => 
            item.bid === mapid &&
            (!modpool || item.pool === modpool) &&
            (!mods || item.mods === mods)
        );
        return { removed: [ map ] };
    }
    else
        return { removed: [] };
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
    let team = await db.getTeamByPlayerid(playerid);
    if (!team)
        return "No player found";

    let map = await ApiBeatmap.buildFromApi(mapid, mods);
    if (!map)
        return "No beatmap found";

    let pool = custom ? 'cm' : helpers.getModpool(mods);
    
    let result = await db.addMap(team.teamname, map.toDbBeatmap("Approved", pool));
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
//#endregion

module.exports = {
    addTeam, // Admin
    removePlayer,
    exportMaps,
    recheckMaps,
    // Players
    updatePlayerName,
    // Maps
    addPass,
    removeMap,
    addBulk,
    viewPending,    // Map approvers
    approveMap,
    rejectMap,
    viewMissingMaps,
    manualAddMap
};
