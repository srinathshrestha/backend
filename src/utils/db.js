const { MongoClient } = require('mongodb');
const { mongodbUri, mongodbDbName } = require('../config');
const { importFromFilesystem } = require('./importFromFilesystem');

let client;
let database;

async function connectToDatabase() {
    if (database) {
        return database;
    }

    if (!mongodbUri) {
        throw new Error('MONGODB_URI is not configured');
    }

    client = new MongoClient(mongodbUri, {
        serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    database = client.db(mongodbDbName);

    await database.collection('posts').createIndex({ slug: 1 }, { unique: true });
    await database.collection('posts').createIndex({ status: 1, publishedAt: -1 });
    await importFromFilesystem(database);

    console.log(`[rawdog-blog] connected to MongoDB database "${mongodbDbName}"`);
    return database;
}

function getDb() {
    if (!database) {
        throw new Error('Database has not been initialised. Call connectToDatabase() first.');
    }
    return database;
}

async function closeDatabase() {
    if (client) {
        await client.close();
        client = null;
        database = null;
    }
}

module.exports = {
    connectToDatabase,
    getDb,
    closeDatabase,
};
