import "@testing-library/jest-dom";

// jsdom (used by Jest here) has no structuredClone, which the fake IndexedDB needs. Browsers have it.
if (typeof global.structuredClone !== "function") {
  global.structuredClone = (value) => JSON.parse(JSON.stringify(value));
}
