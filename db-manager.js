/*
This module should handle connecting to the database and all the CRUD operations
*/
const { MongoClient, Db, ObjectID } = require('mongodb');
const util = require('util');
const { DbBeatmap, DbPlayer } = require('./types');

const mongoUser = process.env.MONGO_USER;
const mongoPass = process.env.MONGO_PASS;
const mongoUri = process.env.MONGO_URI;
const uri = `mongodb+srv://${mongoUser}:${mongoPass}@${mongoUri}`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

/** @type {Db} */
var db;
client.connect(err => {
    if (err)
        return console.log(err);
    else
        console.log("Connected to mongodb");

    db = client.db('pyopdb');
});
//#region ============================== Helpers/General ==============================
/**
 * Performs the given action for each item in the database
 * @param {function(DbPlayer) => Promise<*>} action 
 * @returns {Promise<*[]>} An array containing return values from each function call
 */
async function performAction(action)
{
    let cursor = db.collection('teams').find();
    let results = [];
    await cursor.forEach(p => results.push(action(new DbPlayer(p))));
    return Promise.all(results);
}

/**
 * Prepares a string to be used as the match in a regex match
 * @param {String} str 
 * @param {String} options
 */
function regexify(str, options)
{
    str = str.replace('_', "(?: |_)")
        .replace('[', '\\[')
        .replace(']', "\\]")
        .replace('+', "\\+");
    return new RegExp(`^${str}$`, options);
}

/**
 * Convenience function for wrapping an id in an or check on osuid or discordid
 * @param {string|number} id Player's osu or discord id
 */
function identify(id)
{
    return { $or: [
        { osuid: id },
        { discordid: id }
    ]};
}
//#endregion
//#region ============================== Manage Players ==============================
/**
 * Adds a player to the database
 * @param {object} p
 * 
 * @param {string} p.osuid The player's osu id
 * @param {string} p.osuname The player's osu username
 * @param {string} p.discordid The player's discord id
 * @param {"open"|"15k"} p.division Which division to add the player to
 * @param {string} p.utc The player's utc time modifier
 * @returns How many records were modified
 */
async function updatePlayer({osuid, osuname, discordid, division, utc})
{
    console.log(`Adding ${osuname}`);
    let result = await db.collection('teams').updateOne(
        { $or: [
            { osuid },
            { discordid }
        ] },
        {
            $set: {
                osuid,
                osuname,
                discordid,
                division,
                utc
            },
            $setOnInsert: {
                maps: [],
                unconfirmed: true
            }
        },
        { upsert: true }
    );
    return result.modifiedCount + result.upsertedCount;
}

/**
 * Finishes registering a player with matching osuid and discord id
 * @param {number} osuid The player's osu id
 * @param {string} discordid The discord id for the player
 */
async function confirmPlayer(osuid, discordid)
{
    let result = await db.collection('teams').updateOne(
        { osuid, discordid },
        { $unset: { unconfirmed: "" } }
    );

    return result.modifiedCount;
}

/**
 * Removes a player from the database
 * @param {string} playerid The player to remove. Should be either a discord id or osu id
 * @returns How many records were modified
 */
async function removePlayer(playerid)
{
    console.log(`Removing ${playerid}`);
    let result = await db.collection('teams').deleteOne(
        identify(playerid)
    );
    console.log(`Removed ${result.deletedCount} players`);
    return result.deletedCount;
}
//#endregion

/**
 * Toggles whether the player wants to receive notifications of map updates
 * @param {string} discordid The Discord id of the player to update
 * @returns True/False indicating the new status, or undefined if the player
 * wasn't found
 */
async function toggleNotification(discordid)
{
    let player = await db.collection('teams').findOne({ discordid });
    if (!player)
        return;
    
    if (player.notif)
    {
        let result = await db.collection('teams').updateOne(
            { discordid },
            { $unset: { notif: "" } }
        );
        if (result.modifiedCount)
            return false;
    }
    else
    {
        let result = await db.collection('teams').updateOne(
            { discordid },
            { $set: { notif: true } }
        );
        if (result.modifiedCount)
            return true;
    }
}

/**
 * Gets a player based on their osu id or discord id
 * @param {string|number} id The player's id, either discord or osu id, or osu username
 */
async function getPlayer(id)
{
    console.log(`Finding player with id ${id}`);
    let player = await db.collection('teams').findOne({
        $or: [
            { discordid: id },
            { osuid: id },
            { osuname: regexify(id, 'i') }
        ]
    });
    console.log(util.inspect(player, { depth: 1 }));
    if (player)
        return new DbPlayer(player);
}
//#endregion
//#region ============================== Manage Maps ==============================
/**
 * Adds a map to the given mod bracket. Removes the first map on the list if
 * two maps are already present.
 * @param {string|number} playerid The player identifier, either osuid or discordid
 * @param {DbBeatmap} map The map object to add
 * @returns True if the map was added without issue, false if the map wasn't added,
 * and a map object if a map got replaced.
 */
async function addMap(playerid, map)
{
    console.log(`Adding map ${map.bid} to ${playerid}'s ${map.pool} pool`);
    // let updateobj = { $push: {}};
    // updateobj.$push[`maps.${mod}`] = map;
    let idobj = identify(playerid);
    let teamobj = await db.collection('teams').findOneAndUpdate(
        idobj,
        { $push: { maps: map.toObject() } },
        { returnOriginal: false }
    );
    console.log(`Team ok: ${teamobj.ok}`);
    // Count how many maps are of the given mod
    let count = teamobj.value.maps.reduce((n, m) => n + (m.pool === map.pool), 0);
    if (count > 2)
    {
        // The first item should be removed.
        // First set a matching element to null, then remove nulls
        idobj['maps.pool'] = map.pool;
        let result = await db.collection('teams').bulkWrite([
            {
                updateOne: {
                    filter: idobj,
                    update: { $unset: { 'maps.$': "" } }
                }
            },
            {
                updateOne: {
                    filter: identify(playerid),
                    update: { $pull: { maps: null } }
                }
            }
        ]);
        console.log(result);
        // Return the removed item
        return new DbBeatmap(teamobj.value.maps.find(m => m.pool === map.pool));
    }
    return teamobj.ok;
}

/**
 * Removes a map from a team's pool. If two maps in the pool are the same, only one
 * will be removed.
 * @param {string|number} playerid The player who's pool to remove the map from
 * @param {Number} mapid The beatmap id to remove
 * @param {"nm"|"hd"|"hr"|"dt"|"cm"} modpool The modpool for the map
 * @param {number} mods Which mods the map uses
 * @returns The number of modified documents
 */
async function removeMap(playerid, mapid, modpool, mods)
{
    // I can't guarantee there will only be one matching map
    // Set one matching map to null, then pull nulls
    let filter = identify(playerid);
    filter.maps = { $elemMatch: { bid: mapid } };
    if (modpool !== undefined)
        filter.maps.$elemMatch.pool = modpool;
    if (mods !== undefined)
        filter.maps.$elemMatch.mods = mods;

    console.log("Remove map update filter:");
    console.log(util.inspect(filter, false, 4, true));
    let result = await db.collection('teams').bulkWrite([
        { updateOne: {
            filter,
            update: {
                $unset: { 'maps.$': "" }
            }
        } },
        { updateOne: {
            filter: identify(playerid),
            update: { $pull: { maps: null } }
        } }
    ]);
    return result.modifiedCount;
}

/**
 * Removes all maps from the given team's pool
 * @param {string|number} playerid Team name
 * @returns The number of teams modified
 */
async function removeAllMaps(playerid)
{
    let result = await db.collection('teams').updateOne(
        identify(playerid),
        { $set: { maps: [] } }
    );
    return result.modifiedCount;
}

/**
 * Finds all maps with a given status, grouped by their mods
 * @param {string} status What status the map should have
 * @returns {Promise<{
 *  _id: number,
 *  maps: {
 *      bid: number,
 *      artist: string,
 *      title: string,
 *      version: string
 *  }[]
 * }[]>}
 */
async function findMapsWithStatus(status)
{
    let cursor = db.collection('teams').aggregate([
        { $match: { 'maps.status': status } },
        { $unwind: "$maps" },
        { $match: { 'maps.status': status } },
        { $group: {
            _id: "$maps.mods",
            maps: { $addToSet: {
                bid: "$maps.bid",
                artist: "$maps.artist",
                title: "$maps.title",
                version: "$maps.version"
            } }
        } },
        { $sort: { "_id": 1 } }
    ]);
    return cursor.toArray();
}

/**
 * @returns A list of teams that have missing maps or rejected maps
 */
async function findMissingMaps()
{
    let result = db.collection('teams').find({
        $or: [
            {
                maps: {
                    $not: {
                        $size: 10
                    }
                }
            },
            { 'maps.status': /^Rejected/ }
        ]
    });
    return result.toArray();
}

/**
 * Changes a map between "Screenshot Required" and "Pending" statuses
 * @param {String} discordid The player to update
 * @param {Number} mapid The map id to update
 * @returns The number of modified players
 */
async function pendingMap(discordid, mapid)
{
    // We don't care about mod at this point, they're not supposed to have
    // the same map more than once anyways.
    // There is a check for current status though, no point in resetting an
    // approved status back to pending just by submitting a screenshot
    let result = await db.collection('teams').updateOne(
        {
            discordid,
            maps: { $elemMatch: {
                bid: mapid,
                status: "Screenshot Required"
            } }
        },
        { $set: { 'maps.$[pendmap].status': "Pending" } },
        { arrayFilters: [
            {
                'pendmap.status': "Screenshot Required",
                'pendmap.bid': mapid
            }
        ] }
    );
    //console.log(result);
    return {
        added: result.modifiedCount,
        matched: result.matchedCount
    };
}

/**
 * Approves a map in a given modpool/with mods
 * @param {Number} mapid The map id to update
 * @param {Number} mods The mods the map uses
 */
async function approveMap(mapid, mods)
{
    console.log(`Approving ${mapid} +${mods}`);
    // Search for maps with the given mod
    let result = await db.collection('teams').updateMany(
        { maps: { $elemMatch: {
            bid: mapid,
            mods
        } } },
        { $set: { 'maps.$[pendmap].status': "Accepted" } },
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
 * @param {Number} mapid The map id to update
 * @param {Number} mods The mods the map uses
 * @param {string} message The reject message to add to the end
 * @returns {Promise<{
 *  playerNotif: *[],
 *  modified: number
 * }>} A list of players to notify of the change, plus the number of
 * updated teams
 */
async function rejectMap(mapid, mods, message)
{
    console.log(`Rejecting mapid ${mapid} +${mods}`);
    // Get a list of players on teams with maps to be rejected
    // ========== Keeping for if I decide to do another teams tourney ==========
    /*let playerlist = db.collection('teams').aggregate([
        { $match: {
            maps: { $elemMatch: {
                id: mapid,
                mod: mods,
                status: { $not: /^Rejected/ }
            } }
        } },
        { $project: {
            _id: 0,
            players: 1
        } },
        { $unwind: "$players" },
        { $group: {
            _id: "$players.notif",
            players: { $addToSet: "$players" }
        } }
    ]);
    let parr = (await playerlist.toArray()).find(i => i._id === null);
    let players = [];
    if (parr)
        players = parr.players;
    console.log(players);*/
    let playerNotif = await db.collection('teams').find({
        maps: { $elemMatch: {
            bid: mapid,
            mods,
            status: { $not: /^Rejected/ }
        } },
        notif: true
    }).toArray();
    // Update the status
    // Not limiting to pending maps here because it's conceivable that a
    // screenshot required map can be rejected, and maps that are rejected
    // for one team should be rejected for all teams
    let result = await db.collection('teams').updateMany(
        { maps: { $elemMatch: {
            bid: mapid,
            mods
        } } },
        { $set: { 'maps.$[map].status': "Rejected - " + message } },
        { arrayFilters: [
            {
                'map.bid': mapid,
                'map.mods': mods,
                'map.status': { $not: /^Rejected/ }
            }
        ] }
    );
    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    return {
        playerNotif,
        modified: result.modifiedCount
    };
}

/**
 * Rejects a list of maps in bulk using the same message for each
 * @param {[
 *  {
 *      id: Number,
 *      mods: Number
 *  }
 * ]} maps An array of maps to reject
 * @param {String} message The reject message to use
 * @param {"open"|"15k"} division Which division to update
 */
async function bulkReject(maps, message, division)
{
    message = 'Rejected - ' + message;
    // If possible, I'd like to do away with this manually constructing
    // arrayFilters
    let filters = maps.map(item => {
        return {
            'badmap.bid': item.id,
            'badmap.mods': item.mods
        };
    });

    // Reject all maps matching the criteria
    let result = await db.collection('teams').updateMany(
        { division },
        { $set: { 'maps.$[badmap].status': message } },
        { arrayFilters: [
            { $or: filters }
        ] }
    );

    console.log(`Modified ${result.modifiedCount} documents in bulk update`);
    return result.modifiedCount;
}

module.exports = {
    updatePlayer,  // Teams/players
    confirmPlayer,
    removePlayer,
    toggleNotification,
    getPlayer,
    addMap,     // Maps
    removeMap,
    removeAllMaps,
    findMapsWithStatus,
    pendingMap,
    approveMap,
    rejectMap,
    findMissingMaps,
    bulkReject,  // General management
    performAction
};