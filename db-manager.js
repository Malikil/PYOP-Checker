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
    //discordClient.login(process.env.DISCORD_TOKEN);
});

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
        maps: {
            nm: [],
            hd: [],
            hr: [],
            dt: [],
            cm: []
        }
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
    let result = await db.collection('teams').updateMany(
        { 'players.osuname': osuname },
        { $pull: { players: { osuname: osuname } } }
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
    let team = await db.collection('teams').findOneAndUpdate(
        { 'players.osuname': osuname },
        { $pull: { players: { osuname: osuname } } }
    );
    let player = team.value.players.find(item => item.osuname == osuname);
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
 * @param {"nm"|"hd"|"hr"|"dt"|"cm"} mod The mod to add the map to.
 * @param {*} map Map object containing id, status, drain, stars, and mod if customMod
 */
async function addMap(team, mod, map)
{
    console.log(`Adding map ${map.id} to ${team}'s ${mod} pool`);
    let updateobj = { $push: {}};
    updateobj.$push[`maps.${mod}`] = map;
    let teamobj = await db.collection('teams').findOneAndUpdate(
        { name: team },
        updateobj,
        { returnOriginal: false }
    );
    console.log(`Team ok: ${teamobj.ok}`);
    if (teamobj.value.maps[mod].length > 2)
    {
        updateobj = { $pop: {}};
        updateobj.$pop[`maps.${mod}`] = -1;
        db.collection('teams').updateOne(
            { name: team },
            updateobj
        );
    }
    return teamobj.ok;
}

/**
 * Remooves a map from a team's pool. If mod is left out all instances of the
 * map are removed. If mod is included only maps from that pool will be removed.
 * @param {string} team The team name to remove the map from
 * @param {Number} mapid The beatmap id to remove
 * @param {Array<"nm"|"hd"|"hr"|"dt"|"cm">} mod (optional) The modpool for the map
 * @returns The number of modified documents
 */
async function removeMap(team, mapid, mod)
{
    // Needs to be structured like $pull: { 'maps.${m}': { id: mapid } }
    let updateobj = { $pull: {}};
    if (mod.length > 0)
        mod.forEach(m => updateobj.$pull[`maps.${m}`] = { id: mapid });
    else
        updateobj.$pull = {
            'maps.nm': { id: mapid },
            'maps.hd': { id: mapid },
            'maps.hr': { id: mapid },
            'maps.dt': { id: mapid },
            'maps.cm': { id: mapid }
        };
    let result = await db.collection('teams').updateOne({ name: team }, updateobj);
    return result.result.nModified;
}

/**
 * Finds all teams with pending maps
 */
async function findPendingTeams()
{
    let cursor = db.collection('teams').find({ $or: [
        { 'maps.nm.status': 'Pending' },
        { 'maps.hd.status': 'Pending' },
        { 'maps.hr.status': 'Pending' },
        { 'maps.dt.status': 'Pending' },
        { 'maps.cm.status': 'Pending' }
    ]});
    return cursor.toArray();
}

/**
 * Approves a map in a given modpool/with mods
 * @param {Number} mapid The map id to update
 * @param {string} modpool The modpool the map is in
 * @param {Number} mods The mods the map uses, if custom mod
 */
async function approveMap(mapid, modpool, mods)
{
    console.log(`Approving ${mapid} +${mods} in ${modpool}`);
    let findobj = {};
    findobj[`maps.${modpool}.id`] = mapid;
    if (mods) findobj[`maps.${modpool}.mod`] = mods;
    console.log(`Searching for: ${util.inspect(findobj)}`);
    let updateobj = { $set: { maps: {} } };
    updateobj.$set[`maps.${modpool}.$[map].status`] = 'Approved';
    console.log(`Updating with: ${util.inspect(updateobj)}`);
    let result = await db.collection('teams').updateMany(
        findobj,
        updateobj,
        { 'map.mod': mods }
    );
    console.log(`Matched ${result.matchedCount}, modified ${result.modifiedCount}`);
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
    findPendingTeams,
    approveMap
};