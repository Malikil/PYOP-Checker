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
    if (modstr.includes('HD')) mod = mod | checker.MODS.HD;
    if (modstr.includes('HR')) mod = mod | checker.MODS.HR;
    else if (modstr.includes('EZ')) mod = mod | checker.MODS.EZ;
    if (modstr.includes('DT')) mod = mod | checker.MODS.DT;
    else if (modstr.includes('HT')) mod = mod | checker.MODS.HT;
    
    return mod;
}

module.exports = {
    MODS,
    parseMod
}