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

module.exports = {
    MODS,
    parseMod,
    parseMapId,
    modString,
    mapString,
    mapLink,
    getPlayer
}