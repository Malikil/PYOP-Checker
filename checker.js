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
 * Checks an entire pool, including things like duplicates or total drain time.
 * Doesn't really check the map things.
 * @param {*[]} maps An array of map objects to check.
 * @returns {Promise<{
 *     overUnder: Number,
 *     totalDrain: Number,
 *     duplicates: {
 *             id: Number,
 *             status: string,
 *             drain: Number,
 *             stars: Number,
 *             artist: string,
 *             title: string,
 *             version: string
 *         }[],
 *     message: string[]
 * }
 * >} An array of objects containing the beatmap and pass status,
 *     as well as some stats on the pool itself
 */
async function checkPool(maps)
{
    let checkedmaps = [];
    let results = {
        overUnder: 0,
        totalDrain: 0,
        duplicates: [],
        message: []
    };
    maps.forEach(map => {
        // See if the map has been picked
        if (checkedmaps.find(item => item == map.id))
            results.duplicates.push(map);
        else
            checkedmaps.push(map.id);

        results.totalDrain += map.drain;

        // Count maps within the drain buffer range
        let overdrain = map.drain - maxLength;
        let underdrain = minLength - map.drain;
        if ((overdrain > 0 && overdrain <= drainBuffer)
                || (underdrain > 0 && underdrain <= drainBuffer))
            results.overUnder++;
    });

    // Verify values
    if (results.overUnder > overUnderMax)
        results.message.push(`You can't have more than ${overUnderMax} maps in the drain time buffer range.`);
    if (results.totalDrain < minTotal * maps.length)
        results.message.push(`Average song length across all maps is too short (${convertSeconds(results.totalDrain)} ` +
            `vs ${maps.length} maps -> ${convertSeconds(minTotal * maps.length)})`);
    else if (results.totalDrain > maxTotal * maps.length)
        results.message.push(`Average song length across all maps is too long (${convertSeconds(results.totalDrain)} ` +
            `vs ${maps.length} maps -> ${convertSeconds(maxTotal * maps.length)})`);
    if (results.duplicates.length > 0)
        results.message.push(`You can't have the same map more than once in your pool. (${results.duplicates.length} duplicates found)`);

    return results;
}

/**
 * Checks a single beatmap for simple itmes like drain time, star rating, and mode
 * @param beatmap The beatmap to check
 * @returns If the map fails, a message will be returned. Otherwise undefined.
 */
function quickCheck(beatmap, userid)
{
    console.log(beatmap);
    if (!beatmap)
        return "That map doesn't exist";
    // Check the game mode
    if (!!beatmap.mode)
        return "This map is for the wrong gamemode";
    // Check drain time
    if (beatmap.drain - drainBuffer > maxLength)
        return `Drain time is more than ${drainBuffer} seconds above the ${convertSeconds(maxLength)} limit. (${convertSeconds(beatmap.drain)})`;
    else if (beatmap.drain + drainBuffer < minLength)
        return `Drain time is more than ${drainBuffer} seconds below the ${convertSeconds(minLength)} limit. (${convertSeconds(beatmap.drain)})`;
    // Check total time
    if (beatmap.total_length > absoluteMax)
        return `Total map time is above the ${convertSeconds(absoluteMax)} limit. (${convertSeconds(beatmap.total_length)})`;
    // Check difficulty
    if (beatmap.stars > maxStar)
        return `Star rating is above the ${maxStar.toFixed(2)} maximum. (${beatmap.stars})`;
    else if (beatmap.stars < minStar)
        return `Star rating is below the ${minStar.toFixed(2)} minimum. (${beatmap.stars})`;
    console.log("Seems okay");
    // Make sure the user didn't make this map themself
    if (userid)
    {
        console.log(`Did ${userid} map this?`);
        console.log(`Unranked: ${beatmap.approved != 1} | Creator matches: ${beatmap.creator_id == userid}`);
        if (beatmap.approved != 1 && beatmap.creator_id == userid)
            return `You can't submit your own maps unless they're ranked`;
    }
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
    // I believe the api returns an empty array for unranked maps. If it doesn't
    // then this will need to be changed.
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
async function getBeatmap(mapid, mod)
{
    let response = await fetch(`${osuapi}/get_beatmaps?k=${key}&b=${mapid}&mods=${mod & MODS.DIFFMODS}`);
    let data = await response.json();
    let beatmap = data[0];
    if (!beatmap)
        return undefined;
    // Parse ints/floats
    beatmap.drain = parseInt(beatmap.hit_length);
    beatmap.total_length = parseInt(beatmap.total_length);
    beatmap.bpm = parseFloat(beatmap.bpm);
    // Update length/bpm if DT/HT
    if (mod & MODS.DT)
    {
        beatmap.bpm = beatmap.bpm * (3.0 / 2.0);
        beatmap.drain = (beatmap.drain * (2.0 / 3.0)) | 0;
        beatmap.total_length = (beatmap.total_length * (2.0 / 3.0)) | 0;
    }
    else if (mod & MODS.HT)
    {
        beatmap.bpm = beatmap.bpm * (3.0 / 4.0);
        beatmap.drain = (beatmap.drain * (4.0 / 3.0)) | 0;
        beatmap.total_length = (beatmap.total_length * (4.0 / 3.0)) | 0;
    }
    beatmap.stars = parseFloat(parseFloat(beatmap.difficultyrating).toFixed(2));
    beatmap.mode = parseInt(beatmap.mode);
    beatmap.approved = parseInt(beatmap.approved);
    beatmap.last_update = new Date(beatmap.last_update);
    return beatmap;
}

/**
 * Gets a single player from the osu server based on id or username
 * @param {String|Number} osuid 
 */
async function getPlayer(osuid)
{
    let response = await fetch(`${osuapi}/get_user?k=${key}&u=${osuid}`);
    let data = await response.json();
    let user = data[0];
    if (!user)
        return undefined;
    // The user id should be an int
    user.user_id = parseInt(user.user_id);
    return user;
}

module.exports = {
    quickCheck,
    leaderboardCheck,
    checkPool,
    getBeatmap,
    getPlayer,
    MODS,
    parseMapId,
    convertSeconds
};