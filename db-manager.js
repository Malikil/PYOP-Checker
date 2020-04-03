/*
This module should handle connecting to the database and all the CRUD operations
*/
const { MongoClient, Db } = require('mongodb');
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
 * @param {string} division What division the team is in
 * @returns {Promise<boolean>} Whether the team was added
 */
async function addTeam(teamName, division)
{
    console.log(`Looking for team: ${teamName}`);
    let find = await db.collection('teams').findOne({ name: teamName });
    console.log(find);

    if (find)
        return undefined;

    let result = await db.collection('teams').insertOne({
        name: teamName,
        division: division,
        players: [],
        maps: []
    });

    return result.insertedCount > 0;
}

/**
 * Sets the maps for a team to a certain state
 * @param {{
 *     name: string,
 *     maps: any[]
 * }} team 
 */
async function setTeamState(team)
{
    let result = await db.collection('teams').updateOne(
        { name: team.name },
        { $set: { maps: team.maps } }
    );
    return result.modifiedCount;
}

/**
 * Adds a player to a team
 * @param {string} teamName The team to add to
 * @param {string} osuid The player's osu id
 * @param {string} osuname The player's osu username
 * @param {string} discordid The player's discord id
 * @returns How many records were modified
 */
async function addPlayer(teamName, osuid, osuname, discordid)
{
    console.log(`Adding ${osuname} to ${teamName}`);
    // If the team doesn't exist, add it first

    let result = await db.collection('teams').updateOne(
        { name: teamName },
        {
            $push: { players: {
                osuid: osuid,
                osuname: osuname,
                discordid: discordid,
                notif: false
            } },
            $setOnInsert: {
                division: "Open",
                maps: []
            }
        },
        { upsert: true }
    );
    return result.modifiedCount + result.upsertedCount;
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
 * Removes a player from all teams they might be on
 * @param {string} osuname The player to remove
 * @returns How many records were modified
 */
async function removePlayer(osuname)
{
    console.log(`Removing ${osuname} from all their teams`);
    let reg = regexify(osuname, 'i');
    let result = await db.collection('teams').updateMany(
        { 'players.osuname': reg },
        { $pull: { players: { osuname: reg } } }
    );
    console.log(`Removed from ${result.modifiedCount} teams`);
    return result.modifiedCount;
}

/**
 * Move a player from one team to another
 * @param {string} teamName The team name to move to
 * @param {string|number} osuname The player's osu username or osu id
 * @returns How many records were modified, or -1 if the player wasn't found
 */
async function movePlayer(teamName, osuname)
{
    console.log(`Moving ${osuname} to ${teamName}`);
    let reg = regexify(osuname, 'i');
    // Pull the player from their old team
    let team = await db.collection('teams').findOneAndUpdate(
        { 'players.osuname': reg },
        { $pull: { players: { $or: [
            { osuname: reg },
            { osuid: osuname }
        ] } } }
    );
    // If the player wasn't found, quit early
    if (!team.value)
        return -1;
    let player = team.value.players.find(item => item.osuname.match(reg) || item.osuid == osuname);
    return addPlayer(teamName, player.osuid, player.osuname, player.discordid);
}

/**
 * Updates the osuname of a given discordid
 * @param {String} discordid 
 * @param {String} osuname What to update the player's name to
 * @returns How many documents were modified
 */
async function updatePlayer(discordid, osuname)
{
    let result = await db.collection('teams').updateOne(
        { 'players.discordid': discordid },
        { $set: { 'players.$.osuname': osuname } }
    );
    return result.modifiedCount;
}

/**
 * Toggles whether the player wants to receive notifications of map updates
 * @param {string} discordid The Discord id of the player to update
 * @returns True/False indicating the new status, or undefined if the player
 * wasn't found
 */
async function toggleNotification(discordid)
{
    let team = await db.collection('teams').findOne({
        'players.discordid': discordid
    });
    if (!team)
        return;
    
    if (team.players.find(p => p.discordid === discordid).notif === false)
    {
        let result = await db.collection('teams').updateOne(
            { 'players.discordid': discordid },
            { $unset: { 'players.$.notif': "" } }
        );
        if (result.modifiedCount)
            return true;
    }
    else
    {
        let result = await db.collection('teams').updateOne(
            { 'players.discordid': discordid },
            { $set: { 'players.$.notif': false } }
        );
        if (result.modifiedCount)
            return false;
    }
}

/**
 * Gets which team a player is on based on their osu id or discord id
 * @param {string|number} id The player's id, either discord or osu id
 */
async function getTeam(id)
{
    console.log(`Finding team for player ${id}`);
    let team = await db.collection('teams').findOne({
        $or: [
            { 'players.discordid': id },
            { 'players.osuid': id },
            { 'players.osuname': id }
        ]
    });
    console.log(util.inspect(team, { depth: 1 }));
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
 * @returns True if the map was added without issue, false if the map wasn't added,
 * and a map object if a map got replaced.
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
        // Return the removed item
        return teamobj.value.maps.find(m => m.pool === map.pool);
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
    let updateobj = {
        filter: {
            name: team,
            maps: { $elemMatch: {
                id: mapid
            } }
        },
        update: {
            $unset: { 'maps.$': "" }
        }
    };
    if (modpool !== undefined)
        updateobj.filter.maps.$elemMatch.pool = modpool;
    if (mods !== undefined)
        updateobj.filter.maps.$elemMatch.mod = mods;
    let result = await db.collection('teams').bulkWrite([
        { updateOne: updateobj },
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
 * Removes all maps from the given team's pool
 * @param {string} team Team name
 * @returns The number of teams modified
 */
async function removeAllMaps(team)
{
    let result = await db.collection('teams').updateOne(
        { name: team },
        {
            $set: {
                maps: []
            }
        }
    );
    return result.modifiedCount;
}

/**
 * Finds all maps with a pending status
 * @param {string} status What status the map should have
 */
async function findMapsWithStatus(status)
{
    let cursor = db.collection('teams').aggregate([
        { $match: { 'maps.status': status } },
        { $unwind: "$maps" },
        { $match: { 'maps.status': status } },
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
 * @param {String} team The team to update
 * @param {Number} mapid The map id to update
 * @param {boolean} to_pending True if changing to "Pending" status,
 * false if changing back to "Screenshot Required" status
 * @returns The team that got updated, or null if no team/map matched
 */
async function pendingMap(team, mapid, to_pending = true)
{
    let fromstatus;
    let tostatus;
    if (to_pending)
    {
        fromstatus = "Screenshot Required";
        tostatus = "Pending";
    }
    else
    {
        fromstatus = "Pending";
        tostatus = "Screenshot Required"
    }
    console.log(`Updating from ${fromstatus} to ${tostatus}`);
    // We don't care about mod at this point, they're not supposed to have
    // the same map more than once anyways.
    // There is a check for current status though, no point in resetting an
    // approved status back to pending just by submitting a screenshot
    let result = await db.collection('teams').findOneAndUpdate(
        {
            name: regexify(team, 'i'),
            maps: { $elemMatch: {
                id: mapid,
                status: fromstatus
            } }
        },
        { $set: { 'maps.$[pendmap].status': tostatus } },
        { arrayFilters: [
            {
                'pendmap.status': fromstatus,
                'pendmap.id': mapid
            }
        ] }
    );
    console.log(result);
    return result.value;
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
            id: mapid,
            mod: mods
        } } },
        { $set: { 'maps.$[pendmap].status': "Accepted" } },
        { arrayFilters: [
            {
                'pendmap.id': mapid,
                'pendmap.mod': mods,
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
    let playerlist = db.collection('teams').aggregate([
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
    console.log(players);
    // Update the status
    // Not limiting to pending maps here because it's conceivable that a
    // screenshot required map can be rejected, and maps that are rejected
    // for one team should be rejected for all teams
    let result = await db.collection('teams').updateMany(
        { maps: { $elemMatch: {
            id: mapid,
            mod: mods
        } } },
        { $set: { 'maps.$[map].status': "Rejected - " + message } },
        { arrayFilters: [
            {
                'map.id': mapid,
                'map.mod': mods
            }
        ] }
    );
    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
    return {
        playerNotif: players,
        modified: result.modifiedCount
    };
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
 * @param {"Open"|"15k"} division Which division to update
 */
async function bulkReject(maps, message, division)
{
    message = 'Rejected - ' + message;
    // If possible, I'd like to do away with this manually constructing
    // arrayFilters
    let filters = maps.map(item => {
        return {
            'badmap.id': item.id,
            'badmap.mod': item.mod
        };
    });

    // Reject all maps matching the criteria
    let result = await db.collection('teams').updateMany(
        { division: division },
        { $set: { 'maps.$[badmap].status': message } },
        { arrayFilters: [
            { $or: filters }
        ] }
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
    updatePlayer,
    toggleNotification,
    getTeam,
    setTeamState,
    addMap,     // Maps
    removeMap,
    removeAllMaps,
    findMapsWithStatus,
    pendingMap,
    approveMap,
    rejectMap,
    findMissingMaps,
    bulkReject,  // General management
    getDb,
    performAction
};