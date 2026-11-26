import * as XLSX from "xlsx";
import {
  describeSkipped,
  normalizeCsvRows,
  normalizeRow,
  parseCoordinate,
  parseExcelNodes,
  parseJsonNodes,
} from "./intelligenceImport";

describe("parseCoordinate", () => {
  it("reads numbers, padded text and the decimal-comma form", () => {
    expect(parseCoordinate(12.5)).toBe(12.5);
    expect(parseCoordinate(" -7.25 ")).toBe(-7.25);
    expect(parseCoordinate("12,5")).toBe(12.5);
    expect(parseCoordinate("1e2")).toBe(100);
  });

  it("refuses everything that is not a plain number (an empty cell is not zero)", () => {
    for (const bad of ["", "  ", "abc", "12.5N", "1,2,3", null, undefined, NaN, Infinity, {}, []]) {
      expect(parseCoordinate(bad)).toBeNull();
    }
  });
});

describe("normalizeRow", () => {
  it("finds columns whatever the capitalisation or spelling", () => {
    const variants = [
      { lat: 10, lng: 20, title: "A" },
      { Latitude: 10, Longitude: 20, Title: "A" },
      { LAT: "10", LON: "20", NAME: "A" },
      { " latitude ": 10, long: 20, label: "A" },
      { Lat_itude: 10, "Long-itude": 20, Headline: "A" },
    ];
    for (const raw of variants) {
      expect(normalizeRow(raw).node).toMatchObject({ lat: 10, lng: 20, title: "A" });
    }
  });

  it("keeps source and image link, uppercases the type, and falls back for missing values", () => {
    const { node } = normalizeRow({ lat: 1, lng: 2, type: "humint", Source: " wire ", "Image URL": "https://x/y.png" }, "OSINT");
    expect(node).toEqual({ lat: 1, lng: 2, type: "HUMINT", title: "Untitled", description: "", source: "wire", image_url: "https://x/y.png" });
    expect(normalizeRow({ lat: 1, lng: 2 }, "IMINT").node.type).toBe("IMINT");
    expect(normalizeRow({ lat: 1, lng: 2, type: "!!!" }).node.type).toBe("OSINT");
  });

  it("gives a specific reason for every kind of bad row", () => {
    expect(normalizeRow({ title: "x" }).reason).toMatch(/no latitude\/longitude columns/);
    expect(normalizeRow({ lat: "", lng: 5 }).reason).toBe("latitude is empty");
    expect(normalizeRow({ lat: 5, lng: "" }).reason).toBe("longitude is empty");
    expect(normalizeRow({ lat: "abc", lng: 5 }).reason).toBe('latitude "abc" is not a number');
    expect(normalizeRow({ lat: 95, lng: 5 }).reason).toMatch(/latitude 95 is outside/);
    expect(normalizeRow({ lat: 5, lng: -181 }).reason).toMatch(/longitude -181 is outside/);
    expect(normalizeRow(null).reason).toBe("not a record");
    expect(normalizeRow([1, 2]).reason).toBe("not a record");
  });

  it("cuts over-long text so the server does not refuse the whole batch", () => {
    const { node } = normalizeRow({ lat: 1, lng: 2, title: "t".repeat(500), description: "d".repeat(9000) });
    expect(node.title).toHaveLength(200);
    expect(node.description).toHaveLength(5000);
  });
});

describe("CSV rows", () => {
  it("reports skipped rows with their spreadsheet row number (the header is row 1)", () => {
    const rows = [
      { lat: "12.97", lng: "77.59", title: "ok" },
      { lat: "abc", lng: "77", title: "bad" },
      { lat: "95.5", lng: "77", title: "range" },
      { lat: "", lng: "", title: "empty" },
      { lat: "17.38", lng: "78.48", title: "ok2" },
    ];
    const result = normalizeCsvRows(rows);
    expect(result.total).toBe(5);
    expect(result.nodes.map((n) => n.title)).toEqual(["ok", "ok2"]);
    expect(result.skipped.map((s) => s.row)).toEqual([3, 4, 5]);
    expect(describeSkipped(result.skipped, 2)).toBe('row 3: latitude "abc" is not a number; row 4: latitude 95.5 is outside -90 to 90; and 1 more');
  });

  it("refuses a file with more rows than the limit", () => {
    const rows = Array.from({ length: 5001 }, () => ({ lat: 1, lng: 1 }));
    expect(() => normalizeCsvRows(rows)).toThrow(/5001 rows/);
  });
});

describe("JSON", () => {
  it("accepts an array, an object with nodes, and GeoJSON points (longitude first)", () => {
    expect(parseJsonNodes('[{"lat":1,"lng":2,"title":"a"}]').nodes).toHaveLength(1);
    expect(parseJsonNodes('{"nodes":[{"lat":1,"lng":2}]}').nodes).toHaveLength(1);
    const geo = { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [77.2, 28.6] }, properties: { title: "Delhi", type: "imint" } }, { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: {} }] };
    const result = parseJsonNodes(JSON.stringify(geo));
    expect(result.nodes).toEqual([{ lat: 28.6, lng: 77.2, type: "IMINT", title: "Delhi", description: "" }]);
    expect(result.skipped).toHaveLength(1);
  });

  it("explains a broken or unsupported file", () => {
    expect(() => parseJsonNodes("{not json")).toThrow(/not valid JSON/);
    expect(() => parseJsonNodes('{"hello":1}')).toThrow(/array of records/);
  });
});

describe("Excel", () => {
  it("reads the first sheet and keeps going past bad rows", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Latitude: 10, Longitude: 20, Title: "a" }, { Latitude: "oops", Longitude: 20, Title: "b" }]), "Nodes");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" });
    const result = parseExcelNodes(buffer);
    expect(result.sheet).toBe("Nodes");
    expect(result.nodes).toHaveLength(1);
    expect(result.skipped).toEqual([{ row: 3, reason: 'latitude "oops" is not a number' }]);
  });

  it("says so when the file is not a spreadsheet", () => {
    expect(() => parseExcelNodes(new TextEncoder().encode("plain text, not a workbook").buffer)).not.toThrow(/Cannot/);
  });
});
