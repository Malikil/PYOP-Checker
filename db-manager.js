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
    console.log(`Found ${discordid} => ${util.inspect(info)}`);
    return info.osuid;
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
    let updateobj = {};
    updateobj[`maps.${mod}`] = { $push: map };
    let teamobj = await db.collection('teams').findOneAndUpdate(
        { name: team },
        updateobj,
        { returnOriginal: false }
    );
    console.log(`Team ok: ${teamobj.ok}`);
    if (teamobj.value.maps[mod].length > 2)
    {
        updateobj[`maps.${mod}`] = { $pop: -1 };
        db.collection('teams').updateOne(
            { name: team },
            updateobj
        );
    }
    return teamobj.ok;
}

module.exports = {
    getOsuId,
    addTeam,    // Teams/players
    addPlayer,
    removePlayer,
    movePlayer,
    getTeam,
    addMap      // Maps
};