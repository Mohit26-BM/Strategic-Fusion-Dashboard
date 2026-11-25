// Entry point: `npm start`. All behaviour lives in app.js; this file only wires it to MongoDB and a port.
const { MongoClient } = require("mongodb");
const { loadDotEnv } = require("./env");
const { loadConfig } = require("./config");
const { createMongoStore } = require("./store");
const { createGeocoder } = require("./geocoder");
const { createApp } = require("./app");

async function main(env = process.env) {
  const config = loadConfig(env);

  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log(`Connecting to MongoDB (database "${config.dbName}")...`);
  await client.connect();

  const store = createMongoStore(client.db(config.dbName));
  await store.ensureIndexes();

  const geocoder = createGeocoder(config.geocoding);
  const app = createApp({ store, geocoder, config });

  const server = app.listen(config.port, () => {
    console.log(`API listening on port ${config.port} (${config.nodeEnv})`);
    if (!config.writesEnabled) {
      console.warn("ADMIN_TOKEN is missing or shorter than 16 characters: the API is READ-ONLY (adding, importing, editing and deleting are refused).");
    }
    if (config.isProd && config.corsOrigins.length === 0) {
      console.warn("CORS_ORIGINS is empty: browsers on another address (such as a separate static site) cannot call this API.");
    }
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(() => client.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return { server, client, config };
}

if (require.main === module) {
  loadDotEnv(); // only when started directly (npm start), never from dev:memdb or tests
  main().catch((err) => {
    console.error("Startup failed:", err.message);
    process.exit(1);
  });
}

module.exports = { main };
