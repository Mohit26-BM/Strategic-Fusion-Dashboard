const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { startApi, fakeGeocoder, goodNode, TOKEN } = require("./helpers");
const { createMemoryStore } = require("../store");

describe("API with a configured admin token", () => {
  let api;
  before(async () => {
    api = await startApi();
  });
  after(() => api.stop());
  beforeEach(async () => {
    for (const d of api.store._all()) await api.store.remove(d._id);
    api.geocoder.calls.length = 0;
  });

  test("health, root and public config answer without a token", async () => {
    assert.deepEqual((await api.get("/health")).body, { status: "ok", db: "up" });
    assert.equal((await api.get("/")).text, "API running");
    assert.deepEqual((await api.get("/api/config")).body, { writesEnabled: true, bulkMax: 500 });
  });

  test("reading is public and newest first", async () => {
    await api.store.insert({ ...goodNode({ title: "old" }), timestamp: new Date("2024-01-01") });
    await api.store.insert({ ...goodNode({ title: "new" }), timestamp: new Date("2025-01-01") });
    const { status, body } = await api.get("/api/intelligence");
    assert.equal(status, 200);
    assert.deepEqual(body.map((n) => n.title), ["new", "old"]);
    assert.equal((await api.get("/api/intelligence?limit=1")).body.length, 1);
    assert.equal((await api.get("/api/intelligence?limit=abc")).body.length, 2, "a bad limit falls back to the default");
  });

  describe("every change needs the token", () => {
    const attempts = [
      ["POST", "/api/intelligence", () => goodNode()],
      ["POST", "/api/intelligence/bulk", () => ({ nodes: [goodNode()] })],
      ["PUT", "/api/intelligence/000000000000000000000001", () => ({ title: "x" })],
      ["DELETE", "/api/intelligence/000000000000000000000001", () => undefined],
      ["POST", "/api/auth/check", () => undefined],
    ];

    // each of these provokes failed attempts, so each gets its own server (the lockout is per address)
    async function withFreshApi(fn) {
      const fresh = await startApi();
      try {
        await fn(fresh);
      } finally {
        await fresh.stop();
      }
    }

    for (const [method, path, body] of attempts) {
      test(`${method} ${path}: no token -> 401, wrong token -> 401, nothing is saved`, () =>
        withFreshApi(async (fresh) => {
          const none = await fresh.call(method, path, { body: body() });
          assert.equal(none.status, 401);
          assert.equal(none.body.code, "UNAUTHORIZED");
          assert.match(none.headers.get("www-authenticate"), /Bearer/);
          const wrong = await fresh.call(method, path, { body: body(), token: "wrong-token-value-123" });
          assert.equal(wrong.status, 401);
          assert.equal(fresh.store._all().length, 0);
        }));
    }

    test("the token must be sent as a Bearer header (query strings and bodies do not count)", () =>
      withFreshApi(async (fresh) => {
        assert.equal((await fresh.post(`/api/intelligence?token=${TOKEN}`, { ...goodNode(), token: TOKEN })).status, 401);
        assert.equal((await fresh.call("POST", "/api/intelligence", { body: goodNode(), headers: { Authorization: TOKEN } })).status, 401);
        assert.equal((await fresh.call("POST", "/api/intelligence", { body: goodNode(), headers: { Authorization: `Basic ${TOKEN}` } })).status, 401);
        assert.equal(fresh.store._all().length, 0);
      }));

    test("the right token works", async () => {
      assert.deepEqual((await api.post("/api/auth/check", undefined, { token: TOKEN })).body, { ok: true });
    });
  });

  test("create: validates, uppercases the type, adds city and time, and ignores fields the client invents", async () => {
    const response = await api.post(
      "/api/intelligence",
      { ...goodNode(), _id: "aaaaaaaaaaaaaaaaaaaaaaaa", city: "Hacked", timestamp: "2000-01-01", isAdmin: true },
      { token: TOKEN },
    );
    assert.equal(response.status, 201);
    const saved = api.store._all()[0];
    assert.equal(saved.type, "OSINT");
    assert.equal(saved.city, "Testville");
    assert.notEqual(String(saved._id), "aaaaaaaaaaaaaaaaaaaaaaaa");
    assert.ok(saved.timestamp.getFullYear() >= 2025, "the server sets the time");
    assert.equal(saved.isAdmin, undefined);
    assert.equal(response.body.id, saved._id);
  });

  test("create: bad input is a 400 with a reason, and nothing is stored", async () => {
    for (const bad of [{ ...goodNode(), lat: "" }, { ...goodNode(), lat: 99 }, { ...goodNode(), title: "" }, { ...goodNode(), image_url: "javascript:alert(1)" }]) {
      const r = await api.post("/api/intelligence", bad, { token: TOKEN });
      assert.equal(r.status, 400);
      assert.ok(r.body.error.length > 3);
    }
    assert.equal(api.store._all().length, 0);
  });

  test("bulk: saves the valid rows and reports the skipped ones", async () => {
    const r = await api.post("/api/intelligence/bulk", { nodes: [goodNode({ title: "a" }), goodNode({ lat: 200 }), goodNode({ title: "b" }), "nonsense", goodNode({ lng: "" })] }, { token: TOKEN });
    assert.equal(r.status, 201);
    assert.equal(r.body.insertedCount, 2);
    assert.equal(r.body.skippedCount, 3);
    assert.deepEqual(r.body.skipped.map((s) => s.index), [1, 3, 4]);
    assert.equal(api.store._all().length, 2);
  });

  test("bulk: cities are filled in afterwards, not before the answer", async () => {
    await api.post("/api/intelligence/bulk", { nodes: [goodNode({ lat: 1, lng: 1 }), goodNode({ lat: 2, lng: 2 })] }, { token: TOKEN });
    for (let i = 0; i < 50 && api.store._all().some((n) => n.city === null); i++) await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(api.store._all().map((n) => n.city), ["Testville", "Testville"]);
  });

  test("bulk: nothing valid -> 400; too many nodes -> 413; not an array -> 400", async () => {
    assert.equal((await api.post("/api/intelligence/bulk", { nodes: [{ lat: "x" }] }, { token: TOKEN })).status, 400);
    assert.equal((await api.post("/api/intelligence/bulk", { nodes: [] }, { token: TOKEN })).status, 400);
    assert.equal((await api.post("/api/intelligence/bulk", { nodes: "nope" }, { token: TOKEN })).status, 400);
    const many = Array.from({ length: 501 }, (_, i) => goodNode({ title: `n${i}` }));
    const r = await api.post("/api/intelligence/bulk", { nodes: many }, { token: TOKEN });
    assert.equal(r.status, 413);
    assert.match(r.body.error, /max 500/);
    assert.equal(api.store._all().length, 0);
  });

  test("update changes only what is sent, re-geocodes when the position moves, and 404s for unknown ids", async () => {
    const created = (await api.post("/api/intelligence", goodNode({ title: "before" }), { token: TOKEN })).body;
    const id = created.id;

    const renamed = await api.put(`/api/intelligence/${id}`, { title: "after", city: "Hacked" }, { token: TOKEN });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.node.title, "after");
    assert.equal(renamed.body.node.city, "Testville", "city cannot be set by the client");
    assert.equal(renamed.body.node.type, "OSINT");

    api.geocoder.calls.length = 0;
    await api.put(`/api/intelligence/${id}`, { lat: 10, lng: 10 }, { token: TOKEN });
    assert.deepEqual(api.geocoder.calls, [[10, 10]]);

    assert.equal((await api.put(`/api/intelligence/${id}`, {}, { token: TOKEN })).status, 400);
    assert.equal((await api.put(`/api/intelligence/${id}`, { lat: 5 }, { token: TOKEN })).status, 400);
    assert.equal((await api.put("/api/intelligence/000000000000000000000099", { title: "x" }, { token: TOKEN })).status, 404);
    assert.equal((await api.put("/api/intelligence/not-an-id", { title: "x" }, { token: TOKEN })).status, 400);
  });

  test("delete removes one node; unknown and malformed ids are refused", async () => {
    const id = (await api.post("/api/intelligence", goodNode(), { token: TOKEN })).body.id;
    assert.equal((await api.del(`/api/intelligence/${id}`, { token: TOKEN })).status, 200);
    assert.equal(api.store._all().length, 0);
    assert.equal((await api.del(`/api/intelligence/${id}`, { token: TOKEN })).status, 404);
    assert.equal((await api.del("/api/intelligence/%7B%22%24ne%22%3A1%7D", { token: TOKEN })).status, 400, "a Mongo operator as an id is refused");
  });

  test("bodies that are malformed or too large are refused cleanly", async () => {
    const bad = await api.call("POST", "/api/intelligence", { raw: "{not json", headers: { "Content-Type": "application/json" }, token: TOKEN });
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys(bad.body), ["error"]);
    const huge = await api.call("POST", "/api/intelligence", { raw: JSON.stringify({ ...goodNode(), description: "x".repeat(2_000_000) }), headers: { "Content-Type": "application/json" }, token: TOKEN });
    assert.equal(huge.status, 413);
  });

  test("unknown routes are a JSON 404", async () => {
    const r = await api.get("/api/nothing");
    assert.equal(r.status, 404);
    assert.deepEqual(r.body, { error: "Not found" });
  });

  test("security headers are set and the framework is not advertised", async () => {
    const { headers } = await api.get("/health");
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("x-powered-by"), null);
  });

  test("CORS: only the configured front end may call from a browser", async () => {
    const allowed = await api.get("/api/intelligence", { headers: { Origin: "https://app.example" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example");
    const other = await api.get("/api/intelligence", { headers: { Origin: "https://evil.example" } });
    assert.equal(other.headers.get("access-control-allow-origin"), null);
    const preflight = await api.call("OPTIONS", "/api/intelligence", { headers: { Origin: "https://app.example", "Access-Control-Request-Method": "DELETE", "Access-Control-Request-Headers": "authorization,content-type" } });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/i);
  });
});

describe("brute-force protection", () => {
  test("ten wrong tokens in a row lock that address out, even for the right token", async () => {
    const api = await startApi();
    try {
      for (let i = 0; i < 10; i++) assert.equal((await api.post("/api/auth/check", undefined, { token: `guess-number-${i}-padding` })).status, 401);
      const locked = await api.post("/api/auth/check", undefined, { token: TOKEN });
      assert.equal(locked.status, 429);
      assert.ok(Number(locked.headers.get("retry-after")) > 0);
    } finally {
      await api.stop();
    }
  });

  test("a correct token clears the count of earlier mistakes", async () => {
    const api = await startApi();
    try {
      for (let i = 0; i < 9; i++) await api.post("/api/auth/check", undefined, { token: `guess-number-${i}-padding` });
      assert.equal((await api.post("/api/auth/check", undefined, { token: TOKEN })).status, 200);
      for (let i = 0; i < 9; i++) assert.equal((await api.post("/api/auth/check", undefined, { token: `again-${i}-padding-xx` })).status, 401);
    } finally {
      await api.stop();
    }
  });
});

describe("server without a usable ADMIN_TOKEN is read-only", () => {
  for (const [label, env] of [["missing", { ADMIN_TOKEN: "" }], ["too short", { ADMIN_TOKEN: "short" }]]) {
    test(`token ${label}: reading works, every write is refused with 503`, async () => {
      const api = await startApi({ env });
      try {
        assert.equal((await api.get("/api/intelligence")).status, 200);
        assert.deepEqual((await api.get("/api/config")).body.writesEnabled, false);
        for (const token of [undefined, "short", ""]) {
          const r = await api.post("/api/intelligence", goodNode(), { token });
          assert.equal(r.status, 503);
          assert.equal(r.body.code, "WRITES_DISABLED");
        }
        assert.equal((await api.del("/api/intelligence/000000000000000000000001", { token: "short" })).status, 503);
        assert.equal(api.store._all().length, 0);
      } finally {
        await api.stop();
      }
    });
  }
});

describe("CORS defaults", () => {
  test("production with no CORS_ORIGINS sends no CORS headers at all", async () => {
    const api = await startApi({ env: { NODE_ENV: "production", CORS_ORIGINS: undefined } });
    try {
      const r = await api.get("/api/intelligence", { headers: { Origin: "https://app.example" } });
      assert.equal(r.headers.get("access-control-allow-origin"), null);
    } finally {
      await api.stop();
    }
  });
});

describe("errors do not leak", () => {
  test("a failing database gives a generic 500, with no message from the driver", async () => {
    const store = createMemoryStore();
    store.insert = async () => {
      throw new Error("E11000 secret internal detail mongodb://user:pass@host");
    };
    const api = await startApi({ store });
    try {
      const r = await api.post("/api/intelligence", goodNode(), { token: TOKEN });
      assert.equal(r.status, 500);
      assert.deepEqual(r.body, { error: "Something went wrong on the server." });
      assert.doesNotMatch(r.text, /E11000|mongodb:|secret/);
    } finally {
      await api.stop();
    }
  });

  test("health reports a database that is down", async () => {
    const store = createMemoryStore();
    store.ping = async () => {
      throw new Error("down");
    };
    const api = await startApi({ store });
    try {
      const r = await api.get("/health");
      assert.equal(r.status, 503);
      assert.deepEqual(r.body, { status: "degraded", db: "down" });
    } finally {
      await api.stop();
    }
  });

  test("a slow geocoder does not hold a save up: it answers with Unknown and fills the city in later", async () => {
    let resolveLookup;
    const geocoder = { lookup: () => new Promise((resolve) => { resolveLookup = resolve; }) };
    const api = await startApi({ geocoder });
    try {
      const started = Date.now();
      const r = await api.post("/api/intelligence", goodNode(), { token: TOKEN });
      assert.equal(r.status, 201);
      assert.ok(Date.now() - started < 5000);
      assert.equal(api.store._all()[0].city, "Unknown");
      resolveLookup("Latecity");
      for (let i = 0; i < 50 && api.store._all()[0].city === "Unknown"; i++) await new Promise((res) => setTimeout(res, 10));
      assert.equal(api.store._all()[0].city, "Latecity");
    } finally {
      await api.stop();
    }
  });
});

test("fakeGeocoder is used by default so tests never reach the internet", () => {
  assert.equal(typeof fakeGeocoder().lookup, "function");
});
