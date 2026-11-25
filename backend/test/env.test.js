const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadDotEnv } = require("../env");
const { loadConfig } = require("../config");

function envFile(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sfd-env-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, text);
  return file;
}

test("in development .env beats a stray system variable, and says so", () => {
  const env = { NODE_ENV: "development", MONGO_DB: "C:\\Program Files\\MongoDB\\Server\\8.0\\bin" }; // the real-world mistake
  const messages = [];
  const file = envFile("MONGO_DB=intel_db\nPORT=5000\n");
  const result = loadDotEnv({ env, file, log: (m) => messages.push(m) });
  assert.equal(env.MONGO_DB, "intel_db");
  assert.equal(env.PORT, "5000");
  assert.deepEqual(result.overridden, ["MONGO_DB"]);
  assert.match(messages[0], /replaced the system environment value of MONGO_DB/);
  assert.doesNotThrow(() => loadConfig({ ...env, MONGO_URI: "mongodb://x" }));
});

test("in production the real environment always wins over a file", () => {
  const env = { NODE_ENV: "production", MONGO_DB: "from_render" };
  loadDotEnv({ env, file: envFile("MONGO_DB=from_file\nEXTRA=1\n"), log: () => assert.fail("nothing should be overridden") });
  assert.equal(env.MONGO_DB, "from_render");
  assert.equal(env.EXTRA, "1", "variables that are not set yet are still filled from the file");
});

test("a missing .env file is fine", () => {
  const env = { NODE_ENV: "development" };
  const result = loadDotEnv({ env, file: path.join(os.tmpdir(), "does-not-exist", ".env"), log: () => {} });
  assert.equal(result.loaded, false);
  assert.deepEqual(env, { NODE_ENV: "development" });
});

test("the old stray value is now explained instead of failing mysteriously", () => {
  assert.throws(() => loadConfig({ MONGO_URI: "mongodb://x", MONGO_DB: "C:\\Program Files\\MongoDB\\Server\\8.0\\bin" }), /stray system environment variable/);
});
