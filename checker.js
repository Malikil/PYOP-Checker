/*
This module is meant for checking the status of maps that get submitted, either
one at a time or whole pools. The actual handling of the maps should be outside
this module. Only methods for checking validity are here, and they can be
called from elsewhere where maps are known and need to be checked.
*/
const fetch = require('node-fetch');
const { MODS, convertSeconds, modString } = require('./helpers');
const ojsama = require('ojsama');
const { DbBeatmap, CheckableMap } = require('./types');

const key = process.env.OSUKEY;
const osuapi = process.env.OSUAPI;

// ==============================================================
// ========== These values should be updated each week ==========
// ==============================================================
const minStar = parseFloat(process.env.MIN_STAR);   // Minimum star rating
const maxStar = parseFloat(process.env.MAX_STAR);   // Maximum star rating
const lowMin = parseFloat(process.env.FIFT_MIN);
const lowMax = parseFloat(process.env.FIFT_MAX);
const minLength = parseInt(process.env.MIN_LENGTH); // Minimum drain time
const maxLength = parseInt(process.env.MAX_LENGTH); // Maximum drain time
const absoluteMax = parseInt(process.env.ABSOLUTE_MAX); // Maximum length limit
const minTotal = parseInt(process.env.MIN_TOTAL);       // Pool drain limit, per map
const maxTotal = parseInt(process.env.MAX_TOTAL);       // Pool drain limit, per map
const overUnderMax = parseInt(process.env.OVER_UNDER_MAX);  // Number of maps allowed outside time range
const drainBuffer = parseInt(process.env.DRAIN_BUFFER);     // How much time can drain be outside the limits
const leaderboard = parseInt(process.env.LEADERBOARD);      // How many leaderboard scores are required for auto-approval
const leaders15k = parseInt(process.env.FIFT_LEADERBOARD);
// ==============================================================
// ==============================================================

/**
 * Checks an entire pool, including things like duplicates or total drain time.
 * Doesn't really check the map things.
 * @param {DbBeatmap[]} maps An array of map objects to check.
 * @returns {Promise<{
 *     overUnder: Number,
 *     totalDrain: Number,
 *     duplicates: DbBeatmap[],
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
        if (checkedmaps.find(item => item === map.bid))
            results.duplicates.push(map);
        else
            checkedmaps.push(map.bid);

        results.totalDrain += map.drain;

        // Count maps within the drain buffer range
        let overdrain = map.drain - maxLength;
        let underdrain = minLength - map.drain;
        if (overdrain > 0 || underdrain > 0)
            results.overUnder++;
    });

    // Verify values
    if (results.overUnder > overUnderMax)
        results.message.push(`You can't have more than ${overUnderMax} maps in the drain time buffer range.`);
    if (results.totalDrain < minTotal * maps.length)
        results.message.push(`Average song length across all maps is too short (Current: ${convertSeconds(results.totalDrain)}, ` +
            `Expected: ${maps.length} maps -> ${convertSeconds(minTotal * maps.length)})`);
    else if (results.totalDrain > maxTotal * maps.length)
        results.message.push(`Average song length across all maps is too long (Current: ${convertSeconds(results.totalDrain)}, ` +
            `Expected: ${maps.length} maps -> ${convertSeconds(maxTotal * maps.length)})`);
    if (results.duplicates.length > 0)
        results.message.push(`You can't have the same map more than once in your pool. (${results.duplicates.length} duplicates found)`);

    return results;
}

/**
 * Checks a single beatmap for simple itmes like drain time, star rating, and mode
 * @param beatmap The beatmap to check
 * @param {number} userid The osuid to check against the mapper
 * @param {boolean} lowDiv True if the low division should be used, otherwise open
 * @returns If the map fails, a message will be returned. Otherwise undefined.
 * @deprecated Use mapCheck() instead
 */
function quickCheck(beatmap, userid = undefined, lowDiv = false)
{
    console.log({
        bid: beatmap.beatmap_id,
        artist: beatmap.artist,
        title: beatmap.title,
        version: beatmap.version,
        creator: beatmap.creator,
        approved: beatmap.approved,
        mode: beatmap.mode,
        drain: beatmap.drain,
        length: beatmap.total_length,
        stars: beatmap.stars
    });
    console.log(`For 15k? ${lowDiv}`);
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
    let min = minStar;
    let max = maxStar;
    if (lowDiv)
    {
        min = lowMin;
        max = lowMax;
    }
    if (beatmap.stars > max)
        return `Star rating is above the ${max.toFixed(2)} maximum. (${beatmap.stars})`;
    else if (beatmap.stars < min)
        return `Star rating is below the ${min.toFixed(2)} minimum. (${beatmap.stars})`;
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
 * Checks a map for basic items like star rating, drain length, and creator
 * @param {CheckableMap} map The map object to check
 * @param {"Open"|"15k"} division Which division the map should fall into
 * @param user The osu username of the person performing the check
 * @returns {Promise<{
 *  rejected: boolean,
 *  reject_on?: "Drain"|"Length"|"Stars"|"Data",
 *  reject_type?: "High"|"Low",
 *  issues?: ("2b"|"slider2b"|"spinner"|"position"|"user")[]
 * }>} A map object with all needed basic info
 */
async function mapCheck(map, division = undefined, user = "")
{
    // Check drain length
    if (map.drain - drainBuffer > maxLength)
        return {
            rejected: true,
            reject_on: "Drain",
            reject_type: "High"
        };
    else if (map.drain + drainBuffer < minLength)
        return {
            rejected: true,
            reject_on: "Drain",
            reject_type: "Low"
        };
    // Check total length
    if (map.data.total_length > absoluteMax)
        return {
            rejected: true,
            reject_on: "Length",
            reject_type: "High"
        };
    // Check stars
    let min = minStar;
    let max = maxStar;
    if (division === "15k")
    {
        min = lowMin;
        max = lowMax;
    }
    if (map.stars > max)
        return {
            rejected: true,
            reject_on: "Stars",
            reject_type: "High"
        };
    else if (map.stars < min)
        return {
            rejected: true,
            reject_on: "Stars",
            reject_type: "Low"
        };
    // Check map creator
    /** @type {("2b"|"slider2b"|"spinner"|"position"|"user")[]} */
    let issues = [];
    if (map.creator === user)
        issues.push("user");
    // Check object data
    // 2b and circles appearing before spinner
    let last;
    map.data.objects.forEach(obj => {
        if (last)
        {
            // Check 2b circles
            if (Math.abs(obj.time - last.time) <= 10)
                issues.push("2b");
            // Check circles during slider
            // It looks like the library I use for parsing beatmaps doesn't
            // save spinner lengths >:(
            // I'd like to avoid parsing manually if possible D:
            // I'll see how well things go if I just leave it out
            else if ((last.type & (1 << 1)) && (obj.time < last.end)) // Slider
                issues.push("slider2b");
            else if ((last.type & (1 << 3)) && (obj.time - map.data.ar_delay) < (last.time - 330))
                issues.push("spinner");
            
            // How big is the playfield?
            // 512 x 384
            if (obj.pos && (
                    obj.pos.x > 512 || obj.pos.x < 0 ||
                    obj.pos.y > 384 || obj.pos.y < 0
            )) issues.push("position");
        }
        last = obj;
    });
    if (issues.length > 0)
        return {
            rejected: issues.includes("slider2b") || issues.includes("2b"),
            reject_on: "Data",
            issues
        };
    else
        return { rejected: false };
}

/**
 * Checks a given map for leaderboard info.
 * Will get leaderboard from server, and check the number of scores, and
 * whether the user has a score.
 * @param {Number} mapid The map id to get leaderboard info for
 * @param {Number} mod Bitwise representation of mods to check for
 * @param {"15k"|"Open"} division Which division to check for
 * @param {Number} userid The user to check on the leaderboard for
 * @returns {Promise<{
 *  passed: boolean,
 *  message?: string
 * }>} Whether the leaderboard would make the map accepted
 */
async function leaderboardCheck(mapid, mod, division, userid)
{
    console.log(`Checking leaderboard for ${mapid} +${mod}`);
    let response = await fetch(`${osuapi}/get_scores?k=${key}&b=${mapid}&mods=${mod}`);
    let scores = await response.json();
    // If there aren't any passes with the mod, the map needs manual approval
    // I believe the api returns an empty array for unranked maps. If it doesn't
    // then this will need to be changed.
    if (scores.length < 1)
        return {
            passed: false,
            message: "No scores on leaderboard or no leaderboard found"
        };
    // The leaderboard passes if there are more than n scores, if the
    // first score is perfect, or if the user themself has a score
    console.log(`Found ${scores.length} leaderboard scores. Top score:`);
    let s = scores[0];
    console.log(`${s.username} - ${
        ((s.count50 / 6) + (s.count100 / 3) + parseInt(s.count300))
        / (parseInt(s.count50) + parseInt(s.count100) + parseInt(s.count300) + parseInt(s.countmiss))
        * 100
    }% ${s.rank} | Perfect: ${s.perfect}`);
    if (scores.length >= (division === "15k" ? leaders15k : leaderboard)
            || scores[0].perfect == 1
            || scores.find(score => score.user_id == userid) !== undefined)
        return { passed: true };
    return {
        passed: false,
        message: `There are only ${scores.length} scores with ${modString(mod)}`
    };
}

module.exports = {
    quickCheck,
    leaderboardCheck,
    checkPool,
    mapCheck,
    checkVals: {
        minStar,
        maxStar,
        lowMin,
        lowMax,
        minLength,
        maxLength,
        absoluteMax,
        drainBuffer,
        leaderboard,
        leaders15k
    }
};