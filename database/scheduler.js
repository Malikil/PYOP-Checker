const db = require('./mdb');

/**
 * Makes sure offset array is in the correct format
 * @param {number[]} offsets Array of offsets from UTC
 */
function verifyOffsets(offsets) {
    return offsets.map(n => parseInt(n))
        .reduce((p, c) => {
            if (!!c && !p.includes(c))
                p.push(c);
            return p;
        }, [])
        .sort((a, b) => a - b);
}

/**
 * @param {number[]} offsets Array of offsets from UTC
 * @param {number} time The time the match took place
 */
async function setTime(offsets, time) {
    const offs = verifyOffsets(offsets);
}

/**
 * @param {number[]} offsets Array of offsets from UTC
 * @returns {Promise<{
 *  time: number,
 *  count: number,
 *  stdev?: number
 * }>}
 */
async function getTime(offsets) {
    const offs = verifyOffsets(offsets);
    console.log(offs);
    const times = await db.collection('times').findOne({ depth: offs.length });
    if (!times)
        return;
    
    return offs.reduce((t, o) => {
        if (t)
            return t[o];
        return t;
    }, times);
}

module.exports = {
    getTime
};
