/*
This module should handle connecting to the database and all the CRUD operations
*/
const { MongoClient, Db } = require('mongodb');
const { MODS } = require('./checker');
const util = require('util');

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
    //discordClient.login(process.env.DISCORD_TOKEN);
});

/**
 * Gets everything from the database
 * @deprecated Avoid loading the entire database into memory.
 * Try using performAction(action) instead
 */
const getDb = () => db.collection('teams').find().toArray();

/**
 * Performs the given action for each item in the database
 * @param {function(*) => Promise<*>} action 
 * @returns {Promise<*[]>} An array containing return values from each function call
 */
async function performAction(action)
{
    let cursor = db.collection('teams').find();
    let results = [];
    await cursor.forEach(item => results.push(action(item)));
    results = await Promise.all(results);
    return results;
}

/**
 * Will get an osu id from a discord id if that user is currently registered
 * on a team in the database
 * @param {string} discordid The discord userid to search for
 * @returns {Promise<string>}
 */
async function getOsuId(discordid)
{
    console.log(`Looking for id: ${discordid}`);
    let cursor = db.collection('teams').aggregate([
        { $match: { 'players.discordid': discordid } },
        { $unwind: '$players' },
        { $match: { 'players.discordid': discordid } },
        { $project: {
            _id: 0,
            discordid: '$players.discordid',
            osuid: '$players.osuid'
        } }
    ]);

    let info = await cursor.next();
    if (info)
    {
        console.log(`Found ${discordid} => ${util.inspect(info)}`);
        return info.osuid;
    }
    else
        return null;
}

/**
 * Adds a team to the database
 * @param {string} teamName The team's name
 * @returns {Promise<boolean>} Whether the team was added
 */
async function addTeam(teamName)
{
    console.log(`Looking for team: ${teamName}`);
    let find = await db.collection('teams').findOne({ name: teamName });
    console.log(find);

    if (find)
        return undefined;

    let result = await db.collection('teams').insertOne({
        name: teamName,
        players: [],
        maps: []
    });

    return result.insertedCount > 0;
}

/**
 * Adds a player to a team
 * @param {string} teamName The team to add to
 * @param {string} osuid The player's osu id
 * @param {string} osuname The player's osu username
 * @param {string} discordid The player's discord id
 * @returns {Promise<boolean>} Whether any records were modified
 */
async function addPlayer(teamName, osuid, osuname, discordid)
{
    console.log(`Adding ${osuname} to ${teamName}`);
    let result = await db.collection('teams').updateOne(
        { name: teamName },
        { $push: { players: {
            osuid: osuid,
            osuname: osuname,
            discordid: discordid
        } } }
    );
    return result.modifiedCount == 1;
}

/**
 * Removes a player from all teams they might be on
 * @param {string} osuname The player to remove
 * @returns {Promise<boolean>} Whether any records were modified
 */
async function removePlayer(osuname)
{
    console.log(`Removing ${osuname} from all their teams`);
    let reg = new RegExp(`^${osuname}$`, 'i');
    let result = await db.collection('teams').updateMany(
        { 'players.osuname': reg },
        { $pull: { players: { osuname: reg } } }
    );
    console.log(`Removed from ${result.modifiedCount} teams`);
    return result.modifiedCount > 0;
}

/**
 * Move a player from one team to another
 * @param {string} teamName The team name to move to
 * @param {string} osuname The player's osu username
 * @returns {Promise<boolean>} Whether the player was moved
 */
async function movePlayer(teamName, osuname)
{
    console.log(`Moving ${osuname} to ${teamName}`);
    let reg = new RegExp(`^${osuname}$`, 'i');
    let team = await db.collection('teams').findOneAndUpdate(
        { 'players.osuname': reg },
        { $pull: { players: { osuname: reg } } }
    );
    let player = team.value.players.find(item => item.osuname.match(reg));
    if (!player)
        return false;
    let result = await db.collection('teams').updateOne(
        { name: teamName },
        { $push: { players: player } }
    );
    return result.modifiedCount > 0;
}

/**
 * Gets which team a player is on based on their discord id
 * @param {string} discordid The player's discord id
 */
async function getTeam(discordid)
{
    console.log(`Finding team for player ${discordid}`);
    let team = await db.collection('teams').findOne({ 'players.discordid': discordid });
    console.log(team);
    return team;
}

/**
 * Adds a map to the given mod bracket. Removes the first map on the list if
 * two maps are already present.
 * @param {string} team The team name
 * @param {{
 *  id: Number,
 *  status: String,
 *  drain: Number,
 *  stars: Number,
 *  bpm: Number,
 *  artist: String,
 *  title: String,
 *  version: String,
 *  creator: String,
 *  mod: Number,
 *  pool: String
 * }} map The map object to add
 */
async function addMap(team, map)
{
    console.log(`Adding map ${map.id} to ${team}'s ${map.pool} pool`);
    // let updateobj = { $push: {}};
    // updateobj.$push[`maps.${mod}`] = map;
    let teamobj = await db.collection('teams').findOneAndUpdate(
        { name: team },
        { $push: { maps: map } },
        { returnOriginal: false }
    );
    console.log(`Team ok: ${teamobj.ok}`);
    // Count how many maps are of the given mod
    let count = teamobj.value.maps.reduce((n, m) => n + (m.pool === map.pool), 0);
    if (count > 2)
    {
        // The first item should be removed.
        // First set a matching element to null, then remove nulls
        let result = await db.collection('teams').bulkWrite([
            {
                updateOne: {
                    filter: {
                        name: team,
                        'maps.pool': map.pool
                    },
                    update: { $unset: { 'maps.$': "" } }
                }
            },
            {
                updateOne: {
                    filter: { name: team },
                    update: { $pull: { maps: null } }
                }
            }
        ]);
        console.log(result);
    }
    return teamobj.ok;
}

/**
 * Removes a map from a team's pool. If two maps in the pool are the same, only one
 * will be removed.
 * @param {string} team The team name to remove the map from
 * @param {Number} mapid The beatmap id to remove
 * @param {"nm"|"hd"|"hr"|"dt"|"cm"} modpool The modpool for the map
 * @param {number} mods Which mods the map uses
 * @returns The number of modified documents
 */
async function removeMap(team, mapid, modpool, mods)
{
    // I can't guarantee there will only be one matching map
    // Set one matching map to null, then pull nulls
    let result = await db.collection('teams').bulkWrite([
        {
            updateOne: {
                filter: {
                    name: team,
                    maps: { $elemMatch: {
                        id: mapid,
                        pool: modpool,
                        mod: mods
                    } }
                },
                update: {
                    $unset: { 'maps.$': "" }
                }
            }
        },
        {
            updateOne: {
                filter: { name: team },
                update: { $pull: { maps: null } }
            }
        }
    ]);
    return result.modifiedCount;
}

/**
 * Finds all maps with a pending status
 */
async function findPendingMaps()
{
    let cursor = db.collection('teams').aggregate([
        { $match: { 'maps.status': "Pending" } },
        { $unwind: "$maps" },
        { $match: { 'maps.status': "Pending" } },
        { $group: {
            _id: "$maps.mod",
            maps: { $addToSet: {
                id: "$maps.id",
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
 * Changes a map between "Screenshot Required" to "Pending" statuses
 * @param {String} team The team to update
 * @param {Number} mapid The map id to update
 * @param {boolean} to_pending True if changing to "Pending" status,
 * false if changing back to "Screenshot Required" status
 */
async function pendingMap(team, mapid, to_pending = true)
{
    let status = to_pending ? "Pending" : "Screenshot Required";
    console.log(`Updating status on ${mapid} for ${team} to ${status}`);
    // Match teams with the player who submitted
    let findobj = {
        name: team,
        $or: []
    };
    let updateobj = { $set: {} }
    // We don't care what mod they're submitting for. That's a manual process
    let mods = ['nm', 'hd', 'hr', 'dt', 'cm'];
    mods.forEach(mod => {
        let temp = {}; temp[`maps.${mod}.id`] = mapid;
        findobj.$or.push(temp);

        updateobj.$set[`maps.${mod}.$[map].status`] = status;
    });
    
    let result = await db.collection('teams').updateOne(
        findobj,
        updateobj,
        { arrayFilters: [
            {
                'map.id': mapid,
                'map.status': (to_pending ? "Screenshot Required" : "Pending")
            }
        ] }
    );
    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    if (result.modifiedCount > 0)
        return 1;
    else
        return result.matchedCount - 1;
}

/**
 * Approves a map in a given modpool/with mods
 * @param {Number} mapid The map id to update
 * @param {"nm"|"hd"|"hr"|"dt"} modpool The modpool the map is in
 * @param {Number} mods The mods the map uses, if custom mod
 */
async function approveMap(mapid, modpool, mods)
{
    console.log(`Approving ${mapid} +${mods} in ${modpool}`);
    // Search for maps in the given modpool OR custom mod with the given mod
    let findobj = { $or: [{
        'maps.cm': {
            $elemMatch: {
                id: mapid,
                mod: mods
            }
        }
    }] };

    if (modpool)
    {
        let temp = {}; temp[`maps.${modpool}.id`] = mapid;
        findobj.$or.push(temp);
    }
    console.log(`Searching for: ${util.inspect(findobj, { depth: 4 })}`);

    let updateobj = { $set: {} };
    updateobj.$set[`maps.cm.$[cmap].status`] = 'Accepted';
    if (modpool)
        updateobj.$set[`maps.${modpool}.$[map].status`] = 'Accepted';
    console.log(`Updating with: ${util.inspect(updateobj)}`);

    let result = await db.collection('teams').updateMany(
        findobj,
        updateobj,
        { arrayFilters: [
            { 'map.id': mapid },
            {
                'cmap.id': mapid,
                'cmap.mod': mods
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
 * @returns The number of documents (teams) that were modified
 */
async function rejectMap(mapid, mods, message)
{
    console.log(`Rejecting mapid ${mapid} +${mods}`);
    let findobj = { $or: [{
        'maps.cm': {
            $elemMatch: {
                id: mapid,
                mod: mods
            }
        }
    }] };

    let specialPool;
    switch (mods)
    {
        case 0:       specialPool = 'nm'; break;
        case MODS.HD: specialPool = 'hd'; break;
        case MODS.HR: specialPool = 'hr'; break;
        case MODS.DT: specialPool = 'dt'; break;
    }

    if (specialPool)
    {
        let temp = {}; temp[`maps.${specialPool}.id`] = mapid;
        findobj.$or.push(temp);
    }
    console.log(`Searching for: ${util.inspect(findobj, { depth: 4 })}`);

    let updateobj = { $set: {} };
    updateobj.$set[`maps.cm.$[cmap].status`] = 'Rejected - ' + message;
    if (specialPool)
        updateobj.$set[`maps.${specialPool}.$[map].status`] = 'Rejected - ' + message;
    console.log(`Updating with: ${util.inspect(updateobj)}`);

    let result = await db.collection('teams').updateMany(
        findobj,
        updateobj,
        { arrayFilters: [
            { 'map.id': mapid },
            {
                'cmap.id': mapid,
                'cmap.mod': mods
            }
        ] }
    );
    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    return result.modifiedCount;
}

/**
 * Rejects a list of maps in bulk using the same message for each
 * @param {[
 *  {
 *      id: Number,
 *      mod: Number
 *  }
 * ]} maps An array of maps to reject
 * @param {String} message The reject message to use
 */
async function bulkReject(maps, message)
{
    message = 'Rejected - ' + message;
    // Filter maps into their proper mods
    let nm = [];
    let hd = [];
    let hr = [];
    let dt = [];
    let cm = [];
    maps.forEach(map => {
        switch (map.mod)
        {
            case 0: nm.push(map.id); break;
            case MODS.HD: hd.push(map.id); break;
            case MODS.HR: hr.push(map.id); break;
            case MODS.DT: dt.push(map.id); break;
            default: cm.push(map); break;
        }
    });

    let result = await db.collection('teams').updateMany(
        { },
        {
            $set: {
                'maps.nm.$[nmmap].status': message,
                'maps.hd.$[hdmap].status': message,
                'maps.hr.$[hrmap].status': message,
                'maps.dt.$[dtmap].status': message,
                'maps.cm.$[cmmap].status': message
            }
        },
        {
            arrayFilters: [
                { 'nmmap.id': { $in: nm } },
                { 'hdmap.id': { $in: hd } },
                { 'hrmap.id': { $in: hr } },
                { 'dtmap.id': { $in: dt } },
                { $or: [
                    { 'cmmap.id': { $in: nm }, 'cmmap.mod': 0 },
                    { 'cmmap.id': { $in: hd }, 'cmmap.mod': MODS.HD },
                    { 'cmmap.id': { $in: hr }, 'cmmap.mod': MODS.HR },
                    { 'cmmap.id': { $in: dt }, 'cmmap.mod': MODS.DT },
                    { 'cmmap': { $elemMatch: { $in: cm } } }
                ] }
            ]
        }
    );

    console.log(`Modified ${result.modifiedCount} documents in bulk update`);
    return result.modifiedCount;
}

module.exports = {
    getOsuId,
    addTeam,    // Teams/players
    addPlayer,
    removePlayer,
    movePlayer,
    getTeam,
    addMap,     // Maps
    removeMap,
    findPendingMaps,
    pendingMap,
    approveMap,
    rejectMap,
    bulkReject,  // General management
    getDb,
    performAction
};