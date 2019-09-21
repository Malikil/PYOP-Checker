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
 * Gets all documents from the database, and performs a specified action on
 * each one.
 */
async function getAllDocuments()
{
    let cursor = db.collection('teams').find();
    let vals = await cursor.toArray();
    cursor.close();
    return vals;
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
    let find = await db.collection('teams').findOne({name: teamName});
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

module.exports = {
    client,
    getAllDocuments,
    getOsuId,
    addTeam     // Teams
};