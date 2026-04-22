export const INTELLIGENCE_TYPE_CONFIG = {
  OSINT: {
    label: "Open Source Intelligence",
    shortLabel: "OSINT",
    color: "#2A81CB",
    markerColor: "blue",
  },
  HUMINT: {
    label: "Human Intelligence",
    shortLabel: "HUMINT",
    color: "#CB2B3E",
    markerColor: "red",
  },
  IMINT: {
    label: "Imagery Intelligence",
    shortLabel: "IMINT",
    color: "#2AAD27",
    markerColor: "green",
  },
  SIGINT: {
    label: "Signals Intelligence",
    shortLabel: "SIGINT",
    color: "#C9981A",
    markerColor: "gold",
  },
  CYBINT: {
    label: "Cyber Intelligence",
    shortLabel: "CYBINT",
    color: "#7B61FF",
    markerColor: "violet",
  },
  SEBINT: {
    label: "SEBINT",
    shortLabel: "SEBINT",
    color: "#14B8A6",
    markerColor: "teal",
  },
};

export const CORE_INTELLIGENCE_TYPES = ["OSINT", "HUMINT", "IMINT"];

export function normalizeIntelType(value, fallback = "OSINT") {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized || fallback;
}

export function getIntelTypeConfig(type) {
  const normalizedType = normalizeIntelType(type);
  return (
    INTELLIGENCE_TYPE_CONFIG[normalizedType] || {
      label: normalizedType,
      shortLabel: normalizedType,
      color: "#94A3B8",
      markerColor: "grey",
    }
  );
}

export function getAvailableTypes(data = []) {
  const discoveredTypes = data
    .map((item) => normalizeIntelType(item.type))
    .filter((value, index, array) => array.indexOf(value) === index);

  return ["all", ...discoveredTypes];
}
