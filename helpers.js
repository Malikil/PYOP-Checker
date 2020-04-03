const fetch = require('node-fetch');

const osuapi = "https://osu.ppy.sh/api";
const key = process.env.OSUKEY;

/**
 * Mods bitwise
 */
const MODS = {
    EZ: 1 << 1,
    HD: 1 << 3,
    HR: 1 << 4,
    DT: 1 << 6,
    HT: 1 << 8,
    DIFFMODS: 0
};
MODS.DIFFMODS = MODS.HR | MODS.DT | MODS.HT;

/**
 * Converts a mod string into its number equivalent
 * @param {"NM"|"HD"|"HR"|"DT"|"EZ"|"HT"} modstr Mods in string form. Case insensitive
 * @returns The bitwise number representation of the selected mods
 */
function parseMod(modstr)
{
    let mod = 0;
    modstr = modstr.toUpperCase();
    // Parse mods
    if (modstr.includes('HD')) mod = mod | MODS.HD;
    if (modstr.includes('HR')) mod = mod | MODS.HR;
    else if (modstr.includes('EZ')) mod = mod | MODS.EZ;
    if (modstr.includes('DT')) mod = mod | MODS.DT;
    else if (modstr.includes('HT')) mod = mod | MODS.HT;
    
    return mod;
}

/**
 * Gets a mod pool string from a mod combination
 * @param {number} bitwise The bitwise number representation of the mods
 */
function getModpool(bitwise)
{
    switch (bitwise)
    {
        case 0:               return "nm";
        case helpers.MODS.HD: return "hd";
        case helpers.MODS.HR: return "hr";
        case helpers.MODS.DT: return "dt";
        default:              return "cm";
    }
}

/**
 * Converts a mod number to its string form
 * @param {number} mod Mods in bitwise form, as per osu api
 */
function modString(mod)
{
    let _dt = false;
    let str = '';
    if (mod & MODS.HD)      str += 'HD';
    if (mod & MODS.DT)      _dt = true;
    else if (mod & MODS.HT) str += 'HT';
    if (mod & MODS.HR)      str += 'HR';
    else if (mod & MODS.EZ) str = 'EZ' + str;
    if (_dt)                str += 'DT';
    if (str == '')          str = 'NoMod';
    return str;
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
 * Converts a map object to the artist - title [version] format
 */
const mapString = map => `${map.artist} - ${map.title} [${map.version}]`;
const mapLink = map => `https://osu.ppy.sh/b/${map.id}`;

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
 * Gets a single player from the osu server based on id or username
 * @param {String|Number} osuid 
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

module.exports = {
    MODS,
    parseMod,
    parseMapId,
    getModpool,
    modString,
    mapString,
    mapLink,
    convertSeconds,
    getPlayer,
    getBeatmap
}