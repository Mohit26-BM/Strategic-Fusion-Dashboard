require("dotenv").config({ override: true });
const { MongoClient } = require("mongodb");
const axios = require("axios");

const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const dbName = process.env.MONGO_DB || "intel_db";
const client = new MongoClient(uri);

async function getCity(lat, lng) {
  try {
    const res = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { lat, lon: lng, format: "json" },
      headers: { "User-Agent": "intel-dashboard" },
    });
    return (
      res.data.address.city ||
      res.data.address.town ||
      res.data.address.state ||
      "Unknown"
    );
  } catch {
    return "Unknown";
  }
}

async function run() {
  await client.connect();
  const db = client.db(dbName);
  const docs = await db.collection("intelligence").find().toArray();
  for (const doc of docs) {
    const city = await getCity(doc.lat, doc.lng);
    await db.collection("intelligence").updateOne(
      { _id: doc._id },
      {
        $set: {
          city,
          title: `${city} - ${doc.title}`,
          description: `${city}: ${doc.description || ""}`,
        },
      },
    );
    console.log("Updated:", doc._id, city);
  }
  console.log("Done");
  process.exit();
}

run();
