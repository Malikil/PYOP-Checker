/**
 * Mods bitwise
 */
const MODS = {
    EZ: 1 << 1,
    HD: 1 << 3,
    HR: 1 << 4,
    DT: 1 << 6,
    HT: 1 << 8,
    NC: 1 << 9,
    FL: 1 << 10,
    DIFFMODS: 0,
    ALLOWED:  0
};
MODS.DIFFMODS = MODS.HR | MODS.DT | MODS.HT;
MODS.ALLOWED = MODS.EZ | MODS.HD | MODS.HR | MODS.DT | MODS.HT | MODS.NC | MODS.FL;

module.exports = MODS;