import { MongoClient, Db } from 'mongodb';

const DB_KEY = Symbol.for("PYOP.db");
const globalSymbols = Object.getOwnPropertySymbols(global);
const hasDb = (globalSymbols.indexOf(DB_KEY) > -1);
export const ready = new Promise((resolve) => {
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
            if (err) {
                console.error(err);
                resolve(false);
            }
            else {
                console.log("Connected to mongodb");
                resolve(true);
            }
        });

        global[DB_KEY] = client;
    }
});

export default {
    collection<T = any>(coll: string) {
        const db: Db = global[DB_KEY].db('pyopdb');
        return db.collection<T>(coll);
    }
};
