const crypto = require("node:crypto");

const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 10;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

/** Constant-time comparison (both sides are hashed first, so the lengths always match). */
function tokensMatch(given, expected) {
  return crypto.timingSafeEqual(sha256(given), sha256(expected));
}

/**
 * Middleware that lets a request through only when it carries `Authorization: Bearer <ADMIN_TOKEN>`.
 *  - no token configured on the server  -> 503 (writes are switched off, nothing is guessable)
 *  - wrong or missing token              -> 401
 *  - too many wrong tokens from one address in 10 minutes -> 429
 */
function createAdminGuard({ adminToken, writesEnabled }, { now = Date.now } = {}) {
  const failures = new Map(); // ip -> { count, start }

  function recordFailure(ip) {
    const t = now();
    const entry = failures.get(ip);
    if (!entry || t - entry.start > FAILURE_WINDOW_MS) failures.set(ip, { count: 1, start: t });
    else entry.count++;
  }

  return function requireAdmin(req, res, next) {
    if (!writesEnabled) {
      return res.status(503).json({
        error: "Editing is turned off on this server (ADMIN_TOKEN is not configured).",
        code: "WRITES_DISABLED",
      });
    }

    const ip = req.ip || "unknown";
    const entry = failures.get(ip);
    if (entry && now() - entry.start <= FAILURE_WINDOW_MS && entry.count >= MAX_FAILURES) {
      res.set("Retry-After", String(Math.ceil((entry.start + FAILURE_WINDOW_MS - now()) / 1000)));
      return res.status(429).json({ error: "Too many wrong tokens. Try again in a few minutes.", code: "TOO_MANY_ATTEMPTS" });
    }

    const header = req.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || !tokensMatch(match[1].trim(), adminToken)) {
      recordFailure(ip);
      res.set("WWW-Authenticate", 'Bearer realm="Strategic Fusion"');
      return res.status(401).json({ error: "Invalid or missing access token.", code: "UNAUTHORIZED" });
    }

    failures.delete(ip);
    next();
  };
}

module.exports = { createAdminGuard, tokensMatch };
