// The data layer. The API only talks to a "store", so it can run against MongoDB (production)
// or the in-memory store (tests and `npm run dev:memdb`).
const { ObjectId } = require("mongodb");

const COLLECTION = "intelligence";

function isValidObjectId(id) {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

function createMongoStore(db) {
  const collection = db.collection(COLLECTION);

  return {
    isValidId: isValidObjectId,

    async ensureIndexes() {
      await collection.createIndex({ timestamp: -1 });
    },

    async list({ limit }) {
      return collection.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
    },

    async insert(doc) {
      const result = await collection.insertOne({ ...doc });
      return { ...doc, _id: result.insertedId };
    },

    async insertMany(docs) {
      const result = await collection.insertMany(docs.map((doc) => ({ ...doc })));
      return docs.map((doc, index) => ({ ...doc, _id: result.insertedIds[index] }));
    },

    /** @returns the updated document, or null when there is no such id */
    async update(id, patch) {
      return collection.findOneAndUpdate({ _id: new ObjectId(id) }, { $set: patch }, { returnDocument: "after" });
    },

    async remove(id) {
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      return result.deletedCount > 0;
    },

    async setCity(id, city) {
      await collection.updateOne({ _id: new ObjectId(id) }, { $set: { city } });
    },

    async ping() {
      await db.command({ ping: 1 });
    },
  };
}

/** Same behaviour, kept in memory. */
function createMemoryStore() {
  const docs = new Map();
  let counter = 0;
  const nextId = () => (++counter).toString(16).padStart(24, "0");

  return {
    isValidId: isValidObjectId,
    async ensureIndexes() {},
    async list({ limit }) {
      return [...docs.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit).map((d) => ({ ...d }));
    },
    async insert(doc) {
      const saved = { ...doc, _id: nextId() };
      docs.set(saved._id, saved);
      return { ...saved };
    },
    async insertMany(list) {
      return Promise.all(list.map((doc) => this.insert(doc)));
    },
    async update(id, patch) {
      const current = docs.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      docs.set(id, next);
      return { ...next };
    },
    async remove(id) {
      return docs.delete(id);
    },
    async setCity(id, city) {
      const current = docs.get(id);
      if (current) current.city = city;
    },
    async ping() {},
    _all: () => [...docs.values()],
  };
}

module.exports = { createMongoStore, createMemoryStore, isValidObjectId };
