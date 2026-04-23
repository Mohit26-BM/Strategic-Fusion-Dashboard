console.log("SERVER FILE LOADED");

const axios = require("axios");
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ override: true });
console.log("RAW MONGO_DB VALUE:", JSON.stringify(process.env.MONGO_DB));

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
      "Unknown"
    );
  } catch {
    return "Unknown";
  }
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validateNodePayload(payload, { partial = false } = {}) {
  const errors = [];
  const update = {};

  if (!partial || payload.lat != null || payload.lng != null) {
    const lat = toNumber(payload.lat);
    const lng = toNumber(payload.lng);

    if (lat == null || lng == null) {
      errors.push("Invalid coordinates");
    } else if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      errors.push("Out-of-range coordinates");
    } else {
      update.lat = lat;
      update.lng = lng;
    }
  }

  if (!partial || payload.type != null) {
    if (!payload.type || typeof payload.type !== "string") {
      errors.push("Invalid type");
    } else {
      update.type = payload.type.trim().toUpperCase();
    }
  }

  if (!partial || payload.title != null) {
    if (!payload.title || typeof payload.title !== "string" || !payload.title.trim()) {
      errors.push("Invalid title");
    } else {
      update.title = payload.title.trim();
    }
  }

  if (payload.description != null) {
    update.description = String(payload.description).trim();
  }

  if (payload.source != null) {
    update.source = String(payload.source).trim();
  }

  if (payload.image_url != null) {
    update.image_url = String(payload.image_url).trim();
  }

  if (payload.timestamp != null) {
    const timestamp = new Date(payload.timestamp);

    if (Number.isNaN(timestamp.getTime())) {
      errors.push("Invalid timestamp");
    } else {
      update.timestamp = timestamp;
    }
  }

  return { errors, update };
}

function getNodeId(req, res) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: "Invalid node id" });
    return null;
  }

  return new ObjectId(req.params.id);
}

// --------------------
// App setup
// --------------------
const app = express();
app.use(cors());
app.use(express.json());

// --------------------
// Config
// --------------------
const uri = process.env.MONGO_URI;

if (!uri) {
  throw new Error("MONGO_URI not set");
}

const rawDbName = process.env.MONGO_DB || "intel_db";
const port = process.env.PORT ? Number(process.env.PORT) : 5000;

if (rawDbName.includes(".")) {
  throw new Error("MONGO_DB must NOT contain '.'");
}

const dbName = rawDbName;
const client = new MongoClient(uri);
let db;

// --------------------
// Routes
// --------------------
app.get("/", (req, res) => {
  res.send("API running");
});

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

app.post("/api/intelligence", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "DB not ready" });

    const { errors, update } = validateNodePayload(req.body);

    if (errors.length) {
      return res.status(400).json({ error: errors.join(", ") });
    }

    const city = await getCity(update.lat, update.lng);

    const doc = {
      ...req.body,
      ...update,
      city,
      timestamp: new Date(),
    };

    const result = await db.collection("intelligence").insertOne(doc);

    res.status(201).json({
      success: true,
      id: result.insertedId,
      node: { ...doc, _id: result.insertedId },
    });
  } catch {
    res.status(500).json({ error: "Insert failed" });
  }
});

app.post("/api/intelligence/bulk", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "DB not ready" });

    const nodes = req.body.nodes;

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ error: "nodes array required" });
    }

    const validNodes = nodes
      .map((node) => {
        if (!node || typeof node !== "object") return null;

        const { errors, update } = validateNodePayload(node);
        if (errors.length) return null;

        return { ...node, ...update };
      })
      .filter(Boolean);

    if (validNodes.length === 0) {
      return res.status(400).json({ error: "No valid nodes" });
    }

    const docs = await Promise.all(
      validNodes.map(async (node) => {
        const city = await getCity(node.lat, node.lng);

        return {
          ...node,
          city,
          timestamp: new Date(),
        };
      }),
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

app.put("/api/intelligence/:id", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "DB not ready" });

    const nodeId = getNodeId(req, res);
    if (!nodeId) return;

    const { errors, update } = validateNodePayload(req.body, { partial: true });

    if (errors.length) {
      return res.status(400).json({ error: errors.join(", ") });
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    if (update.lat != null && update.lng != null) {
      update.city = await getCity(update.lat, update.lng);
    }

    update.updatedAt = new Date();

    const result = await db.collection("intelligence").findOneAndUpdate(
      { _id: nodeId },
      { $set: update },
      { returnDocument: "after" },
    );

    const updatedNode = result && (result.value || result);

    if (!updatedNode) {
      return res.status(404).json({ error: "Node not found" });
    }

    res.json({ success: true, node: updatedNode });
  } catch {
    res.status(500).json({ error: "Update failed" });
  }
});

app.delete("/api/intelligence/:id", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "DB not ready" });

    const nodeId = getNodeId(req, res);
    if (!nodeId) return;

    const result = await db.collection("intelligence").deleteOne({ _id: nodeId });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Node not found" });
    }

    res.json({
      success: true,
      deletedId: req.params.id,
    });
  } catch {
    res.status(500).json({ error: "Delete failed" });
  }
});

// --------------------
// Startup
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
