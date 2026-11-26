const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../config");

const base = { MONGO_URI: "mongodb://x" };

test("development defaults are safe: local Mongo, localhost front end only, writes off without a token", () => {
  const c = loadConfig({});
  assert.equal(c.mongoUri, "mongodb://localhost:27017");
  assert.deepEqual(c.corsOrigins, ["http://localhost:3000"]);
  assert.equal(c.writesEnabled, false);
  assert.equal(c.port, 5000);
  assert.equal(c.trustProxy, false);
});

test("production refuses to start without MONGO_URI and has no CORS origins unless set", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }), /MONGO_URI is required/);
  const c = loadConfig({ NODE_ENV: "production", MONGO_URI: "mongodb://x" });
  assert.deepEqual(c.corsOrigins, []);
  assert.equal(c.trustProxy, 1, "behind Render's proxy, so the real client address is used for rate limits");
});

test("ADMIN_TOKEN shorter than 16 characters does not enable writes", () => {
  assert.equal(loadConfig({ ...base, ADMIN_TOKEN: "x".repeat(15) }).writesEnabled, false);
  assert.equal(loadConfig({ ...base, ADMIN_TOKEN: "x".repeat(16) }).writesEnabled, true);
});

test("CORS_ORIGINS is a comma list, trimmed, without trailing slashes", () => {
  const c = loadConfig({ ...base, CORS_ORIGINS: " https://a.example/ ,https://b.example,, " });
  assert.deepEqual(c.corsOrigins, ["https://a.example", "https://b.example"]);
  assert.deepEqual(loadConfig({ ...base, CORS_ORIGINS: "" }).corsOrigins, []);
});

test("MONGO_DB must be a plain name (the old '.' mistake is caught)", () => {
  assert.throws(() => loadConfig({ ...base, MONGO_DB: "intel.db" }), /MONGO_DB/);
  assert.throws(() => loadConfig({ ...base, MONGO_DB: "a b" }), /MONGO_DB/);
  assert.equal(loadConfig({ ...base, MONGO_DB: "intel_db-2" }).dbName, "intel_db-2");
});

test("geocoding can be turned off", () => {
  assert.equal(loadConfig({ ...base, GEOCODING: "off" }).geocoding.enabled, false);
  assert.equal(loadConfig(base).geocoding.enabled, true);
  assert.match(loadConfig(base).geocoding.userAgent, /StrategicFusionDashboard/);
});
