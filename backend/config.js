// All settings come from environment variables (see backend/.env.example). Nothing secret has a default.
function parseTrustProxy(value, isProd) {
  if (value === undefined || value === "") return isProd ? 1 : false;
  if (value === "true") return true;
  if (value === "false") return false;
  const n = Number(value);
  return Number.isInteger(n) ? n : value;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isProd = nodeEnv === "production";

  const mongoUri = env.MONGO_URI || (isProd ? "" : "mongodb://localhost:27017");
  if (!mongoUri) {
    throw new Error("MONGO_URI is required in production.");
  }

  const dbName = env.MONGO_DB || "intel_db";
  if (!/^[A-Za-z0-9_-]{1,38}$/.test(dbName)) {
    throw new Error(`MONGO_DB "${String(dbName).slice(0, 40)}" is not a valid database name (letters, digits, '_' and '-' only, max 38). A stray system environment variable called MONGO_DB can cause this.`);
  }

  const adminToken = env.ADMIN_TOKEN || "";
  const corsOrigins = env.CORS_ORIGINS !== undefined ? parseList(env.CORS_ORIGINS) : isProd ? [] : ["http://localhost:3000"];

  return {
    nodeEnv,
    isProd,
    port: Number(env.PORT || 5000),
    mongoUri,
    dbName,
    // Writes (add, import, edit, delete) need this token. A short or missing token disables writes completely.
    adminToken,
    writesEnabled: adminToken.length >= 16,
    corsOrigins,
    trustProxy: parseTrustProxy(env.TRUST_PROXY, isProd),
    geocoding: {
      enabled: env.GEOCODING !== "off",
      // Nominatim's usage policy asks for an identifying User-Agent.
      userAgent:
        env.GEOCODER_USER_AGENT ||
        "StrategicFusionDashboard/1.1 (+https://github.com/Mohit26-BM/Strategic-Fusion-Dashboard)",
    },
    limits: {
      listMax: 5000,
      bulkMax: 500,
      singleBodyBytes: "1mb",
      bulkBodyBytes: "5mb",
    },
  };
}

module.exports = { loadConfig };
