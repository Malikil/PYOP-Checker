//import nfetch = require('node-fetch');
//import ojsama = require('ojsama');
//import readline = require('readline');
import Beatmap from '../types/bancho/beatmap';
import Mods from '../types/bancho/mods';
import { BanchoScore } from '../types/bancho/types';
import { DbBeatmap } from './../types/types';
import { days } from './mstime';
import nfetch from 'node-fetch';

const key = process.env.OSUKEY;
const ALLOWED_MODS = Mods.Hidden | Mods.HardRock | Mods.DoubleTime | Mods.Nightcore | Mods.Easy | Mods.HalfTime;

/**
 * Gets which week the tournament is currently in
 * @param arr An array of objects to return from
 * @returns If an array is given, the object at this week's index will
 * be returned. Otherwise the index for this week will be given
 */
function currentWeek(): number;
function currentWeek<T>(arr: T[]): T;
function currentWeek<T>(arr?: T[]): T | number {
    // The date will determine which week we're in
    const firstDue = new Date(process.env.FIRST_POOLS_DUE);
    let now = new Date();
    // Add one because firstDue marks the end of week 1 rather than the beginning
    let week = ((now.getTime() - firstDue.getTime()) / days(7) + 1) | 0;
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
    console.log(`First closing time ${lastClose}`);
    const now = new Date();
    // While it's more than an hour since pools should have closed
    while (now > lastClose)
        lastClose.setUTCDate(lastClose.getUTCDate() + 7);
    console.log(`Incrementing closing time to ${lastClose}`);

    const nextClose = new Date(lastClose);
    lastClose.setUTCDate(lastClose.getUTCDate() - 7);
    console.log(`Last closed at ${lastClose}`);
    return {
        lastClose,
        nextClose,
        now
    };
}

/**
 * Converts a mod string into its number equivalent
 * @param modstr Mods in string form. Case insensitive
 * @returns The bitwise number representation of the selected mods
 */
function parseMod(modstr: string): Mods
{
    // Undefined check
    if (!modstr) return 0;

    let mod = Mods.None;
    modstr = modstr.toUpperCase();
    // Parse mods
    if (modstr.includes('HD'))      mod |= Mods.Hidden;
    if (modstr.includes('HR'))      mod |= Mods.HardRock;
    else if (modstr.includes('EZ')) mod |= Mods.Easy;
    if (modstr.includes('DT'))      mod |= Mods.DoubleTime;
    else if (modstr.includes('NC')) mod |= Mods.DoubleTime | Mods.Nightcore;
    else if (modstr.includes('HT')) mod |= Mods.HalfTime;
    
    return mod & ALLOWED_MODS;
}

/**
 * Gets a mod pool string from a mod combination
 * @param bitwise The bitwise number representation of the mods
 * @deprecated The concept of dedicated pools is deprecated.
 * Actual mods value should be preferred
 */
function getModpool(bitwise: Mods)
{
    switch (bitwise)
    {
        case 0:       return "nm";
        case Mods.Hidden: return "hd";
        case Mods.HardRock: return "hr";
        case Mods.DoubleTime: return "dt";
        default:      return "cm";
    }
}

/**
 * Converts a mod number to its string form
 * @param mod Mods in bitwise form, as per osu api
 */
function modString(mod: Mods)
{
    let str = '';
    if (mod & Mods.Hidden)          str += 'HD';
    if (mod & Mods.Nightcore)       str += 'NC';
    else if (mod & Mods.DoubleTime) str += 'DT';
    else if (mod & Mods.HalfTime)   str += 'HT';
    if (mod & Mods.HardRock)        str += 'HR';
    else if (mod & Mods.Easy)       str = 'EZ' + str;
    if (str == '')                  str = 'NM';
    return str;
}

/**
 * Gets a map id from a link, or just returns the id received if given one
 * @param mapString A string containing a link to the new or old site, or just the id
 * @returns The map id for the given link, or undefined if no id was found
 */
function parseMapId(mapString: string)
{
    let num = parseInt(mapString);
    // If link is already a number then nothing needs to be done
    if (isNaN(num))
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
            num = parseInt(mapString);
        }
    }
  
    return num;
}

/**
 * Converts a map object to the artist - title [version] format
 */
const mapString = (map: { artist: string, title: string, version: string }) =>
    `${map.artist} - ${map.title} [${map.version}]`;
/** osu.ppy.sh/b/${beatmap id} */
const mapLink = (map: { bid?: number, beatmap_id?: number }) =>
    `https://osu.ppy.sh/b/${map.bid || map.beatmap_id}`;

/**
 * Converts from integer seconds to mm:ss time format
 * @param length The length, in seconds, to convert to string time
 * @returns The passed length, in mm:ss format
 */
function convertSeconds(length: number): string
{
    let seconds = '';
    if (length % 60 < 10)
        seconds += '0';
    seconds += length % 60;
    return (Math.floor(length / 60) + ':' + seconds);
}

async function getLeaderboard(mapid: number, mods: Mods = Mods.None): Promise<BanchoScore[]>
{
    let response = await nfetch(`https://osu.ppy.sh/api/get_scores?k=${key}&b=${mapid}&m=0&mods=${mods}`);
    return response.json();
}

/*
 * Gets a beatmap object which can be used to calculate sr or find hitobjects
 * {number} mapid The beatmap id to get info for
 * {number} mods The mods to use when parsing the map
 * {Promise<CheckableMap>}
 */
/*function beatmapObject(mapid, mods = 0)
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
}*/

export default {
    currentWeek,
    parseMod,
    parseMapId,
    getModpool,
    modString,
    mapString,
    mapLink,
    convertSeconds,
    closingTimes,
    getLeaderboard
};