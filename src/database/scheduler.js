const db = require('./mdb');

/**
 * Makes sure offset array is in the correct format
 * @param {string[]} offsets Array of offsets from UTC
 * @returns {number[]} Offsets array converted to integers
 */
function verifyOffsets(offsets) {
    return offsets.map(n => parseInt(n))
        .reduce((p, c) => {
            if (!isNaN(c) && !p.includes(c))
                p.push(c);
            return p;
        }, [])
        .sort((a, b) => a - b);
}

/**
 * @param {string[]} offsets Array of offsets from UTC
 * @param {number} time The time the match took place
 */
export async function setTime(offsets, time) {
    const offs = verifyOffsets(offsets);
    console.log(offs);

    // Get the existing time
    const timeObj = await getTime(offs);
    let updTime = {
        time,
        count: 1
    };
    if (timeObj) {
        // Decide which time mod to use
        // If negative time is closer than given time, use that
        // If a time is closer in the negative direction, it won't be closer upwards
        if (Math.abs(timeObj.time - (time - 24)) < Math.abs(timeObj.time - time))
            time -= 24;
        else if (Math.abs(timeObj.time - (time + 24)) < Math.abs(timeObj.time - time))
            time += 24;
        // Update the time value
        // Average of all times
        let newtime = ((timeObj.time * timeObj.count) + time) / (timeObj.count + 1);
        // Update the standard deviation
        // Reconstruct the old variance sum
        let varianceSum = (timeObj.stdev || 0) * (timeObj.stdev || 0) * (timeObj.count - 1);
        // Find the new squared difference
        // Use a modified average in an attempt to adjust for how old times in the variance
        // sum wouldn't have been able to account for this newly added time
        let avetime = (newtime + timeObj.time) / 2;
        let addVariance = (time - avetime) * (time - avetime);

        // Update the time object
        // Get standard deviation from the updated variance sum
        updTime = {
            time: (newtime % 24 + 24) % 24,
            count: timeObj.count + 1,
            stdev: Math.sqrt((varianceSum + addVariance) / timeObj.count)
        };
    }

    // Construct the set object
    const nesting = offs.reduce((p, c) => `${p}.${c}`);
    const setObj = {
        $set: {
            [nesting]: updTime
        }
    };
    // Update the database
    const result = await db.collection('times').updateOne(
        { depth: offs.length },
        setObj,
        { upsert: true }
    );
    return {
        result: result.result,
        oldTime: timeObj,
        newTime: updTime
    };
}

/**
 * @param {string[]} offsets Array of offsets from UTC
 * @returns {Promise<{
 *  time: number,
 *  count: number,
 *  stdev?: number
 * }>}
 */
export async function getTime(offsets) {
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

export function generateTimes(offsets) {
    const offs = verifyOffsets(offsets);
    console.log(offs);

    // Try finding a range of possible times
    // Start from 0, move up until an invalid time is found
    const goodTime = utc =>
        offs.every(off => {
            // The time is good if it's between 10am - 10pm
            const localTime = ((utc + off) % 24 + 24) % 24;
            return localTime >= 10 && localTime <= 22;
        });

    let base = -1;
    // Move to a bad time before starting to search
    while (goodTime(++base));

    // Find a starting offset
    let start = 0;
    while (start < 24 && !goodTime(base + start))
        start++;
    // If we have a starting point, we can try to find an end point
    if (start < 24) {
        let end = 0;
        while (end < 24 && goodTime(base + start + end))
            end++;

        // Display the found time range
        return {
            start: (base + start) % 24,
            end: (base + start + end - 1) % 24
        };
    }
}
