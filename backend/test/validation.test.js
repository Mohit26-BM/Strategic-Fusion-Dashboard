const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateNode } = require("../validation");

const ok = (o = {}) => ({ lat: 10, lng: 20, type: "osint", title: "T", ...o });

test("a good node is accepted and cleaned", () => {
  const { errors, value } = validateNode(ok({ title: "  Padded  ", type: " humint ", lat: "12.5", lng: "-7" }));
  assert.deepEqual(errors, []);
  assert.deepEqual(value, { lat: 12.5, lng: -7, type: "HUMINT", title: "Padded" });
});

test("empty, missing and non-numeric coordinates are rejected (an empty string is NOT zero)", () => {
  for (const bad of ["", "  ", null, undefined, "abc", NaN, {}, [], true]) {
    assert.ok(validateNode(ok({ lat: bad })).errors.length, `lat ${JSON.stringify(bad)}`);
    assert.ok(validateNode(ok({ lng: bad })).errors.length, `lng ${JSON.stringify(bad)}`);
  }
});

test("coordinates must be inside the world", () => {
  assert.match(validateNode(ok({ lat: 91 })).errors[0], /lat must be between/);
  assert.match(validateNode(ok({ lng: -180.5 })).errors[0], /lng must be between/);
  assert.deepEqual(validateNode(ok({ lat: -90, lng: 180 })).errors, []);
});

test("type and title are required and limited", () => {
  assert.ok(validateNode(ok({ type: "" })).errors.length);
  assert.ok(validateNode(ok({ type: "has space" })).errors.length);
  assert.ok(validateNode(ok({ type: "<script>" })).errors.length);
  assert.ok(validateNode(ok({ title: "   " })).errors.length);
  assert.ok(validateNode(ok({ title: "x".repeat(201) })).errors.length);
  assert.ok(validateNode(ok({ description: "x".repeat(5001) })).errors.length);
});

test("only known fields survive: _id, city, timestamp and anything else are dropped", () => {
  const { value } = validateNode(ok({ _id: "x", city: "Hacked", timestamp: "2000-01-01", admin: true, $set: { a: 1 }, source: "wire" }));
  assert.deepEqual(Object.keys(value).sort(), ["lat", "lng", "source", "title", "type"]);
});

test("image_url: http(s) and small image data are fine; everything else is refused", () => {
  assert.deepEqual(validateNode(ok({ image_url: "https://img.example/a.png" })).errors, []);
  assert.deepEqual(validateNode(ok({ image_url: "" })).errors, []);
  assert.deepEqual(validateNode(ok({ image_url: "data:image/png;base64,iVBORw0KGgo=" })).errors, []);
  for (const bad of ["javascript:alert(1)", "ftp://x/y.png", "data:text/html;base64,PHNjcmlwdD4=", "data:image/svg+xml;base64,PHN2Zz4=", "not a url", 5]) {
    assert.ok(validateNode(ok({ image_url: bad })).errors.length, String(bad));
  }
  assert.match(validateNode(ok({ image_url: "data:image/jpeg;base64," + "A".repeat(700001) })).errors[0], /too large/);
});

test("an update only checks the fields it contains", () => {
  assert.deepEqual(validateNode({ title: "New" }, { partial: true }), { errors: [], value: { title: "New" } });
  assert.ok(validateNode({ lat: 5 }, { partial: true }).errors.length, "lat without lng is not enough");
  assert.deepEqual(validateNode({}, { partial: true }), { errors: [], value: {} });
  assert.ok(validateNode({ title: "" }, { partial: true }).errors.length);
});

test("a body that is not an object is rejected", () => {
  for (const bad of [null, undefined, "x", 5, []]) assert.ok(validateNode(bad).errors.length);
});
