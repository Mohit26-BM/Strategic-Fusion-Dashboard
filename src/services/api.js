import { clearToken, getToken } from "./auth";

// Where the API lives. On Render set REACT_APP_API_URL (for example https://your-api.onrender.com/api) when the
// front end is built. Without it: the local backend while developing, and the same site ("/api") in production.
const API_URL = (
  process.env.REACT_APP_API_URL ||
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:5000/api")
).replace(/\/+$/, "");

// A free Render server sleeps when idle and needs up to a minute to wake, so be patient before giving up.
const TIMEOUT_MS = 60_000;

export class ApiError extends Error {
  constructor(message, { status = 0, code = "", data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** An AbortSignal that fires after `ms` (AbortSignal.timeout is missing in older browsers). */
function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function request(path, { method = "GET", body, token, fallback = "The request failed" } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const bearer = token ?? getToken();
  if (method !== "GET" && bearer) headers.Authorization = `Bearer ${bearer}`;

  const timeout = timeoutSignal(TIMEOUT_MS);
  let response;
  let payload;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    });
    payload = await response.json().catch(() => ({}));
  } catch (err) {
    const timedOut = err?.name === "AbortError";
    throw new ApiError(
      timedOut
        ? "The server took too long to answer. If it is on a free plan it may still be waking up. Try again in a minute."
        : "Cannot reach the server. Check your connection, or try again in a minute if the server is waking up.",
      { code: timedOut ? "TIMEOUT" : "NETWORK" },
    );
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    const code = payload.code || (response.status === 401 ? "UNAUTHORIZED" : response.status === 429 ? "RATE_LIMITED" : "");
    // a rejected token is useless from now on, so forget it; the app then asks again
    if (code === "UNAUTHORIZED" && token === undefined) clearToken();
    throw new ApiError(payload.error || `${fallback} (HTTP ${response.status}).`, { status: response.status, code, data: payload });
  }

  return payload;
}

export const fetchConfig = () => request("/config", { fallback: "Failed to read the server settings" });

export const fetchIntelligence = () => request("/intelligence", { fallback: "Failed to load intelligence nodes" });

/** Checks a token without changing anything. Resolves when it is right, rejects with an ApiError when it is not. */
export const checkToken = (token) => request("/auth/check", { method: "POST", token, fallback: "Could not check the token" });

export const addIntelligence = (data) => request("/intelligence", { method: "POST", body: data, fallback: "Failed to add intelligence node" });

export const bulkAddIntelligence = (nodes) => request("/intelligence/bulk", { method: "POST", body: { nodes }, fallback: "Failed to import" });

export const updateIntelligence = (id, data) =>
  request(`/intelligence/${encodeURIComponent(id)}`, { method: "PUT", body: data, fallback: "Failed to update intelligence node" });

export const deleteIntelligence = (id) =>
  request(`/intelligence/${encodeURIComponent(id)}`, { method: "DELETE", fallback: "Failed to delete intelligence node" });

/**
 * Sends many nodes in batches (the server accepts at most `batchSize` per request).
 * @returns {Promise<{ inserted: number, skipped: number, failedBatches: number, firstError: string }>}
 */
export async function bulkAddInBatches(nodes, { batchSize = 200, onProgress = () => {} } = {}) {
  let inserted = 0;
  let skipped = 0;
  let failedBatches = 0;
  let firstError = "";

  for (let start = 0; start < nodes.length; start += batchSize) {
    const batch = nodes.slice(start, start + batchSize);
    onProgress(Math.min(start, nodes.length), nodes.length);
    try {
      const result = await bulkAddIntelligence(batch);
      inserted += result.insertedCount || 0;
      skipped += result.skippedCount || 0;
    } catch (err) {
      // a rejected token or a server that is down will fail every batch: stop instead of repeating the failure
      if (err.code === "UNAUTHORIZED" || err.code === "WRITES_DISABLED" || err.code === "NETWORK" || err.code === "TIMEOUT" || err.code === "TOO_MANY_ATTEMPTS") throw err;
      failedBatches++;
      skipped += batch.length;
      if (!firstError) firstError = err.message;
    }
  }
  onProgress(nodes.length, nodes.length);
  return { inserted, skipped, failedBatches, firstError };
}
