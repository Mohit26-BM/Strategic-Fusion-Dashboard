// One-off maintenance: fills in or refreshes the `city` of nodes that have none (or "Unknown").
//   npm run migrate:cities            only nodes without a city
//   npm run migrate:cities -- --all   every node
// Uses the same polite geocoder as the API (one request per ~1.1 s), so a big collection takes a while.
const { loadDotEnv } = require("../env");
loadDotEnv();
const { MongoClient } = require("mongodb");
const { loadConfig } = require("../config");
const { createGeocoder } = require("../geocoder");

async function run() {
  const config = loadConfig();
  const everything = process.argv.includes("--all");
  const geocoder = createGeocoder(config.geocoding);

  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    const collection = client.db(config.dbName).collection("intelligence");
    const filter = everything ? {} : { $or: [{ city: { $exists: false } }, { city: null }, { city: "Unknown" }, { city: "" }] };
    const docs = await collection.find(filter, { projection: { lat: 1, lng: 1 } }).toArray();
    console.log(`${docs.length} node(s) to update`);

    let updated = 0;
    for (const doc of docs) {
      const city = await geocoder.lookup(doc.lat, doc.lng);
      if (!city) {
        console.log("No result for", String(doc._id));
        continue;
      }
      await collection.updateOne({ _id: doc._id }, { $set: { city } });
      updated++;
      console.log("Updated:", String(doc._id), city);
    }
    console.log(`Done: ${updated} updated`);
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
