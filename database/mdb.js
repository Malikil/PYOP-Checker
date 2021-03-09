const { MongoClient, Db } = require('mongodb');

const DB_KEY = Symbol.for("PYOP.db");
const globalSymbols = Object.getOwnPropertySymbols(global);
const hasDb = (globalSymbols.indexOf(DB_KEY) > -1);

if (!hasDb) {
    const mongoUser = process.env.MONGO_USER;
    const mongoPass = process.env.MONGO_PASS;
    const mongoUri = process.env.MONGO_URI;
    const uri = `mongodb+srv://${mongoUser}:${mongoPass}@${mongoUri}`;
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    client.connect(err => {
        if (err)
            return console.error(err);
        else
            console.log("Connected to mongodb");
    });

    global[DB_KEY] = client;
}

module.exports = {
    collection(coll) {
        /** @type {Db} */
        const db = global[DB_KEY].db('pyopdb');
        return db.collection(coll);
    }
};
