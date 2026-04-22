import * as XLSX from "xlsx";
import { normalizeIntelType } from "./intelligenceTypes";

export function normalizeNode(rawNode, fallbackType = "OSINT") {
  const lat = parseFloat(rawNode.lat ?? rawNode.latitude);
  const lng = parseFloat(
    rawNode.lng ?? rawNode.lon ?? rawNode.long ?? rawNode.longitude,
  );

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    type: normalizeIntelType(rawNode.type, fallbackType),
    title: rawNode.title || rawNode.name || "Untitled",
    description: rawNode.description || rawNode.summary || "",
    image_url: rawNode.image_url || rawNode.imageUrl || "",
  };
}

export function normalizeNodes(rawNodes, fallbackType = "OSINT") {
  return rawNodes
    .map((node) => normalizeNode(node, fallbackType))
    .filter(Boolean);
}

export function parseJsonNodes(text) {
  const parsed = JSON.parse(text);
  const records = Array.isArray(parsed) ? parsed : parsed.nodes;

  if (!Array.isArray(records)) {
    throw new Error("JSON must be an array or an object with a nodes array.");
  }

  return normalizeNodes(records);
}

export function parseExcelNodes(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const records = XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
  });

  return normalizeNodes(records);
}
