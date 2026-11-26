import "fake-indexeddb/auto";
import {
  DEFAULT_TERRAIN_CONFIG,
  areaAspect,
  boundsFromNodes,
  compareAspect,
  countOutsideBounds,
  expandToAspect,
  isTerrainActive,
  loadTerrain,
  saveTerrain,
  validateBounds,
} from "./terrain";

const good = { south: 5, west: 65, north: 38, east: 98 };

describe("validateBounds", () => {
  it("accepts proper edges, as numbers or as text from the input boxes", () => {
    expect(validateBounds(good)).toEqual({ ok: true, errors: {}, bounds: good });
    expect(validateBounds({ south: "5", west: "65", north: "38", east: "98" }).bounds).toEqual(good);
  });

  it("names the field that is wrong", () => {
    expect(validateBounds({ ...good, north: "" }).errors.north).toBe("North is required");
    expect(validateBounds({ ...good, west: "abc" }).errors.west).toBe("West must be a number");
    expect(validateBounds({ ...good, south: -91 }).errors.south).toMatch(/between -90 and 90/);
    expect(validateBounds({ ...good, east: 181 }).errors.east).toMatch(/between -180 and 180/);
  });

  it("needs north above south and east right of west", () => {
    expect(validateBounds({ ...good, north: 5 }).errors.north).toMatch(/larger than South/);
    expect(validateBounds({ ...good, east: 65 }).errors.east).toMatch(/larger than West/);
    expect(validateBounds({ ...good, north: 1, east: 1 }).ok).toBe(false);
  });

  it("never returns bounds when anything is wrong, and survives rubbish input", () => {
    expect(validateBounds({ ...good, north: "" }).bounds).toBeNull();
    for (const input of [undefined, null, {}, "x", 5]) expect(validateBounds(input).ok).toBe(false);
  });
});

describe("isTerrainActive", () => {
  const base = { ...DEFAULT_TERRAIN_CONFIG, enabled: true, imageUrl: "data:image/png;base64,AAAA" };
  it("needs the switch, an image and valid bounds", () => {
    expect(isTerrainActive(base)).toBe(true);
    expect(isTerrainActive({ ...base, enabled: false })).toBe(false);
    expect(isTerrainActive({ ...base, imageUrl: "" })).toBe(false);
    expect(isTerrainActive({ ...base, bounds: { ...good, north: "" } })).toBe(false);
    expect(isTerrainActive(null)).toBe(false);
  });
});

describe("shape of the picture versus the area", () => {
  it("corrects for longitude shrinking towards the poles", () => {
    expect(areaAspect({ south: -1, north: 1, west: 0, east: 2 })).toBeCloseTo(1, 2); // at the equator 2 deg x 2 deg is square
    expect(areaAspect({ south: 59, north: 61, west: 0, east: 2 })).toBeCloseTo(0.5, 1); // near 60 N it is half as wide
  });

  it("flags a picture that would be stretched", () => {
    expect(compareAspect(800, 600, { south: -1, north: 1, west: 0, east: 2.67 }).stretched).toBe(false);
    const wrong = compareAspect(800, 600, { south: 10, north: 11, west: 80, east: 98 });
    expect(wrong.stretched).toBe(true);
    expect(wrong.stretchPercent).toBeGreaterThan(500);
  });

  it("expandToAspect makes the area match the picture without shrinking it or leaving the world", () => {
    const tall = { south: 10, north: 20, west: 70, east: 72 };
    const fitted = expandToAspect(tall, 4 / 3);
    expect(compareAspect(800, 600, fitted).stretched).toBe(false);
    expect(fitted.south).toBeLessThanOrEqual(tall.south);
    expect(fitted.north).toBeGreaterThanOrEqual(tall.north);
    expect(fitted.west).toBeLessThan(tall.west);
    const wide = expandToAspect({ south: 10, north: 11, west: 70, east: 90 }, 4 / 3);
    expect(wide.north - wide.south).toBeGreaterThan(1);
    expect(wide.east - wide.west).toBe(20);
    const nearPole = expandToAspect({ south: 85, north: 89.9, west: 0, east: 1 }, 2);
    expect(nearPole.north).toBeLessThanOrEqual(90);
    expect(expandToAspect(tall, NaN)).toBe(tall);
  });
});

describe("nodes and the area", () => {
  const nodes = [{ lat: 10, lng: 70 }, { lat: 12, lng: 75 }, { lat: 50, lng: 10 }, { lat: NaN, lng: 1 }];

  it("counts the nodes that are outside", () => {
    expect(countOutsideBounds(nodes, { south: 5, north: 20, west: 60, east: 80 })).toBe(1);
  });

  it("boundsFromNodes fits all nodes with some room, and copes with one node or none", () => {
    const b = boundsFromNodes(nodes.slice(0, 2));
    expect(b.south).toBeLessThan(10);
    expect(b.north).toBeGreaterThan(12);
    expect(b.west).toBeLessThan(70);
    expect(b.east).toBeGreaterThan(75);
    const single = boundsFromNodes([{ lat: 10, lng: 10 }]);
    expect(single.north - single.south).toBeGreaterThan(0.4);
    expect(boundsFromNodes([])).toBeNull();
    expect(boundsFromNodes([{ lat: NaN, lng: NaN }])).toBeNull();
    expect(validateBounds(boundsFromNodes(nodes)).ok).toBe(true);
  });
});

describe("saving and loading", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await saveTerrain(DEFAULT_TERRAIN_CONFIG);
  });

  it("starts with the defaults when nothing was saved", async () => {
    window.localStorage.clear();
    expect(await loadTerrain()).toEqual(DEFAULT_TERRAIN_CONFIG);
  });

  it("brings back the picture, the edges and the settings after a 'reload'", async () => {
    const config = { enabled: true, imageUrl: "data:image/png;base64," + "A".repeat(200_000), bounds: good, opacity: 0.6, showBaseMap: true };
    expect(await saveTerrain(config)).toEqual({ ok: true });
    expect(await loadTerrain()).toEqual(config);
  });

  it("keeps the big picture out of localStorage, so its 5 MB limit cannot break saving", async () => {
    expect(await saveTerrain({ ...DEFAULT_TERRAIN_CONFIG, enabled: true, imageUrl: "data:image/png;base64," + "A".repeat(2_000_000) })).toEqual({ ok: true });
    const stored = window.localStorage.getItem("sfd-terrain-settings");
    expect(stored.length).toBeLessThan(500);
    expect(stored).not.toContain("AAAA");
  });

  it("forgets the picture when it is removed", async () => {
    expect(await saveTerrain({ ...DEFAULT_TERRAIN_CONFIG, enabled: true, imageUrl: "data:image/png;base64,AAAA" })).toEqual({ ok: true });
    expect((await loadTerrain()).imageUrl).toBe("data:image/png;base64,AAAA"); // it really was stored...
    await saveTerrain({ ...DEFAULT_TERRAIN_CONFIG, enabled: false, imageUrl: "" });
    expect((await loadTerrain()).imageUrl).toBe(""); // ...and is really gone
  });

  it("never switches the overlay on without a picture, and repairs damaged saved settings", async () => {
    window.localStorage.setItem("sfd-terrain-settings", JSON.stringify({ enabled: true, bounds: { south: 50, north: 10, west: 0, east: 5 }, opacity: 99 }));
    const loaded = await loadTerrain();
    expect(loaded.enabled).toBe(false);
    expect(loaded.bounds).toEqual(DEFAULT_TERRAIN_CONFIG.bounds);
    expect(loaded.opacity).toBe(DEFAULT_TERRAIN_CONFIG.opacity);
    window.localStorage.setItem("sfd-terrain-settings", "{this is not json");
    expect(await loadTerrain()).toEqual(DEFAULT_TERRAIN_CONFIG);
  });

  it("tells the user when the browser refuses to save, instead of failing silently", async () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const result = await saveTerrain({ ...DEFAULT_TERRAIN_CONFIG, enabled: true, imageUrl: "data:image/png;base64,AAAA" });
    spy.mockRestore();
    expect(result.ok).toBe(false);
    expect(result.warning).toMatch(/lost when you reload/);
  });
});
