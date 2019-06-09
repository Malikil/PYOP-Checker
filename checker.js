const fetch = require('node-fetch');
const { Beatmap, Score } = require('./osu-entities');

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
const openMin = parseFloat(process.env.OPEN_MIN);
const openMax = parseFloat(process.env.OPEN_MAX);
const fiftMin = parseFloat(process.env.FIFT_MIN);
const fiftMax = parseFloat(process.env.FIFT_MAX);
const minLength = parseInt(process.env.MIN_LENGTH);
const maxLength = parseInt(process.env.MAX_LENGTH);
const absoluteMax = parseInt(process.env.ABSOLUTE_MAX);
const minTotal = parseInt(process.env.MIN_TOTAL);
const maxTotal = parseInt(process.env.MAX_TOTAL);
const overUnderMax = parseInt(process.env.OVER_UNDER_MAX);
const drainBuffer = parseInt(process.env.DRAIN_BUFFER);
const earliest = new Date(process.env.EARLIEST);
const leaderboard = parseInt(process.env.LEADERBOARD);
const poolSize = parseInt(process.env.POOL_SIZE);
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
 * Checks a pool for items like duplicate maps
 * @param {*} maps An array of maps to check for consistency
 */
function checkPool(maps)
{
    return new Promise((resolve, reject) => {
        var poolProblems = {
            duplicates: false,
            drainRange: false
        };
        var checkedmaps = [];
        var overUnder = 0;
        var totalDrain = 0;
        var mapcount = 0;
        maps.forEach(map => {
            // Check for duplicates
            if (map.passed !== false)
            {
                totalDrain += map.drain;
                mapcount++;
                if (map.passed)
                {
                    if (checkedmaps.find(item => item == map.map.id) === undefined)
                        maps.push(map.map.id);
                    else
                        poolProblems.duplicates = true;
                }
            }
        });
    });
    resolve({
        passed: false,
        reject: {
            reason: `You have more than two maps outside the normal allowed drain range. Only two maps are allowed to use the ${drainBuffer} second buffer.`
        },
        drain: length
    });
}

/**
 * @param {any} map An object with the map's id and mod
 * @param {String} range The rank bracket for the beatmap
 * @param {String} user The username of the player
 * @returns {Promise<any>} Returns a promise which will resolve to an object containing the pass/fail status
 */
function checkMap(map, range, user)
{
    return new Promise((resolve, reject) => {
        if (Number.isInteger(map.id) && map.id > 0)
        {
            var min, max;
            if (range == "15k")
            {
                min = fiftMin;
                max = fiftMax;
            }
            else
            {
                min = openMin;
                max = openMax;
            }
            fetch(`${osuapi}/get_beatmaps?k=${key}&b=${map.id}&mods=${map.mod & DIFFMODS}`)
            .then(response => response.json())
            .then(data => data[0])
            .then(/** @param {Beatmap} beatmap */ beatmap => {
                // Make sure the response is legible
                if (!!!beatmap)
                    return ({
                        passed: undefined
                    });
                console.log(`Checking map ${beatmap.beatmap_id}`);
                // Make sure it's a standard map
                if (beatmap.mode != 0)
                    return ({
                        passed: false,
                        reject: {
                            map: map,
                            reason: "This isn't a standard map. Did you post the wrong link/id?"
                        }
                    });
                // Prepare all the variables used to check
                let stars = parseFloat(parseFloat(beatmap.difficultyrating).toFixed(2));
                console.log(`Stars: ${stars} (${beatmap.difficultyrating})`);
                // Drain time
                let length = parseInt(beatmap.hit_length);
                let fullLength = parseInt(beatmap.total_length);
                // Take DT/HT into account
                if (map.mod & DT)
                {
                    length *= (2.0 / 3.0);
                    fullLength *= (2.0 / 3.0);
                    length = length | 0;
                    fullLength = fullLength | 0;
                }
                else if (map.mod & HT)
                {
                    length *= (4.0 / 3.0);
                    fullLength *= (4.0 / 3.0);
                    length = length | 0;
                    fullLength = fullLength | 0;
                }
                console.log(`Drain after mods: ${length} (mods ${map.mod})`);
                // Last updated
                let updated = new Date(beatmap.last_update);
                console.log(`Date string: ${beatmap.last_update} => ${updated}`);
                console.log(`Ranked status: ${beatmap.approved} (Ranked => 1)`);
                // Check values
                // Total length
                if (fullLength > absoluteMax)
                    return ({
                        passed: false,
                        reject: {
                            map: map,
                            reason: `The total length of this map is over the ${convertSeconds(absoluteMax)} maximum limit. (${convertSeconds(fullLength)})`
                        },
                        drain: length
                    });
                // Check the drain time
                else if (length < minLength - drainBuffer)
                {
                    console.log(`${length} < ${minLength - drainBuffer} returned true`);
                    return ({
                        passed: false,
                        reject: {
                            map: map,
                            reason: `The drain time of this map is more than ${drainBuffer} seconds under the ${convertSeconds(minLength)} minimum. (${convertSeconds(length)})`
                        },
                        drain: length
                    });
                }
                else if (length > maxLength + drainBuffer)
                {
                    console.log(`${length} > ${maxLength + drainBuffer} returned true`);
                    return ({
                        passed: false,
                        reject: {
                            map: map,
                            reason: `The drain time of this map is more than ${drainBuffer} seconds over the ${convertSeconds(maxLength)} maximum. (${convertSeconds(length)})`
                        },
                        drain: length
                    });
                }
                // Check stars
                else if (stars < min)
                    return ({
                        passed: false,
                        reject: {
                            map: map,
                            reason: `The star rating of this map is below the ${min} minimum allowed for this week. (${stars})`
                        },
                        drain: length
                    });
                else if (stars > max)
                    return ({
                        passed: false,
                        reject: {
                            map: map,
                            reason: `The star rating of this map is above the ${max} maximum allowed for this week. (${stars})`
                        },
                        drain: length
                    });
                // Check date
                else if (updated < earliest)
                    return ({
                        passed: false,
                        reject: {
                            map: map,
                            reason: `This map is from ${updated.getFullYear()}, maps before ${earliest.getFullYear()} aren't allowed for this time.`
                        },
                        drain: length
                    });
                // If the map is ranked proper, it can probably get partially approved. Otherwise it should be left to manual
                else if (beatmap.approved == 1)
                    return ({
                        passed: true,
                        map: map,
                        drain: length
                    });
                else
                    return ({
                        passed: undefined,
                        map: map,
                        drain: length
                    });
            }).then(status => {
                if (status.passed)
                    fetch(`${osuapi}/get_scores?k=${key}&b=${map.id}&mods=${map.mod}`)
                    .then(response => response.json())
                    .then(/** @param {Score[]} scores */scores => {
                        console.log(`Found ${scores.length} scores`);
                        if (scores.length > leaderboard)
                            resolve(status);
                        else if (scores[0].perfect == 1)
                            resolve(status);
                        else
                        {
                            let passed = false;
                            // The top play isn't an fc, and there are less than 20 plays
                            // Check if the user has one of the plays
                            for (let i = 0; i < scores.length && !passed; i++)
                                if (scores[i].username == user)
                                    passed = true;
                            if (!passed)
                                status.passed = undefined;
                        }
                    });
                else
                    resolve(status);
            })
        }
        else
            resolve({ passed: undefined });
    });
}

module.exports = {
    checkMap,
    checkPool
}