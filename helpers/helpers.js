const fetch = require('node-fetch');
const ojsama = require('ojsama');
const readline = require('readline');
const { CheckableMap, DbBeatmap } = require('./../types');
const MODS = require('./bitwise');

const osuapi = "https://osu.ppy.sh/api";
const key = process.env.OSUKEY;

/**
 * Gets which week the tournament is currently in
 * @param {*[]} arr An array of objects to return from
 * @returns {Number|*} If an array is given, the object at this week's index will
 * be returned. Otherwise the index for this week will be given
 */
function currentWeek(arr) {
    // The date will determine which week we're in
    const firstDue = new Date(process.env.FIRST_POOLS_DUE);
    let now = new Date();
    // Add one because firstDue marks the end of week 1 rather than the beginning
    let week = ((now - firstDue) / (1000 * 60 * 60 * 24 * 7) + 1) | 0;
    if (arr)
    {
        if (week < 0)
            return arr[0];
        else if (week < arr.length)
            return arr[week];
        else
            return arr[arr.length - 1];
    }
    else
        return week;
}

function closingTimes() {
    const lastClose = new Date(process.env.FIRST_POOLS_DUE);
    const now = new Date();
    // While it's more than an hour since pools should have closed
    while (now > lastClose) {
        lastClose.setUTCDate(lastClose.getUTCDate() + 7);
        console.log(`Incrementing closing time to ${lastClose}`);
    }
    const nextClose = new Date(lastClose);
    lastClose.setUTCDate(lastClose.getUTCDate() - 7);
    return {
        lastClose,
        nextClose,
        now
    };
}

/**
 * Converts a mod string into its number equivalent
 * @param {"NM"|"HD"|"HR"|"DT"|"EZ"|"HT"} modstr Mods in string form. Case insensitive
 * @returns The bitwise number representation of the selected mods
 */
function parseMod(modstr)
{
    // Undefined check
    if (!modstr) return 0;

    let mod = 0;
    modstr = modstr.toUpperCase();
    // Parse mods
    if (modstr.includes('HD'))      mod |= MODS.HD;
    if (modstr.includes('HR'))      mod |= MODS.HR;
    else if (modstr.includes('EZ')) mod |= MODS.EZ;
    if (modstr.includes('DT'))      mod |= MODS.DT;
    else if (modstr.includes('NC')) mod |= MODS.NC | MODS.DT;
    else if (modstr.includes('HT')) mod |= MODS.HT;
    
    return mod & MODS.ALLOWED;
}

/**
 * Gets a mod pool string from a mod combination
 * @param {number} bitwise The bitwise number representation of the mods
 * @deprecated The concept of dedicated pools is deprecated.
 * Actual mods value should be preferred
 */
function getModpool(bitwise)
{
    switch (bitwise)
    {
        case 0:       return "nm";
        case MODS.HD: return "hd";
        case MODS.HR: return "hr";
        case MODS.DT: return "dt";
        default:      return "cm";
    }
}

/**
 * Converts a mod number to its string form
 * @param {number} mod Mods in bitwise form, as per osu api
 */
function modString(mod)
{
    let str = '';
    if (mod & MODS.HD)      str += 'HD';
    if (mod & MODS.NC)      str += 'NC';
    else if (mod & MODS.DT) str += 'DT';
    else if (mod & MODS.HT) str += 'HT';
    if (mod & MODS.HR)      str += 'HR';
    else if (mod & MODS.EZ) str = 'EZ' + str;
    if (str == '')          str = 'NM';
    return str;
}

/**
 * Gets a map id from a link, or just returns the id received if given one
 * @param {string} mapString A string containing a link to the new or old site, or just the id
 * @returns The map id for the given link, or undefined if no id was found
 */
function parseMapId(mapString = '')
{
    // If link is already a number then nothing needs to be done
    if (isNaN(mapString))
    {
        // If the link isn't to a beatmap, then ignore it
        // If the link is a /s/ link, ignore it
        // ...ppy.sh/beatmapsets...
        // ...ppy.sh/b/###
        if (mapString && mapString.includes("sh/b"))
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
 * Converts a map object to the artist - title [version] format
 */
const mapString = map => `${map.artist} - ${map.title} [${map.version}]`;
/** osu.ppy.sh/b/${beatmap id} */
const mapLink = map => {
    if (map instanceof DbBeatmap)
        return `https://osu.ppy.sh/b/${map.bid}`;
    else
        return `https://osu.ppy.sh/b/${map.beatmap_id}`;
};

/**
 * Converts from integer seconds to mm:ss time format
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
 * Gets a single player from the osu server based on id or username
 * @param {String|Number} osuid 
 * @deprecated Use ApiPlayer
 */
async function getPlayer(osuid)
{
    let response = await fetch(`${osuapi}/get_user?k=${key}&u=${osuid}`);
    let user = (await response.json())[0];
    if (!user)
        return undefined;
    // The user id should be an int
    user.user_id = parseInt(user.user_id);
    return user;
}

/**
 * Gets a single beatmap from the server, and verifies all values are proper
 * @param {Number} mapid The map id to get info for
 * @param {Number} mods The bitwise value of the selected mods
 * @returns {Promise<CheckableMap>} A promise which will resolve to a beatmap object, or undefined if
 *     no beatmap was found
 * @deprecated Use ApiBeatmap
 */
async function getBeatmap(mapid, mods)
{
    console.log(`Getting map with id ${mapid} and mods ${mods}`);
    let response = await fetch(`${osuapi}/get_beatmaps?k=${key}&b=${mapid}&m=0&mods=${mods & MODS.DIFFMODS}`);
    let data = await response.json();
    let beatmap = data[0];
    if (!beatmap)
        return;
    let map = new CheckableMap({
        bid: parseInt(beatmap.beatmap_id),
        artist: beatmap.artist,
        title: beatmap.title,
        version: beatmap.version,
        creator: beatmap.creator,
        mods: mods & MODS.ALLOWED,
        drain: parseInt(beatmap.hit_length),
        bpm: parseFloat(beatmap.bpm),
        stars: parseFloat(parseFloat(beatmap.difficultyrating).toFixed(2)),
        data: {
            total_length: parseInt(beatmap.total_length)
        }
    });
    // Find the ms delay
    let ar = beatmap.diff_approach;
    if (mods & MODS.HR)
        ar = Math.min(ar * 1.4, 10);
    else if (mods & MODS.EZ)
        ar /= 2;
    let arscale = 750;
    if (ar < 5)
        arscale = 600;
    map.data.ar_delay = 1200 + (arscale * (5 - ar) / 5);
    // Update length/bpm if DT/HT
    if (mods & MODS.DT)
    {
        map.data.total_length = (map.data.total_length * (2.0 / 3.0)) | 0;
        map.drain = (map.drain * (2.0 / 3.0)) | 0;
        map.data.ar_delay *= (2.0 / 3.0);
        map.bpm = parseFloat((map.bpm * (3.0 / 2.0)).toFixed(3));
    }
    else if (mods & MODS.HT)
    {
        map.data.total_length = (map.data.total_length * (4.0 / 3.0)) | 0;
        map.drain = (map.drain * (4.0 / 3.0)) | 0;
        map.data.ar_delay *= (4.0 / 3.0);
        map.bpm = parseFloat((map.bpm * (3.0 / 4.0)).toFixed(3));
    }
    return map;
}

async function getLeaderboard(mapid, mods = 0)
{
    let response = await fetch(`https://osu.ppy.sh/api/get_scores?k=${key}&b=${mapid}&m=0&mods=${mods}`);
    return response.json();
}

/**
 * Gets a beatmap object which can be used to calculate sr or find hitobjects
 * @param {number} mapid The beatmap id to get info for
 * @param {number} mods The mods to use when parsing the map
 * @returns {Promise<CheckableMap>}
 * @deprecated Go back to using getBeatmap
 */
function beatmapObject(mapid, mods = 0)
{
    return new Promise(async (resolve, reject) => {
        let response = await fetch(`https://osu.ppy.sh/osu/${mapid}`);
        let parser = new ojsama.parser();
        readline.createInterface({
            input: response.body,
            terminal: false
        })
        .on('line', parser.feed_line.bind(parser))
        .on('close', () => {
            try
            {
                if (parser.map.objects.length < 1)
                    return reject({ error: "Map doesn't exist" });
                let map = new CheckableMap({
                    bid: mapid,
                    artist: parser.map.artist,
                    title: parser.map.title,
                    version: parser.map.version,
                    creator: parser.map.creator,
                    data: {}
                });
                // Make sure the map is for std, otherwise star calculation breaks
                if (parser.map.mode !== 0)
                    return reject({
                        error: "Map is not a std map",
                        map
                    });
                // Convert hit objects
                // Assume timing points are in order
                let timingindex = 0;
                let basems = parser.map.timing_points[0].ms_per_beat;
                let inherited = -100;
                map.data.objects = parser.map.objects.map(hitobject => {
                    let obj = {
                        type: hitobject.type,
                        time: hitobject.time
                    };
                    if (hitobject.type & (1 << 1))
                    {
                        while (parser.map.timing_points.length > timingindex &&
                                hitobject.time >= parser.map.timing_points[timingindex].time)
                        {
                            // Update ms per beat values
                            if (parser.map.timing_points[timingindex].change)
                            {
                                basems = parser.map.timing_points[timingindex].ms_per_beat;
                                inherited = -100;
                            }
                            else
                                inherited = Math.max(parser.map.timing_points[timingindex].ms_per_beat, -1000);
                            // Increment index
                            timingindex++;
                        }
                        // Calculate the ms per beat
                        let svms = basems / (-100 / inherited);
                        let mslength = hitobject.data.distance / (parser.map.sv * 100) * svms * hitobject.data.repetitions;
                        obj.end = hitobject.time + mslength;
                    }
                    // If the object has extended data, add the position
                    else if (hitobject.data)
                        obj.pos = {
                            x: hitobject.data.pos[0],
                            y: hitobject.data.pos[1]
                        };
                    return obj;
                });
                // Drain/total time
                let last = map.data.objects[map.data.objects.length - 1];
                let first = map.data.objects[0];
                map.data.total_length = parseInt((last.time / 1000).toFixed(0));
                map.drain = parseInt(((last.time - first.time) / 1000).toFixed(0));
                // Stars
                map.stars = parseFloat(new ojsama.diff().calc({ map: parser.map, mods }).total.toFixed(2));
                // BPM
                let bpms = parser.map.timing_points.reduceRight((vals, point) => {
                    if (!point.change)
                        return vals;
                    let bpm = 1 / point.ms_per_beat * 1000 * 60;
                    // Round bpm to three decimal places
                    bpm = bpm.toFixed(3);
                    let time = vals.last - point.time;
                    vals[bpm] = (vals[bpm] || 0) + time;
                    vals.last = point.time;
                    return vals;
                }, { last: last.time });
                console.log(`${mapid} has bpms:`);
                console.log(bpms);
                map.bpm = parseFloat(
                    Object.keys(bpms).reduce((p, c) => bpms[c] < bpms[p] ? p : c, 0)
                );
                // Find AR for ms delay
                let ar = parser.map.ar;
                if (ar === undefined)
                    ar = parser.map.od;
                if (mods & MODS.HR)
                    ar = Math.min(ar * 1.4, 10);
                else if (mods & MODS.EZ)
                    ar /= 2;
                // Convert to ms
                console.log(`Approach Rate: ${ar}`);
                if (ar < 5)
                    map.data.ar_delay = 1200 + (600 * (5 - ar) / 5);
                else if (ar > 5)
                    map.data.ar_delay = 1200 - (750 * (ar - 5) / 5);
                else
                    map.data.ar_delay = 1200;

                // Update with dt/ht
                if (mods & MODS.DT)
                {
                    map.data.total_length = (map.data.total_length * (2.0 / 3.0)) | 0;
                    map.drain = (map.drain * (2.0 / 3.0)) | 0;
                    map.data.ar_delay *= (2.0 / 3.0);
                    map.bpm = parseFloat((map.bpm * (3.0 / 2.0)).toFixed(3));
                }
                else if (mods & MODS.HT)
                {
                    map.data.total_length = (map.data.total_length * (4.0 / 3.0)) | 0;
                    map.drain = (map.drain * (4.0 / 3.0)) | 0;
                    map.data.ar_delay *= (4.0 / 3.0);
                    map.bpm = parseFloat((map.bpm * (3.0 / 4.0)).toFixed(3));
                }
                // Add mods to make it easier later
                map.mods = mods;

                resolve(map);
            }
            catch (err)
            {
                console.error(err);
                reject(err);
            }
        });
    });
}

module.exports = {
    currentWeek,
    parseMod,
    parseMapId,
    getModpool,
    modString,
    mapString,
    mapLink,
    convertSeconds,
    closingTimes,
    getPlayer,
    getBeatmap,
    getLeaderboard,
    beatmapObject
}