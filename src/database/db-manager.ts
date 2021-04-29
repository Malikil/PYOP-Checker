/*
This module should handle connecting to the database and all the CRUD operations
*/
//const { MongoClient, Db } = require('mongodb');
import util = require('util');
import { DbBeatmap, DbPlayer, DbTeam, MapStatus } from '../types/database';
import { Mods } from '../types/bancho';
import db from './mdb';

const POOLED_MODS = Mods.Hidden | Mods.HardRock | Mods.DoubleTime;
//#region ============================== Helpers/General ==============================
/**
 * Performs the given action for each item in the database, and return an array of the results
 * @returns An array containing return values from each function call
 */
async function map<T>(action: (team: DbTeam) => Promise<T>): Promise<T[]>
{
    let cursor = db.collection('teams').find();
    let results = [];
    await cursor.forEach(async (p: DbTeam) => results.push(await action(p)));
    return results;
}

async function reduce<T>(action: (previous: T, current: DbTeam) => Promise<T>, initial: T) {
    const cursor = db.collection('teams').find();
    let result = initial;
    while (await cursor.hasNext()) {
        let team: DbTeam = await cursor.next();
        result = await action(result, team);
    }
    return result;
}

/**
 * Prepares a string to be used as the match in a regex match
 */
function regexify(str: string, options: string)
{
    str = str.replace(/_/g, "(?: |_)")
        .replace('[', '\\[')
        .replace(']', "\\]")
        .replace('+', "\\+");
    return new RegExp(`^${str}$`, options);
}

/**
 * Creates an object to match to a player on a team
 * @param id The player's id, either discord or osu id, or osu username
 */
function identify(id: string | number) {
    let queryArray: { 'players.discordid'?: string, 'players.osuid'?: number, 'players.osuname'?: RegExp }[] = [];
    if (typeof id === "string") {
        queryArray.push({ 'players.discordid': id });
        queryArray.push({ 'players.osuname': regexify(id, 'i') });
    }
    else
        queryArray.push({ 'players.osuid': id });

    return { $or: queryArray };
}

//#endregion
//#region ============================== Manage Teams/Players ==============================
/**
 * Adds a new team with the given players
 */
async function addTeam(teamname: string, division: string, players: DbPlayer[])
{
    console.log(`Adding new team: ${teamname}`);
    const adding: DbTeam = {
        teamname,
        division,
        players,
        maps: [],
        oldmaps: []
    };
    let result = await db.collection('teams').insertOne(adding);
    return !!result.result.ok;
}

async function eliminateTeam(teamname: string): Promise<DbTeam> {
    console.log(`\x1b[32mdb-manager.js#eliminateTeam \x1b[0m Eliminating team ${teamname}`);
    const result = await db.collection('teams')
        .findOneAndUpdate(
            { teamname },
            { $set: { eliminated: true } },
            { returnOriginal: true }
        );

    console.log(result.value);
    if (result.value)
        return result.value;
}

/**
 * Toggles whether the player wants to receive notifications of map updates
 * @param discordid The Discord id of the player to update
 * @returns True/False indicating the current/new status, or undefined if the player
 * wasn't found
 */
async function setNotify(discordid: string, setting: boolean): Promise<boolean | undefined>
{
    let team: DbTeam = await db.collection('teams').findOne({ 'players.discordid': discordid });
    if (!team)
        return;
    let player = team.players.find(p => p.discordid === discordid);
    if (setting !== undefined && !!player.notify !== setting)
        if (player.notify)
        {
            let result = await db.collection('teams').updateOne(
                { 'players.discordid': discordid },
                { $unset: { 'players.$.notify': "" } }
            );
            if (result.modifiedCount)
                return false;
        }
        else
        {
            let result = await db.collection('teams').updateOne(
                { 'players.discordid': discordid },
                { $set: { 'players.$.notify': true } }
            );
            if (result.modifiedCount)
                return true;
        }
    
    return !!player.notify;
}

/**
 * Gets a team with a given player on it
 * @param id The player's id, either discord or osu id, or osu username
 */
async function getTeamByPlayerid(id: string | number)
{
    console.log(`Finding team for player ${id}`);
    
    let team: DbTeam = await db.collection('teams').findOne(identify(id));
    if (team)
        return team;
}

async function getTeamByPlayerlist(players: { osuid?: number, osuname?: string, discordid?: string }[])
{
    let filter = [];
    players.forEach(p => {
        if (p.osuid)
            filter.push({ 'players.osuid': p.osuid });
        if (p.osuname)
            filter.push({ 'players.osuname': regexify(p.osuname, 'i') });
        if (p.discordid)
            filter.push({ 'players.discordid': p.discordid });
    });
    let team: DbTeam = await db.collection('teams').findOne({
        $or: filter
    });
    if (team)
        return team;
}

async function getTeamByName(teamname: string) {
    const team: DbTeam = await db.collection('teams').findOne({ teamname });
    if (team)
        return team;
}

/**
 * Gets a player based on their osu id or discord id
 * @param id The player's id, either discord or osu id, or osu username
 */
async function getPlayer(id: string | number)
{
    console.log(`Finding player with id ${id}`);
    let team = await getTeamByPlayerid(id);
    if (team) {
        // Get the specific player from the team
        let player: DbPlayer = team.players.find(p =>
            p.discordid === id ||
            p.osuid === id ||
            (typeof id === "string" && p.osuname.match(regexify(id, 'i')))
        );

        if (player)
            return player;
    }
}

/**
 * Updates a player with the given info
 * @param osuid The player's osu id
 * @param osuname The player's new osu username
 * @returns Whether a player was updated
 */
async function updatePlayerName(osuid: number, osuname: string) {
    let result = await db.collection('teams').updateOne(
        { 'players.osuid': osuid },
        { $set: { 'players.$.osuname': osuname } }
    );

    return result.modifiedCount;
}
//#endregion
//#region ============================== Manage Maps ==============================
/**
 * Adds a map to the given mod bracket. Removes the first map on the list if
 * two maps are already present.
 * @param team The player identifier, either osuid or discordid
 * @param map The map object to add
 * @returns True if the map was added without issue, false if the map wasn't added,
 * and a map object if a map got replaced.
 */
async function addMap(team: string, map: DbBeatmap): Promise<boolean | DbBeatmap>
{
    console.log(`Adding map ${map.bid} to ${team}'s pool`);
    // let updateobj = { $push: {}};
    // updateobj.$push[`maps.${mod}`] = map;
    const idobj: { teamname: string, maps?: any } = { teamname: team };
    const findUpdateResult = await db.collection('teams').findOneAndUpdate(
        idobj,
        { $push: { maps: { ...map } } },
        { returnOriginal: false }
    );
    const teamobj: DbTeam = findUpdateResult.value;
    console.log(`Team ok: ${findUpdateResult.ok}`);
    // Find a count of CM maps, and the map that should be removed
    // if the pool is full
    const poolAccumulator = teamobj.maps.reduceRight((pa, m) => {
        // By starting from the right, we're going from newest to oldest.
        // That way whenever the next map is found that meets criteria, it
        // will be an 'older' map in pool terms. So it can overwrite what was
        // in the variable before
        
        // Increment count
        // If only a single mod is selected, and that mod is a default mod
        if (m.mods === 0 || (((m.mods - 1) & m.mods) === 0 && (m.mods & POOLED_MODS))) {
            // If there are more than the minimum for this modcount,
            // then the map is a candidate for removal
            if (++pa[m.mods] > 2) {
                // When there's more than two of a certain mod the extras
                // are actually a part of custom mod
                pa.cm++;
                pa.remover = m;
            }
        }
        else {
            pa.cm++;
            // CM is always a candidate for removal
            pa.remover = m;
        }
        return pa;
    }, { 0: 0, [Mods.Hidden]: 0, [Mods.HardRock]: 0, [Mods.DoubleTime]: 0, cm: 0, remover: <DbBeatmap>{} })
    // If a modpool is overfilled, then a map should be removed
    if (teamobj.maps.length > 10 ||
            poolAccumulator[0] > 4 ||
            poolAccumulator[Mods.Hidden] > 4 ||
            poolAccumulator[Mods.HardRock] > 4 ||
            poolAccumulator[Mods.DoubleTime] > 4 ||
            poolAccumulator.cm > 2) {
        // Remove the map
        idobj.maps = {
            $elemMatch: {
                bid: poolAccumulator.remover.bid,
                mods: poolAccumulator.remover.mods
            }
        };
        db.collection('teams').bulkWrite([
            {
                updateOne: {
                    filter: idobj,
                    update: { $unset: { 'maps.$': "" } }
                }
            },
            {
                updateOne: {
                    filter: { teamname: team },
                    update: { $pull: <any>{ maps: null } }
                    // I don't think anything's changed from when this was js,
                    // but ts was really not happy with it
                }
            }
        ]);
        return poolAccumulator.remover;
    }
    return !!findUpdateResult.ok;
}

/**
 * Removes a map from a team's pool. If two maps in the pool are the same, only one
 * will be removed.
 * @param team Which team to remove the map from
 * @param mapid The beatmap id to remove
 * @param mods Which mods the map uses
 * @returns The number of modified documents
 */
async function removeMap(team: string, mapid: number, mods: Mods)
{
    // I can't guarantee there will only be one matching map
    // Set one matching map to null, then pull nulls
    let filter = {
        teamname: team,
        maps: {
            $elemMatch: <{bid: number, mods?: number}>{ bid: mapid }
        }
    };
    if (mods !== undefined)
        filter.maps.$elemMatch.mods = mods;

    console.log("db-manager#removeMap - Remove map update filter:");
    console.log(util.inspect(filter, false, 4, true));
    let result = await db.collection('teams').bulkWrite([
        { updateOne: {
            filter,
            update: {
                $unset: { 'maps.$': "" }
            }
        } },
        { updateOne: {
            filter: { teamname: team },
            update: { $pull: <any>{ maps: null } } // See note above
        } }
    ]);
    return result.modifiedCount;
}

/**
 * Removes all maps from the given team's pool
 * @param teamname Team name
 * @returns The number of teams modified
 */
async function removeAllMaps(teamname: string)
{
    let result = await db.collection('teams').updateOne(
        { teamname },
        { $set: { maps: [] } }
    );
    return result.modifiedCount;
}

/**
 * Finds all maps with a given status, grouped by their mods
 * @param status What status the map should have
 */
async function findMapsWithStatus(status: MapStatus): Promise<{
    _id: number;
    maps: {
        bid: number;
        artist: string;
        title: string;
        version: string;
        passes: string[];
    }[];
}[]>
{
    let cursor = db.collection('teams').aggregate([
        { $match: {
            'maps.status': status,
            eliminated: { $ne: true }
        } },
        { $unwind: "$maps" },
        { $match: { 'maps.status': status } },
        { $group: {
            _id: "$maps.mods",
            maps: { $addToSet: {
                bid: "$maps.bid",
                artist: "$maps.artist",
                title: "$maps.title",
                version: "$maps.version",
                passes: "$maps.passes"
            } }
        } },
        { $sort: { "_id": 1 } }
    ]);
    return cursor.toArray();
}

/**
 * @returns A list of teams that have missing maps or rejected maps
 */
async function findMissingMaps(): Promise<DbTeam[]>
{
    let result = db.collection('teams').find({
        eliminated: { $ne: true },
        $or: [
            {
                maps: {
                    $not: {
                        $size: 10
                    }
                }
            },
            { 'maps.status': MapStatus.Rejected }
        ]
    });
    return result.toArray();
}

/**
 * Adds a pass to a map and updates the status
 * @param discordid The player to update
 * @param mapid The map id to update
 * @param pass A reference link to the pass
 * @param pending Whether the status should be left as-is or changed to pending
 * @returns The number of modified teams
 */
async function addScreenshot(discordid: string, mapid: number, pass: string, pending: boolean)
{
    // We don't care about mod at this point, they're not supposed to have
    // the same map more than once anyways.
    // Only update the status if pending is true
    let updateObj: { $push: any, $set?: any } = { $push: { 'maps.$[pendmap].passes': pass } };
    if (pending)
        updateObj.$set = { 'maps.$[pendmap].status': MapStatus.Pending };

    let result = await db.collection('teams').updateOne(
        {
            'players.discordid': discordid,
            'maps.bid': mapid
        },
        updateObj,
        { arrayFilters: [{
            'pendmap.bid': mapid
        }] }
    );
    //console.log(result);
    return result.modifiedCount;
}

/**
 * Approves a map in a given modpool/with mods
 * @param mapid The map id to update
 * @param mods The mods the map uses
 */
async function approveMap(mapid: number, mods: Mods)
{
    console.log(`Approving ${mapid} +${mods}`);
    // Search for maps with the given mod
    let result = await db.collection('teams').updateMany(
        { maps: { $elemMatch: {
            bid: mapid,
            mods
        } } },
        { $set: { 'maps.$[pendmap].status': MapStatus.Approved } },
        { arrayFilters: [
            {
                'pendmap.bid': mapid,
                'pendmap.mods': mods,
                //'pendmap.status': "Pending" don't worry about if a map is ssrequired
            }
        ] }
    );
    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    return result.modifiedCount;
}

/**
 * Rejects a given map/mod combo.
 * @param mapid The map id to update
 * @param mods The mods the map uses
 * @param message The reject message to add to the end
 * @returns A list of players to notify of the change, along with the number of
 * updated teams
 */
async function rejectMap(mapid: number, mods: Mods, message: string)
{
    console.log(`Rejecting mapid ${mapid} +${mods}`);
    // Get a list of notification players on teams with maps to be rejected
    const playerlist: {
        _id?: boolean,
        players: DbPlayer[]
    }[] = await db.collection('teams').aggregate([
        { $match: {
            maps: { $elemMatch: {
                bid: mapid,
                mods,
                status: { $ne: MapStatus.Rejected }
            } }
        } },
        { $project: {
            _id: 0,
            players: 1
        } },
        { $unwind: "$players" },
        { $group: {
            _id: "$players.notify",
            players: { $addToSet: "$players" }
        } }
    ]).toArray();

    let list: DbPlayer[] = [];
    let playerNotif = playerlist.find(i => i._id);
    if (playerNotif)
        list = playerNotif.players;
    console.log(list);
    // Update the status
    // Not limiting to pending maps here because it's conceivable that a
    // screenshot required map can be rejected, and maps that are rejected
    // for one team should be rejected for all teams
    let result = await db.collection('teams').updateMany(
        { maps: { $elemMatch: {
            bid: mapid,
            mods,
            'map.status': { $ne: MapStatus.Rejected }
        } } },
        { $set: {
            'maps.$[map].status': MapStatus.Rejected,
            'maps.$[map].message': message
        } },
        { arrayFilters: [
            {
                'map.bid': mapid,
                'map.mods': mods,
                'map.status': { $ne: MapStatus.Rejected }
            }
        ] }
    );
    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    return {
        playerNotif: list,
        modified: result.modifiedCount
    };
}

/**
 * Move all current maps to the oldmaps list, and clear out the current maps list
 */
async function archiveMaps() {
    db.collection('teams').updateMany(
        { },
        [
            { $set: {
                oldmaps: {
                    $concatArrays: [
                        "$oldmaps",
                        "$maps"
                    ]
                }
            } },
            { $set: {
                maps: []
            } }
        ]
    );
}
//#endregion
export default {
    addTeam, // Teams/players
    eliminateTeam,
    setNotify,
    getTeamByPlayerid,
    getTeamByPlayerlist,
    getTeamByName,
    getPlayer,
    updatePlayerName,
    addMap,     // Maps
    removeMap,
    removeAllMaps,
    findMapsWithStatus,
    addScreenshot,
    approveMap,
    rejectMap,
    findMissingMaps,
    archiveMaps,
    // General management
    map,
    reduce
};
