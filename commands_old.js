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
//#region Approver Commands
// ============================================================================
// ======================== Approver Commands =================================
// ============================================================================
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
    // Map approvers
    rejectMap,
    viewMissingMaps
};
