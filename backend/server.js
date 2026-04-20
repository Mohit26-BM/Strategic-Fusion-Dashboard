const axios = require("axios");

async function getCity(lat, lng) {
  try {
    const res = await axios.get(
      "https://nominatim.openstreetmap.org/reverse",
      {
        params: { lat, lon: lng, format: "json" },
        headers: { "User-Agent": "intel-dashboard" }
      }
    );
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
const express = require("express");
const { MongoClient } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv");


dotenv.config({ override: true });
console.log("RAW MONGO_DB VALUE:", JSON.stringify(process.env.MONGO_DB));

// --------------------
// App setup
// --------------------
const app = express();
app.use(cors());
app.use(express.json());

// --------------------
// Config (validated)
// --------------------
const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
const rawDbName = process.env.MONGO_DB || "intel_db";
const port = process.env.PORT ? Number(process.env.PORT) : 5000;

// Guard against your previous bug
if (rawDbName.includes(".")) {
  throw new Error("MONGO_DB must NOT contain '.'");
  
}

const dbName = rawDbName;

const client = new MongoClient(uri);
let db;


// --------------------
// Routes
// --------------------

// Health check
app.get("/", (req, res) => {
  res.send("API running");
});

// GET all nodes
app.get("/api/intelligence", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "DB not ready" });

    const data = await db
      .collection("intelligence")
      .find({})
      .sort({ timestamp: -1 })
      .toArray();

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST single node
app.post("/api/intelligence", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "DB not ready" });

    const { lat, lng, type, title } = req.body;

    // Validation
    if (
      lat == null ||
      lng == null ||
      Number.isNaN(Number(lat)) ||
      Number.isNaN(Number(lng))
    ) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Out-of-range coordinates" });
    }

    if (!type || typeof type !== "string") {
      return res.status(400).json({ error: "Invalid type" });
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Invalid title" });
    }

    const city = await getCity(lat, lng);
    const doc = {
      ...req.body,
      city,
      title: `${city} - ${req.body.title}`,
      description: `${city}: ${req.body.description || ""}`,
      timestamp: new Date(),
    };
    const result = await db.collection("intelligence").insertOne(doc);
    res.json({ success: true, id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: "Insert failed" });
  }
});

// POST bulk nodes
app.post("/api/intelligence/bulk", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "DB not ready" });

    const nodes = req.body.nodes;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ error: "nodes array required" });
    }

    // Filter valid nodes (you skipped this earlier)
    const validNodes = nodes.filter(
      (n) =>
        n &&
        typeof n.lat === "number" &&
        typeof n.lng === "number" &&
        typeof n.type === "string" &&
        typeof n.title === "string",
    );

    if (validNodes.length === 0) {
      return res.status(400).json({ error: "No valid nodes" });
    }

    const docs = await Promise.all(
      validNodes.map(async (n) => {
        const city = await getCity(n.lat, n.lng);
        return {
          ...n,
          city,
          title: `${city} - ${n.title}`,
          description: `${city}: ${n.description || ""}`,
          timestamp: new Date(),
        };
      })
    );
    const result = await db.collection("intelligence").insertMany(docs);
    res.json({
      success: true,
      insertedCount: result.insertedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------
// Startup (correct lifecycle)
// --------------------
async function start() {
  try {
    console.log("Connecting to MongoDB...");
    console.log("DB NAME:", dbName);

    await client.connect();
    db = client.db(dbName);

    console.log("MongoDB connected");

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (err) {
    console.error("Startup failed:", err.message);
    process.exit(1);
  }
}

start();
