const { createApp } = require("../app");
const { createMemoryStore } = require("../store");
const { loadConfig } = require("../config");

const TOKEN = "test-token-0123456789";

function fakeGeocoder(map = {}) {
  const calls = [];
  return {
    calls,
    lookup: async (lat, lng) => {
      calls.push([lat, lng]);
      return map[`${lat},${lng}`] ?? "Testville";
    },
  };
}

const quietLogger = { error() {}, warn() {}, log() {} };

/** Starts the API on a random port. Returns a tiny HTTP client plus the parts, and stop(). */
async function startApi({ env = {}, store = createMemoryStore(), geocoder = fakeGeocoder() } = {}) {
  const config = loadConfig({ NODE_ENV: "test", MONGO_URI: "mongodb://x", ADMIN_TOKEN: TOKEN, CORS_ORIGINS: "https://app.example", ...env });
  const app = createApp({ store, geocoder, config, logger: quietLogger });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, { body, token, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (body !== undefined && !raw) h["Content-Type"] = "application/json";
    if (token) h.Authorization = `Bearer ${token}`;
    const response = await fetch(base + path, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: response.status, body: json, text, headers: response.headers };
  }

  return {
    base,
    config,
    store,
    geocoder,
    get: (path, o) => call("GET", path, o),
    post: (path, body, o) => call("POST", path, { body, ...o }),
    put: (path, body, o) => call("PUT", path, { body, ...o }),
    del: (path, o) => call("DELETE", path, o),
    call,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

const goodNode = (over = {}) => ({ lat: 28.6139, lng: 77.209, type: "osint", title: "Delhi relay", description: "d", ...over });

module.exports = { startApi, fakeGeocoder, goodNode, TOKEN, quietLogger };
