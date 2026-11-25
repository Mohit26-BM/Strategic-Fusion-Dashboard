// Terrain overlay: bounds checking, helpers, and saving (so the overlay survives a page reload).

export const DEFAULT_TERRAIN_CONFIG = {
  enabled: false,
  imageUrl: "",
  bounds: { south: 20.0, west: 70.0, north: 35.0, east: 90.0 },
  opacity: 0.9,
  showBaseMap: false,
};

const FIELDS = ["south", "west", "north", "east"];
const LIMITS = { south: [-90, 90], north: [-90, 90], west: [-180, 180], east: [-180, 180] };
const LABEL = { south: "South", west: "West", north: "North", east: "East" };

/**
 * Checks south/west/north/east (numbers or text from an input box).
 * @returns {{ ok: boolean, errors: Record<string, string>, bounds: object|null }}
 */
export function validateBounds(input) {
  const errors = {};
  const values = {};

  for (const field of FIELDS) {
    const raw = input?.[field];
    const text = typeof raw === "string" ? raw.trim() : raw;
    if (text === "" || text === null || text === undefined) {
      errors[field] = `${LABEL[field]} is required`;
      continue;
    }
    const n = Number(text);
    if (!Number.isFinite(n)) {
      errors[field] = `${LABEL[field]} must be a number`;
      continue;
    }
    const [min, max] = LIMITS[field];
    if (n < min || n > max) {
      errors[field] = `${LABEL[field]} must be between ${min} and ${max}`;
      continue;
    }
    values[field] = n;
  }

  if (!errors.south && !errors.north && values.south >= values.north) {
    errors.north = "North must be larger than South";
  }
  if (!errors.west && !errors.east && values.west >= values.east) {
    errors.east = "East must be larger than West (an area crossing the 180° line is not supported)";
  }

  const ok = Object.keys(errors).length === 0;
  return { ok, errors, bounds: ok ? values : null };
}

/** The overlay is drawn only with an image, switched on, and valid bounds. */
export function isTerrainActive(config) {
  return Boolean(config?.enabled && config?.imageUrl && validateBounds(config.bounds).ok);
}

/** width / height of the real-world area, in ground distance (longitude shrinks towards the poles). */
export function areaAspect(bounds) {
  const midLat = ((bounds.south + bounds.north) / 2) * (Math.PI / 180);
  const width = (bounds.east - bounds.west) * Math.cos(midLat);
  const height = bounds.north - bounds.south;
  return width / height;
}

/**
 * Compares the picture's shape with the area's shape. A big difference means the image will look stretched.
 * @returns {{ imageRatio: number, areaRatio: number, stretchPercent: number, stretched: boolean }}
 */
export function compareAspect(imageWidth, imageHeight, bounds) {
  const imageRatio = imageWidth / imageHeight;
  const areaRatio = areaAspect(bounds);
  const stretchPercent = Math.round((Math.max(imageRatio, areaRatio) / Math.min(imageRatio, areaRatio) - 1) * 100);
  return { imageRatio, areaRatio, stretchPercent, stretched: stretchPercent > 15 };
}

/**
 * Grows the area (never shrinks it) until its shape matches the picture's shape, keeping the same centre,
 * so a picture fitted to some nodes is not stretched. Stays inside the world.
 */
export function expandToAspect(bounds, imageRatio) {
  const current = areaAspect(bounds);
  if (!Number.isFinite(imageRatio) || imageRatio <= 0 || Math.abs(current / imageRatio - 1) < 0.02) return bounds;

  const midLat = (bounds.south + bounds.north) / 2;
  const midLng = (bounds.west + bounds.east) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  let height = bounds.north - bounds.south;
  let width = bounds.east - bounds.west;

  if (current < imageRatio) width = (imageRatio * height) / cos; // too tall for the picture: make it wider
  else height = (width * cos) / imageRatio; // too wide: make it taller

  const round = (n) => Math.round(n * 1e4) / 1e4;
  return {
    south: round(Math.max(-90, midLat - height / 2)),
    north: round(Math.min(90, midLat + height / 2)),
    west: round(Math.max(-180, midLng - width / 2)),
    east: round(Math.min(180, midLng + width / 2)),
  };
}

export function isInsideBounds(node, bounds) {
  return node.lat >= bounds.south && node.lat <= bounds.north && node.lng >= bounds.west && node.lng <= bounds.east;
}

export function countOutsideBounds(nodes, bounds) {
  return nodes.filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng) && !isInsideBounds(n, bounds)).length;
}

/** The smallest bounds that contain every node, with some breathing room. Null when there is nothing to fit. */
export function boundsFromNodes(nodes, padding = 0.1) {
  const points = nodes.filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng));
  if (points.length === 0) return null;
  let south = Math.min(...points.map((n) => n.lat));
  let north = Math.max(...points.map((n) => n.lat));
  let west = Math.min(...points.map((n) => n.lng));
  let east = Math.max(...points.map((n) => n.lng));
  const minSpan = 0.5; // a single node would otherwise give an area of zero size
  if (north - south < minSpan) { south -= minSpan / 2; north += minSpan / 2; }
  if (east - west < minSpan) { west -= minSpan / 2; east += minSpan / 2; }
  const padLat = (north - south) * padding;
  const padLng = (east - west) * padding;
  const round = (n) => Math.round(n * 1e4) / 1e4;
  return {
    south: round(Math.max(-90, south - padLat)),
    north: round(Math.min(90, north + padLat)),
    west: round(Math.max(-180, west - padLng)),
    east: round(Math.min(180, east + padLng)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Saving. The settings (bounds, opacity, switches) are small and go in localStorage. The picture can be several
// megabytes, which would overflow localStorage's ~5 MB limit, so it goes in IndexedDB.
// ---------------------------------------------------------------------------------------------------------------
const SETTINGS_KEY = "sfd-terrain-settings";
const DB_NAME = "strategic-fusion";
const STORE = "terrain";
const IMAGE_KEY = "image";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not available"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open browser storage"));
  });
}

async function idbRun(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || new Error("Browser storage failed"));
      tx.onabort = () => reject(tx.error || new Error("Browser storage failed"));
    });
  } finally {
    db.close();
  }
}

const readImage = () => idbRun("readonly", (store) => store.get(IMAGE_KEY));
const writeImage = (dataUrl) => idbRun("readwrite", (store) => (dataUrl ? store.put(dataUrl, IMAGE_KEY) : store.delete(IMAGE_KEY)));

function sanitize(raw) {
  const base = DEFAULT_TERRAIN_CONFIG;
  const bounds = validateBounds(raw?.bounds);
  const opacity = Number(raw?.opacity);
  return {
    enabled: Boolean(raw?.enabled),
    imageUrl: typeof raw?.imageUrl === "string" ? raw.imageUrl : "",
    bounds: bounds.ok ? bounds.bounds : { ...base.bounds },
    opacity: Number.isFinite(opacity) && opacity >= 0.2 && opacity <= 1 ? opacity : base.opacity,
    showBaseMap: Boolean(raw?.showBaseMap),
  };
}

/** Loads whatever was saved earlier. Never throws: a broken save simply gives the defaults. */
export async function loadTerrain() {
  let settings = {};
  try {
    settings = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}") || {};
  } catch {
    settings = {};
  }
  let imageUrl = "";
  try {
    imageUrl = (await readImage()) || "";
  } catch {
    imageUrl = "";
  }
  const config = sanitize({ ...settings, imageUrl });
  if (!config.imageUrl) config.enabled = false;
  return config;
}

/**
 * Saves the overlay so it is still there after a reload.
 * @returns {Promise<{ ok: boolean, warning?: string }>}
 */
export async function saveTerrain(config) {
  const { imageUrl, ...settings } = sanitize(config);
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    return { ok: false, warning: "Your browser would not save the terrain settings (storage is full or switched off). The overlay will be lost when you reload." };
  }
  try {
    await writeImage(imageUrl);
  } catch {
    return { ok: false, warning: "Your browser would not save the terrain image (storage is full, or you are in a private window). The overlay will be lost when you reload." };
  }
  return { ok: true };
}
