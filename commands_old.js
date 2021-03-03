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

module.exports = {
    // Admin
    removePlayer,
    exportMaps,
    recheckMaps
};
