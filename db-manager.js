/*
This module should handle connecting to the database and all the CRUD operations
*/
const { MongoClient, Db } = require('mongodb');
const discordClient = require('./disbot');

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
client.connect((err, database) => {
    if (err)
        return console.log(err);
    else
        console.log("Connected to mongodb");

    db = client.db('pyopdb');

    discordClient.login(process.env.DISCORD_TOKEN);
});
console.log('passed by connect');
function getAllDocuments()
{
    let cursor = db.collection('teams').find();
    cursor.forEach(item => console.log(item));
    cursor.close();
}

module.exports = {
    getAllDocuments
};