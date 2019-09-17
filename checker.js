const fetch = require('node-fetch');

const key = process.env.OSUKEY;
const osuapi = process.env.OSUAPI;

// Mod bitwise
const HR = 1 << 4;
const DT = 1 << 6;
const HT = 1 << 8;
const DIFFMODS = HR | DT | HT;

// ==============================================================
// ========== These values should be updated each week ==========
// ==============================================================
const minStar = parseFloat(process.env.OPEN_MIN);   // Minimum star rating
const maxStar = parseFloat(process.env.OPEN_MAX);   // Maximum star rating
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
 * Checks an entire pool, including things like duplicates or total drain time, and
 * map-specific things like drain time, length, stars, and ranked status
 * @param maps An array of beatmap objects to check.
 * @param {Number} userid The id of the user submitting the pool
 * @returns {Promise<boolean>} True or false for whether the pool as a whole passes
 */
function checkPool(maps, userid)
{
    return new Promise((resolve, reject) => {
        var checkedmaps = [];
        var overUnder = 0;
        var totalDrain = 0;
        var duplicates = 0;
        maps.forEach(map => {
            // Make sure the map hasn't been picked yet
            if (checkedmaps.find(item => item == map.id))
                duplicates++;
            else
            {
                // Add the map to the list if it passes the early check
                // Make sure the map is valid
                if (quickCheck(map))
                {
                    checkedmaps.push(map.beatmap_id);
                    // Add to the total drain time
                    totalDrain += result.beatmap.hit_length;
                    // Count maps outside the drain limit, but inside the buffer
                    let overdrain = result.beatmap.hit_length - maxLength;
                    let underdrain = minLength - result.beatmap.hit_length;
                    if ((overdrain > 0 && overdrain <= drainBuffer)
                            || (underdrain > 0 && underdrain <= drainBuffer))
                        overUnder++;
                }
            }
            // Verify values
        });
    });
}

/**
 * Checks a single beatmap for simple itmes like drain time, star rating, and mode
 * @param {*} beatmap The beatmap to check
 * @returns The beatmap object, along with pass/fail status. If the map fails
 *     a fail message will also be included.
 *     {
 *         beatmap: [Object],
 *         passed: false,
 *         message: "Drain time is too long"
 *     }
 */
function quickCheck(beatmap, userid)
{
    // Prepare response object
    let result = {
        beatmap: beatmap,
        passed: false
    };
    // Check the game mode
    if (beatmap.mode != 0)
        result.message = "This map is for the wrong gamemode";
    // Check drain time
    else if (beatmap.hit_length - drainBuffer > maxLength)
        result.message = `Drain time is above the ${convertSeconds(maxLength)} maximum. (${convertSeconds(beatmap.hit_length)})`;
    else if (beatmap.hit_length + drainBuffer < minLength)
        result.message = `Drain time is below the ${convertSeconds(maxLength)} minimum. (${convertSeconds(beatmap.hit_length)})`;
    // Check total time
    else if (beatmap.total_length > absoluteMax)
        result.message = `Total map time is above the ${convertSeconds(absoluteMax)} limit. (${convertSeconds(beatmap.total_length)})`;
    // Check difficulty
    else if (beatmap.difficultyrating > maxStar)
        result.message = `Star rating is above the ${maxStar} maximum. (${beatmap.difficultyrating})`;
    else if (beatmap.difficultyrating < minStar)
        result.message = `Star rating is below the ${minStar} minimum. (${beatmap.difficultyrating})`;
    // Make sure the user didn't make this map themself
    else if (beatmap.approved != 1 && beatmap.creator_id == userid)
        result.message = `You can't submit your own maps unless they're ranked`;
    else
        result.passed = true;
    return result;
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
function leaderboardCheck(mapid, mod, userid)
{
    return fetch(`${osuapi}/get_scores?k=${key}&b=${mapid}&mods=${mod & DIFFMODS}`)
        .then(response => response.json())
        .then(scores => {
            // The leaderboard passes if there are more than 'n' scores, if the
            // first score is perfect, or if the user themself has a score
            if (scores.length >= leaderboard
                    || scores[0].perfect == 1
                    || scores.find(score => score.user_id == userid) !== undefined)
                return true;
            return false;
        });
}

/**
 * Gets a single beatmap from the server, and verifies all values are proper
 * @param {Number} mapid The map id to get info for
 * @param {Number} mod The bitwise value of the selected mods
 */
function getBeatmap(mapid, mod)
{
    return fetch(`${osuapi}/get_beatmaps?k=${key}&b=${mapid}&mods=${mod & DIFFMODS}`)
        .then(response => response.json())
        .then(data => data[0])
        .then(beatmap => {
            if (!beatmap)
                return undefined;
            // Parse ints/floats
            beatmap.hit_length = parseInt(beatmap.hit_length);
            beatmap.total_length = parseInt(beatmap.total_length);
            // Update length if DT/HT
            if (mod & DT)
            {
                beatmap.hit_length = (beatmap.hit_length * (2.0 / 3.0)) | 0;
                beatmap.total_length = (beatmap.total_length * (2.0 / 3.0)) | 0;
            }
            else if (mod & HT)
            {
                beatmap.hit_length = (beatmap.hit_length * (4.0 / 3.0)) | 0;
                beatmap.total_length = (beatmap.total_length * (4.0 / 3.0)) | 0;
            }
            beatmap.difficultyrating = parseFloat(parseFloat(beatmap.difficultyrating).toFixed(2));
            beatmap.mode = parseInt(beatmap.mode);
            beatmap.approved = parseInt(beatmap.approved);
            beatmap.last_update = new Date(beatmap.last_update);
            return beatmap;
        })
}

module.exports = {
    quickCheck,
    leaderboardCheck,
    checkPool,
    getBeatmap
}