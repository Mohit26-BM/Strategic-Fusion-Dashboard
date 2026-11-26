const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { validateNode } = require("./validation");
const { createAdminGuard } = require("./auth");
const { withTimeout } = require("./geocoder");

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const GEOCODE_WAIT_MS = 3000; // how long a single save waits for the city before answering
const TIMED_OUT = Symbol("timed out");

/**
 * @param {object} deps
 * @param {object} deps.store      data layer (see store.js)
 * @param {object} deps.geocoder   { lookup(lat, lng) -> Promise<string|null> }
 * @param {object} deps.config     see config.js
 * @param {object} [deps.logger]
 */
function createApp({ store, geocoder, config, logger = console }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  // Only the front end's own address may call the API from a browser (CORS_ORIGINS). No list = same origin only.
  if (config.corsOrigins.length) {
    const allowed = new Set(config.corsOrigins);
    app.use(
      cors({
        origin: (origin, done) => done(null, !origin || allowed.has(origin)),
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 600,
      }),
    );
  }

  // the bulk route may carry many nodes, so it gets a bigger body limit; everything else stays small
  app.use("/api/intelligence/bulk", express.json({ limit: config.limits.bulkBodyBytes }));
  app.use(express.json({ limit: config.limits.singleBodyBytes }));

  app.use("/api", rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many requests, slow down for a moment." } }));
  const writeLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many changes in a minute, slow down." } });
  const requireAdmin = createAdminGuard(config);

  // ---- city lookups that must not hold a response up --------------------------------------------------------
  function fillCityLater(id, lookupPromise) {
    lookupPromise
      .then((city) => (city ? store.setCity(id, city) : null))
      .catch((err) => logger.error("City update failed:", err.message));
  }

  async function cityFor(lat, lng) {
    const lookup = geocoder.lookup(lat, lng);
    const result = await withTimeout(lookup, GEOCODE_WAIT_MS, TIMED_OUT);
    const timedOut = result === TIMED_OUT;
    return { city: timedOut ? null : result, lookup, timedOut };
  }

  // ---- public routes --------------------------------------------------------------------------------------------
  app.get("/", (req, res) => {
    res.send("API running");
  });

  app.get("/health", async (req, res) => {
    try {
      await store.ping();
      res.json({ status: "ok", db: "up" });
    } catch {
      res.status(503).json({ status: "degraded", db: "down" });
    }
  });

  // lets the front end know whether editing is possible at all, and the limits it should respect
  app.get("/api/config", (req, res) => {
    res.json({ writesEnabled: config.writesEnabled, bulkMax: config.limits.bulkMax });
  });

  app.get("/api/intelligence", async (req, res) => {
    const asked = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, config.limits.listMax) : config.limits.listMax;
    res.json(await store.list({ limit }));
  });

  // ---- protected routes (need the admin token) ---------------------------------------------------------------------
  // used by the front end to check a token when someone unlocks editing; it changes nothing
  app.post("/api/auth/check", requireAdmin, (req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/intelligence", writeLimiter, requireAdmin, async (req, res) => {
    const { errors, value } = validateNode(req.body);
    if (errors.length) throw new HttpError(400, errors.join("; "), { errors });

    const { city, lookup, timedOut } = await cityFor(value.lat, value.lng);
    const saved = await store.insert({ ...value, city: city || "Unknown", timestamp: new Date() });
    if (timedOut) fillCityLater(saved._id, lookup);

    res.status(201).json({ success: true, id: saved._id, node: saved });
  });

  app.post("/api/intelligence/bulk", writeLimiter, requireAdmin, async (req, res) => {
    const nodes = req.body?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) throw new HttpError(400, "nodes must be a non-empty array");
    if (nodes.length > config.limits.bulkMax) {
      throw new HttpError(413, `Too many nodes in one request (max ${config.limits.bulkMax}). Send them in smaller batches.`);
    }

    const valid = [];
    const skipped = [];
    nodes.forEach((node, index) => {
      const { errors, value } = validateNode(node);
      if (errors.length) skipped.push({ index, error: errors[0] });
      else valid.push({ ...value, city: null, timestamp: new Date() });
    });

    if (valid.length === 0) {
      throw new HttpError(400, "No valid nodes", { skippedCount: skipped.length, skipped: skipped.slice(0, 20) });
    }

    const inserted = await store.insertMany(valid);
    res.status(201).json({
      success: true,
      insertedCount: inserted.length,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 20),
    });

    // cities are filled in afterwards, one polite request at a time, so a big import never makes the user wait
    (async () => {
      for (const doc of inserted) {
        try {
          const city = await geocoder.lookup(doc.lat, doc.lng);
          await store.setCity(doc._id, city || "Unknown");
        } catch (err) {
          logger.error("City update failed:", err.message);
        }
      }
    })();
  });

  app.put("/api/intelligence/:id", writeLimiter, requireAdmin, async (req, res) => {
    if (!store.isValidId(req.params.id)) throw new HttpError(400, "Invalid node id");

    const { errors, value } = validateNode(req.body, { partial: true });
    if (errors.length) throw new HttpError(400, errors.join("; "), { errors });
    if (Object.keys(value).length === 0) throw new HttpError(400, "No valid fields to update");

    let lookup = null;
    let timedOut = false;
    if (value.lat !== undefined) {
      const result = await cityFor(value.lat, value.lng);
      value.city = result.city || "Unknown";
      lookup = result.lookup;
      timedOut = result.timedOut;
    }
    value.updatedAt = new Date();

    const node = await store.update(req.params.id, value);
    if (!node) throw new HttpError(404, "Node not found");
    if (timedOut) fillCityLater(req.params.id, lookup);

    res.json({ success: true, node });
  });

  app.delete("/api/intelligence/:id", writeLimiter, requireAdmin, async (req, res) => {
    if (!store.isValidId(req.params.id)) throw new HttpError(400, "Invalid node id");
    const removed = await store.remove(req.params.id);
    if (!removed) throw new HttpError(404, "Node not found");
    res.json({ success: true, deletedId: req.params.id });
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "The request is too large." });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "The request body is not valid JSON." });
    // anything else is our bug: log it here, tell the client nothing about it
    logger.error("Unhandled error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  return app;
}

module.exports = { createApp, HttpError };
