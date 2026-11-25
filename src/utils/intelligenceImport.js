import * as XLSX from "xlsx";

// Everything an uploaded file goes through before it is sent to the server.
// The point: never lose a row silently. Every row either becomes a node or comes back with a reason.

export const MAX_IMPORT_ROWS = 5000;
export const MAX_TITLE = 200;
export const MAX_DESCRIPTION = 5000;

// Column names are compared in lower case with spaces, dashes and underscores removed,
// so "Latitude", "LAT", "lat " and "Lat_itude" all match.
const ALIASES = {
  lat: ["lat", "latitude", "latdeg", "latitudedeg", "ylat"],
  lng: ["lng", "lon", "long", "longitude", "lngdeg", "londeg", "longitudedeg", "xlon"],
  type: ["type", "inttype", "inteltype", "category", "discipline"],
  title: ["title", "name", "label", "headline", "subject"],
  description: ["description", "summary", "details", "notes", "note", "comment", "comments"],
  source: ["source", "origin", "feed", "provider"],
  image_url: ["imageurl", "image", "imagelink", "photo", "photourl", "picture"],
};

const squash = (key) => String(key).toLowerCase().replace(/[\s_\-.]+/g, "");

function pick(row, field) {
  const wanted = ALIASES[field];
  for (const key of Object.keys(row)) {
    if (wanted.includes(squash(key))) return row[key];
  }
  return undefined;
}

/** Reads "12.5", " 12.5 ", 12.5 and the decimal-comma form "12,5". Returns null when it is not a number. */
export function parseCoordinate(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.trim();
  if (text === "") return null;
  if (/^-?\d+,\d+$/.test(text)) text = text.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function cleanType(value, fallback) {
  const text = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  return text.slice(0, 20) || fallback;
}

/**
 * @returns {{ node: object } | { reason: string }}
 */
export function normalizeRow(raw, fallbackType = "OSINT") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "not a record" };

  const rawLat = pick(raw, "lat");
  const rawLng = pick(raw, "lng");
  if (rawLat === undefined && rawLng === undefined) return { reason: "no latitude/longitude columns" };

  const lat = parseCoordinate(rawLat);
  if (lat === null) return { reason: rawLat === undefined || String(rawLat).trim() === "" ? "latitude is empty" : `latitude "${String(rawLat).slice(0, 20)}" is not a number` };
  const lng = parseCoordinate(rawLng);
  if (lng === null) return { reason: rawLng === undefined || String(rawLng).trim() === "" ? "longitude is empty" : `longitude "${String(rawLng).slice(0, 20)}" is not a number` };
  if (lat < -90 || lat > 90) return { reason: `latitude ${lat} is outside -90 to 90` };
  if (lng < -180 || lng > 180) return { reason: `longitude ${lng} is outside -180 to 180` };

  const title = String(pick(raw, "title") ?? "").trim() || "Untitled";
  const description = String(pick(raw, "description") ?? "").trim();
  const source = String(pick(raw, "source") ?? "").trim();
  const image = String(pick(raw, "image_url") ?? "").trim();

  const node = {
    lat,
    lng,
    type: cleanType(pick(raw, "type"), fallbackType),
    title: title.slice(0, MAX_TITLE),
    description: description.slice(0, MAX_DESCRIPTION),
  };
  if (source) node.source = source.slice(0, 100);
  if (image) node.image_url = image;
  return { node };
}

/**
 * @param {object[]} rows parsed records
 * @param {{ fallbackType?: string, firstRowNumber?: number }} options firstRowNumber = the spreadsheet row number of rows[0]
 * @returns {{ nodes: object[], skipped: { row: number, reason: string }[], total: number }}
 */
export function normalizeRows(rows, { fallbackType = "OSINT", firstRowNumber = 1 } = {}) {
  const nodes = [];
  const skipped = [];
  rows.forEach((raw, index) => {
    const result = normalizeRow(raw, fallbackType);
    if (result.node) nodes.push(result.node);
    else skipped.push({ row: firstRowNumber + index, reason: result.reason });
  });
  return { nodes, skipped, total: rows.length };
}

function tooMany(count) {
  return count > MAX_IMPORT_ROWS ? new Error(`This file has ${count} rows. The limit is ${MAX_IMPORT_ROWS} per file; split it and import the parts.`) : null;
}

/** JSON: an array of records, { nodes: [...] }, or a GeoJSON FeatureCollection of points. */
export function parseJsonNodes(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  let rows;
  if (Array.isArray(parsed)) rows = parsed;
  else if (Array.isArray(parsed?.nodes)) rows = parsed.nodes;
  else if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
    rows = parsed.features.map((feature) => {
      const coords = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null;
      if (!Array.isArray(coords)) return null;
      return { ...(feature.properties || {}), lng: coords[0], lat: coords[1] }; // GeoJSON order is [longitude, latitude]
    });
  } else {
    throw new Error("JSON must be an array of records, an object with a nodes array, or a GeoJSON FeatureCollection.");
  }

  const error = tooMany(rows.length);
  if (error) throw error;
  return normalizeRows(rows, { firstRowNumber: 1 });
}

/** The records of an already-parsed CSV (Papa Parse output with header: true). */
export function normalizeCsvRows(rows) {
  const error = tooMany(rows.length);
  if (error) throw error;
  return normalizeRows(rows, { firstRowNumber: 2 }); // row 1 is the header
}

export function parseExcelNodes(arrayBuffer) {
  let workbook;
  try {
    workbook = XLSX.read(arrayBuffer, { type: "array" });
  } catch {
    throw new Error("That spreadsheet could not be read. Is it a real .xlsx or .xls file?");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { nodes: [], skipped: [], total: 0 };

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  const error = tooMany(rows.length);
  if (error) throw error;
  return { ...normalizeRows(rows, { firstRowNumber: 2 }), sheet: sheetName };
}

/** A short human summary of why rows were skipped, e.g. for a dialog. */
export function describeSkipped(skipped, limit = 5) {
  if (!skipped.length) return "";
  const shown = skipped.slice(0, limit).map((s) => `row ${s.row}: ${s.reason}`);
  const more = skipped.length - shown.length;
  return shown.join("; ") + (more > 0 ? `; and ${more} more` : "");
}
