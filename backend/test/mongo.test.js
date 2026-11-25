// Runs the store and the whole API against a REAL MongoDB (an in-memory instance), so the MongoDB code path is tested too.
// Skipped automatically when no MongoDB can be started (for example no network to download it the first time).
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { MongoClient } = require("mongodb");
const { startApi, goodNode, TOKEN } = require("./helpers");
const { createMongoStore } = require("../store");

let mongod;
let client;
let store;
let skipReason = false;

before(async () => {
  try {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    store = createMongoStore(client.db("intel_test"));
    await store.ensureIndexes();
  } catch (err) {
    skipReason = `no MongoDB available: ${err.message}`;
  }
});

after(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("MongoDB store", () => {
  test("insert, list (newest first), update, setCity and remove", { skip: skipReason }, async () => {
    const a = await store.insert({ ...goodNode({ title: "old" }), city: "A", timestamp: new Date("2024-01-01") });
    const b = await store.insert({ ...goodNode({ title: "new" }), city: "B", timestamp: new Date("2025-01-01") });
    assert.match(String(a._id), /^[0-9a-f]{24}$/);

    const listed = await store.list({ limit: 10 });
    assert.deepEqual(listed.map((n) => n.title), ["new", "old"]);
    assert.equal((await store.list({ limit: 1 })).length, 1);

    const updated = await store.update(String(a._id), { title: "renamed", updatedAt: new Date() });
    assert.equal(updated.title, "renamed");
    assert.equal(updated.city, "A", "fields that were not sent are untouched");
    assert.equal(await store.update("000000000000000000000001", { title: "x" }), null);

    await store.setCity(String(b._id), "Elsewhere");
    assert.equal((await store.list({ limit: 10 })).find((n) => n.title === "new").city, "Elsewhere");

    assert.equal(await store.remove(String(a._id)), true);
    assert.equal(await store.remove(String(a._id)), false);
    await store.remove(String(b._id));
  });

  test("insertMany returns every document with its id", { skip: skipReason }, async () => {
    const docs = await store.insertMany([{ ...goodNode({ title: "x" }), timestamp: new Date() }, { ...goodNode({ title: "y" }), timestamp: new Date() }]);
    assert.equal(docs.length, 2);
    assert.ok(docs.every((d) => /^[0-9a-f]{24}$/.test(String(d._id))));
    for (const d of docs) await store.remove(String(d._id));
  });

  test("ids are only accepted as 24 hex characters", { skip: skipReason }, () => {
    assert.equal(store.isValidId("5f1d7f3b9d1e8a0012ab34cd"), true);
    for (const bad of ["123", "123456789012", { $ne: 1 }, "gggggggggggggggggggggggg", undefined, null]) assert.equal(store.isValidId(bad), false);
  });

  test("a node survives a trip through the real database unchanged", { skip: skipReason }, async () => {
    const original = { ...goodNode({ title: "round trip", description: "Ünïcode ✓ — 日本語", image_url: "https://img.example/a.jpg" }), city: "Pune", timestamp: new Date() };
    const saved = await store.insert(original);
    const back = (await store.list({ limit: 50 })).find((n) => String(n._id) === String(saved._id));
    assert.equal(back.description, original.description);
    assert.equal(back.lat, original.lat);
    await store.remove(String(saved._id));
  });
});

describe("whole API on a real MongoDB", () => {
  test("add, bulk import, edit and delete through HTTP with the token", { skip: skipReason }, async () => {
    const api = await startApi({ store });
    try {
      const created = await api.post("/api/intelligence", goodNode({ title: "via http" }), { token: TOKEN });
      assert.equal(created.status, 201);
      assert.match(String(created.body.id), /^[0-9a-f]{24}$/);

      const bulk = await api.post("/api/intelligence/bulk", { nodes: [goodNode({ title: "b1" }), goodNode({ title: "b2" }), { lat: "x" }] }, { token: TOKEN });
      assert.equal(bulk.body.insertedCount, 2);
      assert.equal(bulk.body.skippedCount, 1);

      let list = (await api.get("/api/intelligence")).body;
      assert.deepEqual(list.map((n) => n.title).sort(), ["b1", "b2", "via http"]);
      assert.ok(list.every((n) => typeof n._id === "string"), "ids are sent to the browser as strings");

      const edited = await api.put(`/api/intelligence/${created.body.id}`, { title: "edited" }, { token: TOKEN });
      assert.equal(edited.body.node.title, "edited");

      assert.equal((await api.del(`/api/intelligence/${created.body.id}`, { token: TOKEN })).status, 200);
      list = (await api.get("/api/intelligence")).body;
      assert.equal(list.length, 2);

      assert.equal((await api.post("/api/intelligence", goodNode())).status, 401, "still protected");
    } finally {
      await api.stop();
    }
  });

  test("a Mongo-operator injection in the body is stored as plain text or refused, never executed", { skip: skipReason }, async () => {
    const api = await startApi({ store });
    try {
      const attack = await api.post("/api/intelligence", { ...goodNode(), title: { $gt: "" }, type: { $ne: null } }, { token: TOKEN });
      assert.equal(attack.status, 400);
      assert.equal((await api.put("/api/intelligence/5f1d7f3b9d1e8a0012ab34cd", { $set: { type: "X" } }, { token: TOKEN })).status, 400);
    } finally {
      await api.stop();
    }
  });
});
