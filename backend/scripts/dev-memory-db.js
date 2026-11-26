// `npm run dev:memdb`: runs the API on a throw-away in-memory MongoDB, so you can try the whole dashboard without
// installing MongoDB or touching a real database. Everything is lost when you stop it.
//
// This script never reads backend/.env, and it forces its own database settings, so it cannot reach a real database
// even if backend/.env or the system environment has MONGO_URI / MONGO_DB set.
process.env.NODE_ENV = process.env.NODE_ENV || "development";

const { MongoMemoryServer } = require("mongodb-memory-server");

(async () => {
  const mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.MONGO_DB = "intel_dev";
  process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-token-1234567890";
  process.env.GEOCODING = process.env.GEOCODING || "off"; // no outside requests while experimenting

  console.log("In-memory MongoDB ready.");
  console.log(`Admin token for this session: ${process.env.ADMIN_TOKEN}`);

  const { main } = require("../server");
  await main();

  const stop = async () => {
    await mongod.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
})().catch((err) => {
  console.error("Could not start:", err.message);
  process.exit(1);
});
