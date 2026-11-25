// Reverse geocoding (coordinates -> city) with OpenStreetMap Nominatim, used politely:
//  - one request at a time, at most one per ~1.1 s (their usage policy allows 1 per second)
//  - results are cached (rounded to ~1 km), so repeated places cost nothing
//  - a request that fails or takes too long gives null; it never breaks an import
function createGeocoder({
  enabled = true,
  userAgent = "StrategicFusionDashboard",
  fetchImpl = globalThis.fetch,
  minIntervalMs = 1100,
  timeoutMs = 5000,
  cacheSize = 2000,
  maxQueue = 2000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
} = {}) {
  const cache = new Map();
  let tail = Promise.resolve();
  let lastStart = 0;
  let pending = 0;

  const keyOf = (lat, lng) => `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;

  function remember(key, city) {
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value); // drop the oldest
    cache.set(key, city);
  }

  async function fetchCity(lat, lng) {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "json", zoom: "10" }).toString();
    const response = await fetchImpl(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const a = body?.address || {};
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state || null;
    return city ? String(city).slice(0, 100) : null;
  }

  /** @returns {Promise<string|null>} the place name, or null when it could not be found */
  function lookup(lat, lng) {
    if (!enabled) return Promise.resolve(null);
    const key = keyOf(lat, lng);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending >= maxQueue) return Promise.resolve(null);

    pending++;
    const job = tail.then(async () => {
      // the same place may have been looked up while this job was waiting
      if (cache.has(key)) return cache.get(key);
      const wait = lastStart + minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastStart = now();
      try {
        const city = await fetchCity(lat, lng);
        if (city) remember(key, city);
        return city;
      } catch {
        return null;
      }
    });
    tail = job.then(() => undefined, () => undefined);
    return job.finally(() => {
      pending--;
    });
  }

  return { lookup, get queueLength() { return pending; } };
}

/** Wait for `promise`, but give up after `ms` and return `fallback`. */
function withTimeout(promise, ms, fallback = null) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { createGeocoder, withTimeout };
