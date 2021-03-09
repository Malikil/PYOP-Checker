const { MongoClient } = require('mongodb');

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

    global[DB_KEY] = new Promise((resolve, reject) => {
        client.connect(err => {
            if (err)
                reject(err);
            else {
                console.log("Connected to mongodb");
                resolve(client.db('pyopdb'));
            }
        });
    })
}

const singleton = {
    
};
/*Object.defineProperty(singleton, "instance", {
    get: () => global[DB_KEY]
});//*/
Object.freeze(singleton);

module.exports = singleton;

/** @type {Db} */