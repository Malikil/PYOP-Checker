/*
This module should handle connecting to the database and all the CRUD operations
*/
const { MongoClient, Db } = require('mongodb');

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
 * @param callback A callback function to do for each of the database items
 */
function getAllDocuments(callback)
{
    let cursor = db.collection('teams').find();
    cursor.forEach(callback)
    .then(() => cursor.close());
}

/**
 * Will get an osu id from a discord id if that user is currently registered
 * on a team in the database
 * @param {string} discordid The discord userid to search for
 */
function getOsuId(discordid)
{
    let player = await db.collection('teams').findOne({
        'players.discordid': discordid
    });
}

module.exports = {
    client,
    getAllDocuments
};