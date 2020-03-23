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
 * Converts a map object to the artist - title [version] format
 */
const mapString = map => `${map.artist} - ${map.title} [${map.version}]`;

module.exports = {
    MODS,
    parseMod,
    modString,
    mapString
}