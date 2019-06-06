const express = require('express');
const bodyparser = require('body-parser');
const fetch = require('node-fetch');
const util = require('util');
const disbot = require('./disbot');
const { Beatmap, Score } = require('./osu-entities');
const app = express();
const port = process.env.PORT || 1337;
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

function convertSeconds(length)
{
    let seconds = '';
    if (length % 60 < 10)
        seconds += '0';
    seconds += length % 60;
    return (Math.floor(length / 60) + ':' + seconds);
}

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({
    extended: true
}));

app.post('/', (req, res) => {
    console.log(req.body);
    var min;
    var max;
    if (req.body.range === "15k")
    {
        min = fiftMin;
        max = fiftMax;
    }
    else
    {
        min = openMin;
        max = openMax;
    }
    var maps = [];
    var overUnder = 0;
    var totalDrain = 0;
    Promise.all(req.body.maps.map(info => {
        if (Number.isInteger(info.id) && info.id > 0)
            return fetch(`${osuapi}/get_beatmaps?k=${key}&b=${info.id}&mods=${info.mod & DIFFMODS}`)
            .then(response => response.json())
            .then(data => data[0])
            .then(/** @param {Beatmap} beatmap */ beatmap => {
                // Make sure the response is legible
                if (!!!beatmap)
                    return {
                        passed: undefined
                    };
                console.log(`Checking map ${beatmap.beatmap_id}`);
                // Make sure it's a standard map
                if (beatmap.mode != 0)
                    return {
                        passed: false,
                        reject: {
                            map: info,
                            reason: "This isn't a standard map. Did you post the wrong link/id?"
                        }
                    };
                // Drain ok
                let length = parseInt(beatmap.hit_length);
                let fullLength = parseInt(beatmap.total_length);
                // Take DT/HT into account
                if (info.mod & DT)
                {
                    length *= (2.0 / 3.0);
                    fullLength *= (2.0 / 3.0);
                    length = length | 0;
                    fullLength = fullLength | 0;
                }
                else if (info.mod & HT)
                {
                    length *= (4.0 / 3.0);
                    fullLength *= (4.0 / 3.0);
                    length = length | 0;
                    fullLength = fullLength | 0;
                }
                totalDrain += length;
                // Check the total length
                console.log(`Drain after mods ${info.mod}: ${length}`);
                if (fullLength > absoluteMax)
                    return {
                        passed: false,
                        reject: {
                            map: info,
                            reason: `The total length of this map is over the ${convertSeconds(absoluteMax)} maximum limit. (${convertSeconds(fullLength)})`
                        }
                    };
                // Check the drain time
                if (length < minLength)
                {
                    if (length < minLength - drainBuffer)
                        return {
                            passed: false,
                            reject: {
                                map: info,
                                reason: `The drain time of this map is more than ${drainBuffer} seconds under the ${convertSeconds(minLength)} minimum. (${convertSeconds(length)})`
                            }
                        };
                    else if (++overUnder > overUnderMax)
                        return {
                            passed: false,
                            reject: {
                                reason: `You have more than two maps outside the normal allowed drain range. Only two maps are allowed to use the ${drainBuffer} second buffer.`
                            }
                        };
                }
                else if (length > maxLength)
                {
                    console.log(`${length} > ${maxLength} returned true`);
                    console.log(`typeof(length) returns ${typeof length} | typeof(maxLength) returns ${typeof maxLength}`);
                    if (length > maxLength + drainBuffer)
                        return {
                            passed: false,
                            reject: {
                                map: info,
                                reason: `The drain time of this map is more than ${drainBuffer} seconds over the ${convertSeconds(maxLength)} maximum. (${convertSeconds(length)})`
                            }
                        };
                    else if (++overUnder > overUnderMax)
                        return {
                            passed: false,
                            reject: {
                                reason: `You have more than two maps outside the normal allowed drain range. Only two maps are allowed to use the ${drainBuffer} second buffer.`
                            }
                        };
                }
                // Check stars
                console.log(beatmap.difficultyrating);
                let stars = parseFloat(parseFloat(beatmap.difficultyrating).toFixed(2));
                console.log(`After rounding: ${stars}`);
                if (stars < min)
                    return {
                        passed: false,
                        reject: {
                            map: info,
                            reason: `The star rating of this map is below the ${min} minimum allowed for this week. (${stars})`
                        }
                    };
                else if (stars > max)
                    return {
                        passed: false,
                        reject: {
                            map: info,
                            reason: `The star rating of this map is above the ${max} maximum allowed for this week. (${stars})`
                        }
                    };
                // Check date
                let updated = new Date(parseInt(beatmap.last_update.substring(0, 4)), parseInt(beatmap.last_update.substring(5, 7)));
                console.log(`Date string: ${beatmap.last_update} => ${updated}`);
                if (updated < earliest)
                    return {
                        passed: false,
                        reject: {
                            map: info,
                            reason: `This map is from ${updated.getFullYear()}, maps before ${earliest.getFullYear()} aren't allowed for this time.`
                        }
                    };
                // Check for duplicates last. The maps that might be duplicates otherwise might get caught by the otherchecks
                if (maps.find(item => item == beatmap.beatmap_id) === undefined)
                    maps.push(beatmap.beatmap_id);
                else
                    return {
                        passed: false,
                        reject: {
                            reason: "You've picked the same map more than once. Please make sure the same difficulty of a mapset is only in your pool once."
                        }
                    };
                // If the map is ranked proper, it can probably get partially approved. Otherwise it should be left to manual
                // Make sure there's a reasonable amount of scores on the leaderboard first though
                console.log(`Check for leaderboard? (${beatmap.approved} == 1)`);
                if (beatmap.approved == 1)
                    return fetch(`${osuapi}/get_scores?k=${key}&b=${info.id}&mods=${info.mod}`)
                    .then(response => response.json())
                    .then(/** @param {Score[]} scores */scores => {
                        console.log(`Found ${scores.length} scores`);
                        if (scores.length > leaderboard)
                            return {
                                passed: true,
                                map: info
                            };
                        else
                            return {
                                passed: undefined
                            };
                    });
                else
                    return {
                        passed: undefined
                    };
            });
        else
            return Promise.resolve({
                passed: undefined
            });
    })).then(results => {
        let missing = poolSize - results.length;
        if (totalDrain < (minTotal - (missing * (maxLength - drainBuffer))))
            results.push({
                passed: false,
                reject: {
                    reason: `Total pool drain time is under the ${convertSeconds(minTotal)} minimum. (${convertSeconds(totalDrain)})`
                }
            });
        else if (totalDrain > (maxTotal + (missing * (minLength + drainBuffer))))
            results.push({
                passed: false,
                reject: {
                    reason: `Total pool drain time is above the ${convertSeconds(maxTotal)} maximum. (${convertSeconds(totalDrain)})`
                }
            });
        disbot.rejectMaps(req.body.name, results);
        console.log(util.inspect(results, { depth: 3 }));
        res.status(200).json(results);
    }).catch(failed => {
        console.log(failed);
        res.status(500).json(failed);
    });
});

app.listen(port, () => console.log(`Listening on port ${port}`));