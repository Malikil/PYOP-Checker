/*
This module is meant for checking the status of maps that get submitted, either
one at a time or whole pools. The actual handling of the maps should be outside
this module. Only methods for checking validity are here, and they can be
called from elsewhere where maps are known and need to be checked.
*/
const fetch = require('node-fetch');

const key = process.env.OSUKEY;
const osuapi = process.env.OSUAPI;

// Mod bitwise
const MODS = {
    EZ: 1 << 1,
    HD: 1 << 3,
    HR: 1 << 4,
    DT: 1 << 6,
    HT: 1 << 8,
    DIFFMODS: 0
};
MODS.DIFFMODS = MODS.HR | MODS.DT | MODS.HT;

// ==============================================================
// ========== These values should be updated each week ==========
// ==============================================================
const minStar = parseFloat(process.env.MIN_STAR);   // Minimum star rating
const maxStar = parseFloat(process.env.MAX_STAR);   // Maximum star rating
const minLength = parseInt(process.env.MIN_LENGTH); // Minimum drain time
const maxLength = parseInt(process.env.MAX_LENGTH); // Maximum drain time
const absoluteMax = parseInt(process.env.ABSOLUTE_MAX); // Maximum length limit
const minTotal = parseInt(process.env.MIN_TOTAL);       // Pool drain limit, per map
const maxTotal = parseInt(process.env.MAX_TOTAL);       // Pool drain limit, per map
const overUnderMax = parseInt(process.env.OVER_UNDER_MAX);  // Number of maps allowed outside time range
const drainBuffer = parseInt(process.env.DRAIN_BUFFER);     // How much time can drain be outside the limits
const leaderboard = parseInt(process.env.LEADERBOARD);      // How many leaderboard scores are required for auto-approval
// ==============================================================
// ==============================================================

/**
 * @param {Number} length The length, in seconds, to convert to string time
 * @returns {String} The passed length, in mm:ss format
 */
function convertSeconds(length)
{
    let seconds = '';
    if (length % 60 < 10)
        seconds += '0';
    seconds += length % 60;
    return (Math.floor(length / 60) + ':' + seconds);
}

/**
 * Gets a map id from a link, or just returns the id received if given one
 * @param {string} mapString A string containing a link to the new or old site, or just the id
 * @returns The map id for the given link, or undefined if no id was found
 */
function parseMapId(mapString)
{
    // If link is already a number then nothing needs to be done
    if (isNaN(mapString))
    {
        // If the link isn't to a beatmap, then ignore it
        // If the link is a /s/ link, ignore it
        if (mapString.includes("sh/b"))
        {
            // Get everything after the last slash, this should be the beatmap id
            mapString = mapString.substring(mapString.lastIndexOf("/") + 1);
            // The parseInt function will convert the beginning of a string to a number
            // until it finds a non-number character
            mapString = parseInt(mapString);
        }
        else
            return undefined;
    }
  
    return mapString | 0;
}

/**
 * Checks an entire pool, including things like duplicates or total drain time, and
 * map-specific things like drain time, length, and stars
 * @param {*[]} maps An array of beatmap objects to check.
 * @param {Number} userid The id of the user submitting the pool
 * @returns {Promise} An array of objects containing the beatmap and pass status,
 *     as well as some stats on the pool itself:
 *     {
 *         overUnder: Number,
 *         totalDrain: Number,
 *         duplicates: Number,
 *         maps: *[],
 *         passed: boolean,
 *         message: string
 *     }
 */
function checkPool(maps, userid)
{
    return new Promise((resolve, reject) => {
        var checkedmaps = [];
        let results = {
            overUnder: 0,
            totalDrain: 0,
            duplicates: 0,
            maps: [],
            passed: false,
            message: undefined
        }
        results.maps = maps.map(map => {
            let status = quickCheck(map, userid);
            // Add the map to the list if it passes the early check
            // Make sure the map is valid
            if (status)
                return {
                    map: map,
                    passed: false,
                    message: status
                };
        
            // Make sure the map hasn't been picked yet
            if (checkedmaps.find(item => item == map.id))
                duplicates++;
            else
                checkedmaps.push(map.beatmap_id);
            // Add to the total drain time
            totalDrain += map.hit_length;
            // Count maps outside the drain limit, but inside the buffer
            let overdrain = map.hit_length - maxLength;
            let underdrain = minLength - map.hit_length;
            if ((overdrain > 0 && overdrain <= drainBuffer)
                    || (underdrain > 0 && underdrain <= drainBuffer))
                overUnder++;
            // Shouldn't need to check for maps outside the limit here,
            // that's done in quickCheck()

            // By this point, maps should be passable
            return {
                map: map,
                passed: true,
                message: undefined
            };
        });
        // Verify values
        if (results.overUnder > overUnderMax)
            results.message = `You can't have more than ${overUnderMax} maps in the drain time buffer range.`;
        else if (results.totalDrain < minTotal * results.maps.length)
            results.message = `Average song length across all maps is too short (${convertSeconds(results.totalDrain)} vs ${minTotal * results.maps.length})`;
        else if (results.totalDrain > maxTotal * results.maps.length)
            results.message = `Average song length across all maps is too long (${convertSeconds(results.totalDrain)} vs ${minTotal * results.maps.length})`;
        else
            results.passed = true;
        
        resolve(results);
    });
}

/**
 * Checks a single beatmap for simple itmes like drain time, star rating, and mode
 * @param beatmap The beatmap to check
 * @returns If the map fails, a message will be returned. Otherwise undefined.
 */
function quickCheck(beatmap, userid)
{
    console.log(beatmap);
    // Check the game mode
    if (beatmap.mode != 0)
        return "This map is for the wrong gamemode";
    // Check drain time
    if (beatmap.hit_length - drainBuffer > maxLength)
        return `Drain time is more than ${drainBuffer} seconds above the ${convertSeconds(maxLength)} limit. (${convertSeconds(map.hit_length)})`;
    else if (beatmap.hit_length + drainBuffer < minLength)
        return `Drain time is more than ${drainBuffer} seconds below the ${convertSeconds(minLength)} limit. (${convertSeconds(map.hit_length)})`;
    // Check total time
    if (beatmap.total_length > absoluteMax)
        return `Total map time is above the ${convertSeconds(absoluteMax)} limit. (${convertSeconds(beatmap.total_length)})`;
    // Check difficulty
    if (beatmap.difficultyrating > maxStar)
        return `Star rating is above the ${maxStar.toFixed(2)} maximum. (${beatmap.difficultyrating})`;
    else if (beatmap.difficultyrating < minStar)
        return `Star rating is below the ${minStar.toFixed(2)} minimum. (${beatmap.difficultyrating})`;
    // Make sure the user didn't make this map themself
    console.log(`Did ${userid} map this?`);
    console.log(`Unranked: ${beatmap.approved != 1} | Creator matches: ${beatmap.creator_id == userid}`);
    if (beatmap.approved != 1 && beatmap.creator_id == userid)
        return `You can't submit your own maps unless they're ranked`;
}

/**
 * Checks a given map for leaderboard info.
 * Will get leaderboard from server, and check the number of scores, and
 * whether the user has a score.
 * @param {Number} mapid The map id to get leaderboard info for
 * @param {Number} mod Bitwise representation of mods to check for
 * @param {Number} userid The user to check on the leaderboard for
 * @returns {Promise<boolean>} Whether the leaderboard would make the map accepted
 */
async function leaderboardCheck(mapid, mod, userid)
{
    console.log(`Checking leaderboard for ${mapid} +${mod}`);
    let response = await fetch(`${osuapi}/get_scores?k=${key}&b=${mapid}&mods=${mod}`);
    let scores = await response.json();
    // If there aren't any passes with the mod, the map needs manual approval
    if (scores.length < 1)
        return false;
    // The leaderboard passes if there are more than n scores, if the
    // first score is perfect, or if the user themself has a score
    console.log("Found leaderboard. Top score:");
    console.log(scores[0]);
    if (scores.length >= leaderboard
            || scores[0].perfect == 1
            || scores.find(score => score.user_id == userid) !== undefined)
        return true;
    return false;
}

/**
 * Gets a single beatmap from the server, and verifies all values are proper
 * @param {Number} mapid The map id to get info for
 * @param {Number} mod The bitwise value of the selected mods
 * @returns {Promise} A promise which will resolve to a beatmap object, or undefined if
 *     no beatmap was found
 */
function getBeatmap(mapid, mod)
{
    return fetch(`${osuapi}/get_beatmaps?k=${key}&b=${mapid}&mods=${mod & MODS.DIFFMODS}`)
        .then(response => response.json())
        .then(data => data[0])
        .then(beatmap => {
            if (!beatmap)
                return undefined;
            // Parse ints/floats
            beatmap.hit_length = parseInt(beatmap.hit_length);
            beatmap.total_length = parseInt(beatmap.total_length);
            // Update length if DT/HT
            if (mod & MODS.DT)
            {
                beatmap.hit_length = (beatmap.hit_length * (2.0 / 3.0)) | 0;
                beatmap.total_length = (beatmap.total_length * (2.0 / 3.0)) | 0;
            }
            else if (mod & MODS.HT)
            {
                beatmap.hit_length = (beatmap.hit_length * (4.0 / 3.0)) | 0;
                beatmap.total_length = (beatmap.total_length * (4.0 / 3.0)) | 0;
            }
            beatmap.difficultyrating = parseFloat(parseFloat(beatmap.difficultyrating).toFixed(2));
            beatmap.mode = parseInt(beatmap.mode);
            beatmap.approved = parseInt(beatmap.approved);
            beatmap.last_update = new Date(beatmap.last_update);
            return beatmap;
        });
}

module.exports = {
    quickCheck,
    leaderboardCheck,
    checkPool,
    getBeatmap,
    MODS,
    parseMapId
};