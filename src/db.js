import { MongoClient } from "mongodb";

const DEFAULT_URI = "mongodb://127.0.0.1:27017/studiospace";
const DEFAULT_DB_NAME = "studiospace";

let client = null;

export async function connectDB() {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  client = new MongoClient(uri);
  await client.connect();
  console.log("Connected to MongoDB");
  return client;
}

export function getDb() {
  if (!client) {
    throw new Error("Database not connected — call connectDB() first");
  }
  return client.db(process.env.MONGODB_DB || DEFAULT_DB_NAME);
}
