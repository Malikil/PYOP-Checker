const MongoClient = require('mongodb').MongoClient;

const mongoUser = process.env.MONGO_USER;
const mongoPass = process.env.MONGO_PASS;
const mongoUri = process.env.MONGO_URI;
const uri = `mongodb+srv://${mongoUser}:${mongoPass}@${mongoUri}`;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
client.connect(err => {
    console.log(err);

    var collection = client.db("pyopdb").collection("teams");
    console.log(`Connection: ${!!collection}`);

    let cursor = collection.find();
    cursor.forEach(item => console.log(item))
    .then(() => {
        console.log("Closing connection");
        client.close();
        console.log("Connection closed");
    });
});
