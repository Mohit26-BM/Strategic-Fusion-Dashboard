import { ApiError, addIntelligence, bulkAddInBatches, checkToken, deleteIntelligence, fetchConfig, fetchIntelligence } from "./api";
import { getToken, setToken } from "./auth";

const reply = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => {
  window.sessionStorage.clear();
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("requests", () => {
  it("reading sends no token, even when one is stored", async () => {
    setToken("stored-secret-token");
    fetch.mockReturnValue(reply(200, []));
    await fetchIntelligence();
    expect(fetch.mock.calls[0][0]).toBe("http://localhost:5000/api/intelligence");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("every change sends the stored token as a Bearer header", async () => {
    setToken("stored-secret-token");
    fetch.mockReturnValue(reply(201, { success: true }));
    await addIntelligence({ lat: 1, lng: 2, type: "OSINT", title: "x" });
    const init = fetch.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer stored-secret-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("puts the id in the URL safely", async () => {
    fetch.mockReturnValue(reply(200, { success: true }));
    await deleteIntelligence("a/../b?x=1");
    expect(fetch.mock.calls[0][0]).toBe("http://localhost:5000/api/intelligence/a%2F..%2Fb%3Fx%3D1");
  });

  it("reads the public settings without a token", async () => {
    fetch.mockReturnValue(reply(200, { writesEnabled: true, bulkMax: 500 }));
    expect(await fetchConfig()).toEqual({ writesEnabled: true, bulkMax: 500 });
  });
});

describe("errors", () => {
  it("a rejected token throws UNAUTHORIZED and is forgotten", async () => {
    setToken("old-token-value-123");
    fetch.mockReturnValue(reply(401, { error: "Invalid or missing access token.", code: "UNAUTHORIZED" }));
    await expect(addIntelligence({})).rejects.toMatchObject({ name: "ApiError", status: 401, code: "UNAUTHORIZED" });
    expect(getToken()).toBe("");
  });

  it("checking a token that is wrong does NOT throw away the one already stored", async () => {
    setToken("good-token-value-123");
    fetch.mockReturnValue(reply(401, { error: "Invalid or missing access token.", code: "UNAUTHORIZED" }));
    await expect(checkToken("wrong-token-value")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(getToken()).toBe("good-token-value-123");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer wrong-token-value");
  });

  it("uses the server's message, and a plain one when there is none", async () => {
    fetch.mockReturnValueOnce(reply(400, { error: "lat must be between -90 and 90" }));
    await expect(addIntelligence({})).rejects.toThrow("lat must be between -90 and 90");
    fetch.mockReturnValueOnce(reply(502, {}));
    await expect(fetchIntelligence()).rejects.toThrow(/HTTP 502/);
  });

  it("knows the server's read-only and rate-limit answers", async () => {
    fetch.mockReturnValueOnce(reply(503, { error: "off", code: "WRITES_DISABLED" }));
    await expect(addIntelligence({})).rejects.toMatchObject({ code: "WRITES_DISABLED" });
    fetch.mockReturnValueOnce(reply(429, { error: "slow down" }));
    await expect(addIntelligence({})).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("a server that cannot be reached gives a helpful message, not 'Failed to fetch'", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await fetchIntelligence().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("NETWORK");
    expect(error.message).toMatch(/Cannot reach the server/);
    expect(error.message).toMatch(/waking up/);
  });

  it("gives up after a minute and says the server may be waking up", async () => {
    jest.useFakeTimers();
    fetch.mockImplementation(
      (url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    const pending = fetchIntelligence().catch((e) => e);
    jest.advanceTimersByTime(60_001);
    const error = await pending;
    expect(error.code).toBe("TIMEOUT");
    expect(error.message).toMatch(/too long/);
  });
});

describe("bulkAddInBatches", () => {
  const nodes = (n) => Array.from({ length: n }, (_, i) => ({ lat: 1, lng: 1, type: "OSINT", title: `n${i}` }));

  it("sends 200 at a time and adds the results up", async () => {
    fetch.mockImplementation((url, init) => {
      const sent = JSON.parse(init.body).nodes.length;
      return reply(201, { insertedCount: sent - 1, skippedCount: 1 });
    });
    const progress = jest.fn();
    const result = await bulkAddInBatches(nodes(450), { onProgress: progress });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.map((c) => JSON.parse(c[1].body).nodes.length)).toEqual([200, 200, 50]);
    expect(result).toEqual({ inserted: 447, skipped: 3, failedBatches: 0, firstError: "" });
    expect(progress.mock.calls[0]).toEqual([0, 450]);
    expect(progress.mock.calls.at(-1)).toEqual([450, 450]);
  });

  it("a rejected token stops at once instead of failing every batch", async () => {
    fetch.mockReturnValue(reply(401, { error: "no", code: "UNAUTHORIZED" }));
    await expect(bulkAddInBatches(nodes(450))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a server that goes away stops at once too", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(bulkAddInBatches(nodes(450))).rejects.toMatchObject({ code: "NETWORK" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("one bad batch is counted and the others still go through", async () => {
    fetch
      .mockReturnValueOnce(reply(201, { insertedCount: 200, skippedCount: 0 }))
      .mockReturnValueOnce(reply(400, { error: "No valid nodes" }))
      .mockReturnValueOnce(reply(201, { insertedCount: 50, skippedCount: 0 }));
    const result = await bulkAddInBatches(nodes(450));
    expect(result).toEqual({ inserted: 250, skipped: 200, failedBatches: 1, firstError: "No valid nodes" });
  });
});

describe("resolveApiUrl", () => {
  const { resolveApiUrl } = require("./api");

  it("accepts the address with or without /api, with or without a trailing slash", () => {
    const expected = "https://strategic-fusion-dashboard-4pxa.onrender.com/api";
    expect(resolveApiUrl("https://strategic-fusion-dashboard-4pxa.onrender.com", true)).toBe(expected); // how Render is set today
    expect(resolveApiUrl("https://strategic-fusion-dashboard-4pxa.onrender.com/", true)).toBe(expected);
    expect(resolveApiUrl("https://strategic-fusion-dashboard-4pxa.onrender.com/api", true)).toBe(expected);
    expect(resolveApiUrl("https://strategic-fusion-dashboard-4pxa.onrender.com/api/", true)).toBe(expected);
    expect(resolveApiUrl("  https://x.onrender.com/API  ", true)).toBe("https://x.onrender.com/api");
  });

  it("falls back to the local API while developing and to the same site in production", () => {
    expect(resolveApiUrl("", false)).toBe("http://localhost:5000/api");
    expect(resolveApiUrl(undefined, false)).toBe("http://localhost:5000/api");
    expect(resolveApiUrl("", true)).toBe("/api");
    expect(resolveApiUrl(undefined, true)).toBe("/api");
  });

  it("does not mangle a path that merely contains 'api'", () => {
    expect(resolveApiUrl("https://host.example/my-api", true)).toBe("https://host.example/my-api/api");
  });
});
