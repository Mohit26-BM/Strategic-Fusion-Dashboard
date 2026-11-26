const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createGeocoder, withTimeout } = require("../geocoder");

function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return { ok: next !== "http-error", json: async () => next };
  };
  fn.calls = calls;
  return fn;
}

const instant = { sleep: async () => {}, minIntervalMs: 0 };

test("returns the city, falling back through town, village and state", async () => {
  const f = fakeFetch([{ address: { city: "Delhi" } }, { address: { town: "Smallton" } }, { address: { state: "Kerala" } }, { address: {} }]);
  const g = createGeocoder({ fetchImpl: f, ...instant });
  assert.equal(await g.lookup(1, 1), "Delhi");
  assert.equal(await g.lookup(2, 2), "Smallton");
  assert.equal(await g.lookup(3, 3), "Kerala");
  assert.equal(await g.lookup(4, 4), null);
});

test("caches by place (about 1 km), so the same area is looked up once", async () => {
  const f = fakeFetch([{ address: { city: "Delhi" } }]);
  const g = createGeocoder({ fetchImpl: f, ...instant });
  assert.equal(await g.lookup(28.6139, 77.209), "Delhi");
  assert.equal(await g.lookup(28.6141, 77.2091), "Delhi");
  assert.equal(f.calls.length, 1);
});

test("sends an identifying User-Agent, as the usage policy asks", async () => {
  const f = fakeFetch([{ address: { city: "X" } }]);
  await createGeocoder({ fetchImpl: f, userAgent: "MyApp/1.0 (me@example.org)", ...instant }).lookup(1, 1);
  assert.equal(f.calls[0].headers["User-Agent"], "MyApp/1.0 (me@example.org)");
});

test("failures and HTTP errors give null and are not cached", async () => {
  const f = fakeFetch([new Error("network down"), "http-error", { address: { city: "Back" } }]);
  const g = createGeocoder({ fetchImpl: f, ...instant });
  assert.equal(await g.lookup(5, 5), null);
  assert.equal(await g.lookup(5, 5), null);
  assert.equal(await g.lookup(5, 5), "Back");
});

test("requests are one at a time and at least minIntervalMs apart", async () => {
  let clock = 0;
  const starts = [];
  const f = async () => {
    starts.push(clock);
    return { ok: true, json: async () => ({ address: { city: "C" } }) };
  };
  const g = createGeocoder({
    fetchImpl: f,
    minIntervalMs: 1000,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  await Promise.all([g.lookup(10, 10), g.lookup(20, 20), g.lookup(30, 30), g.lookup(40, 40)]);
  assert.equal(starts.length, 4);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 1000, `gap ${i}: ${starts[i] - starts[i - 1]}`);
});

test("can be switched off, and gives up on a flooded queue instead of growing forever", async () => {
  const off = createGeocoder({ enabled: false, fetchImpl: () => assert.fail("must not be called") });
  assert.equal(await off.lookup(1, 1), null);

  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const f = async () => {
    await gate;
    return { ok: true, json: async () => ({ address: { city: "C" } }) };
  };
  const g = createGeocoder({ fetchImpl: f, maxQueue: 2, ...instant });
  const a = g.lookup(1, 1);
  const b = g.lookup(2, 2);
  assert.equal(await g.lookup(3, 3), null, "third request is refused straight away");
  release();
  assert.equal(await a, "C");
  assert.equal(await b, "C");
});

test("withTimeout returns the fallback when the promise is too slow", async () => {
  assert.equal(await withTimeout(new Promise(() => {}), 20, "late"), "late");
  assert.equal(await withTimeout(Promise.resolve("fast"), 1000, "late"), "fast");
});
