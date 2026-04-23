require("dotenv").config();

const { MongoClient } = require("mongodb");
const axios = require("axios");

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB || "intel_db";

if (!uri) {
  throw new Error("MONGO_URI is not defined in environment variables");
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getCity(lat, lng) {
  try {
    const res = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: { lat, lon: lng, format: "json" },
        headers: { "User-Agent": "intel-dashboard" },
      },
    );

    return (
      res.data.address.city ||
      res.data.address.town ||
      res.data.address.village ||
      res.data.address.municipality ||
      res.data.address.county ||
      res.data.address.state ||
      ""
    );
  } catch (err) {
    console.error("Geocoding failed:", err.message);
    return "";
  }
}

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await client.connect();

    const db = client.db(dbName);
    console.log("Connected to DB:", dbName);

    const docs = await db.collection("intelligence").find().toArray();
    console.log(`Found ${docs.length} documents`);

    for (const doc of docs) {
      if (doc.lat == null || doc.lng == null) {
        console.log("Skipping invalid doc:", doc._id);
        continue;
      }

      const city = await getCity(doc.lat, doc.lng);

      await db.collection("intelligence").updateOne(
        { _id: doc._id },
        {
          $set: {
            city,
          },
        },
      );

      console.log("Updated:", doc._id, city || "No city found");

      await delay(1000);
    }

    console.log("Done updating all documents");
  } catch (err) {
    console.error("Script failed:", err.message);
  } finally {
    await client.close();
    process.exit(0);
  }
}

run();
