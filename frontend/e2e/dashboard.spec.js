const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { gradientPng, noisePng } = require("./png");

const API = "http://localhost:5101/api";
const TOKEN = "e2e-token-1234567890";
const fixture = (name) => path.join(__dirname, "fixtures", name);

// the tests build on each other (they share one in-memory database), so they run in order
test.describe.configure({ mode: "serial" });

const nodes = async () => (await fetch(`${API}/intelligence`)).json();

async function open(page, { unlock = false } = {}) {
  await page.goto("/");
  await page.getByRole("button", { name: /enter|launch|dashboard|open|start/i }).first().click();
  await page.waitForSelector(".app-shell");
  if (unlock && !(await page.locator(".access-bar--on").count())) {
    await page.getByRole("button", { name: "Unlock editing" }).first().click();
    await page.getByLabel("Access token").fill(TOKEN);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await expect(page.locator(".access-bar--on")).toBeVisible();
  }
}

/** Reads and closes the result dialog that appears after an import or a change. */
async function closeDialog(page) {
  const dialog = page.locator(".dialog-card").first();
  await expect(dialog).toBeVisible();
  const text = (await dialog.innerText()).replace(/\s+/g, " ");
  await page.locator(".dialog-button--primary").first().click();
  await expect(dialog).toBeHidden();
  return text;
}

async function preview(page, file) {
  await page.locator("#fileInput").setInputFiles(file);
  const region = page.getByRole("region", { name: "Import preview" });
  await expect(region.or(page.locator(".upload .form-error"))).toBeVisible();
  return region;
}

test("anyone can look, but nobody can change anything without the token", async ({ page }) => {
  await open(page);
  await expect(page.locator(".access-bar")).toContainText("Viewing only");
  await expect(page.locator("#section-ingestion")).toContainText("needs the access token");
  await expect(page.locator("#section-manual")).toContainText("needs the access token");

  // straight to the API, bypassing the page
  const post = (token) =>
    fetch(`${API}/intelligence`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ lat: 1, lng: 1, type: "OSINT", title: "sneaky" }) });
  expect((await post()).status).toBe(401);
  expect((await post("not-the-token-12345")).status).toBe(401);
  expect((await nodes()).some((n) => n.title === "sneaky")).toBe(false);
});

test("a wrong token is refused, the right one unlocks, and the tab remembers it across a reload", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Unlock editing" }).first().click();
  await page.getByLabel("Access token").fill("wrong-token-123456");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator("#unlock-error")).toHaveText("That token is not correct.");
  await page.getByLabel("Access token").fill(TOKEN);
  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator(".access-bar--on")).toContainText("Editing unlocked");
  await expect(page.locator("#fileInput")).toBeAttached();

  await open(page); // reload: same tab, token kept
  await expect(page.locator(".access-bar--on")).toBeVisible();

  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await expect(page.locator(".access-bar")).toContainText("Viewing only");
  await expect(page.locator("#fileInput")).toHaveCount(0);
});

test("a CSV with capitalised Latitude/Longitude headers imports (it used to be refused)", async ({ page }) => {
  await open(page, { unlock: true });
  const region = await preview(page, fixture("nodes-capitalised.csv"));
  await expect(region).toContainText("5 of 5 rows");
  await region.getByRole("button", { name: "Import 5 nodes" }).click();
  expect(await closeDialog(page)).toContain("Imported 5 of 5 nodes from nodes-capitalised.csv");
  expect((await nodes()).filter((n) => n.title === "Delhi relay").length).toBeGreaterThanOrEqual(1);
});

test("a messy CSV shows what will be skipped, then reports honestly what was saved", async ({ page }) => {
  await open(page, { unlock: true });
  const before = (await nodes()).length;
  const region = await preview(page, fixture("nodes-messy.csv"));
  await expect(region).toContainText("2 of 6 rows");
  await expect(region).toContainText("4 rows will be skipped");
  await expect(region).toContainText('row 3: latitude "abc" is not a number');
  await expect(region).toContainText("row 4: latitude 95.5 is outside -90 to 90");
  await expect(region).toContainText("row 5: longitude 190 is outside -180 to 180");
  await region.getByRole("button", { name: "Import 2 nodes" }).click();
  const message = await closeDialog(page);
  expect(message).toContain("Imported 2 of 6 nodes");
  expect(message).toContain("Skipped before sending");
  expect((await nodes()).length).toBe(before + 2);
});

test("Excel and plain CSV import, and an unsupported file is refused", async ({ page }) => {
  await open(page, { unlock: true });
  let region = await preview(page, fixture("nodes.xlsx"));
  await expect(region).toContainText('5 of 5 rows');
  await expect(region).toContainText('sheet "Nodes"');
  await region.getByRole("button", { name: "Import 5 nodes" }).click();
  await closeDialog(page);

  region = await preview(page, fixture("nodes.csv"));
  await region.getByRole("button", { name: "Import 5 nodes" }).click();
  await closeDialog(page);

  await page.locator("#fileInput").setInputFiles(fixture("notes.txt"));
  await expect(page.locator(".upload .form-error")).toContainText("Unsupported file type");
});

test("a 450-node import goes through in batches and every node arrives", async ({ page }) => {
  await open(page, { unlock: true });
  const many = Array.from({ length: 450 }, (_, i) => ({ lat: 8 + (i % 25) * 1.1, lng: 68 + Math.floor(i / 25) * 1.3, type: ["OSINT", "HUMINT", "IMINT"][i % 3], title: `Batch ${i + 1}`, description: "generated" }));
  const file = path.join(os.tmpdir(), "sfd-e2e-450.json");
  fs.writeFileSync(file, JSON.stringify(many));
  const before = (await nodes()).length;
  const region = await preview(page, file);
  await expect(region).toContainText("450 of 450 rows");
  await region.getByRole("button", { name: "Import 450 nodes" }).click();
  expect(await closeDialog(page)).toContain("Imported 450 of 450 nodes");
  expect((await nodes()).length).toBe(before + 450);
});

test("a big photo is shrunk in the browser and saved (it used to fail)", async ({ page }) => {
  await open(page, { unlock: true });
  const photo = path.join(os.tmpdir(), "sfd-e2e-photo.png");
  fs.writeFileSync(photo, noisePng(1600, 1200)); // about 5.5 MB of incompressible pixels
  await page.locator("#fileInput").setInputFiles(photo);
  await expect(page.getByText("Create IMINT node from image")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".import-preview .hint").last()).toContainText("Resized to 1280 × 960");
  await page.locator("#img-title").fill("Big photo");
  await page.locator("#img-lat").fill("21.1");
  await page.locator("#img-lng").fill("79.1");
  await page.getByRole("button", { name: "Add image node" }).click();
  expect(await closeDialog(page)).toContain("Imported 1 of 1 node");
  const saved = (await nodes()).find((n) => n.title === "Big photo");
  expect(saved.image_url).toMatch(/^data:image\/jpeg;base64,/);
  expect(saved.image_url.length).toBeLessThan(700_000);
});

test("terrain: overlay appears on the map, survives a reload, and bad edges give messages instead of breaking it", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Terrain Setup/ }).click();
  await page.getByTestId("terrain-file").setInputFiles(fixture("terrain.png"));
  await expect(page.locator(".terrain .hint", { hasText: "Image: 800 × 600" })).toBeVisible();
  for (const [edge, value] of Object.entries({ south: "5", west: "65", north: "38", east: "98" })) await page.locator(`#terrain-${edge}`).fill(value);
  await expect(page.locator(".leaflet-image-layer")).toHaveCount(1);
  await expect(page.locator(".terrain .form-warning").first()).toContainText("look stretched");

  await page.waitForTimeout(800); // the saving is delayed 400 ms
  await open(page);
  await expect(page.locator(".leaflet-image-layer")).toHaveCount(1); // still there after a reload
  await page.getByRole("button", { name: /Terrain Setup/ }).click();
  await expect(page.locator("#terrain-north")).toHaveValue("38");
  await expect(page.locator("#terrain-west")).toHaveValue("65");

  await page.locator("#terrain-north").fill("");
  await expect(page.locator("#terrain-north-error")).toHaveText("North is required");
  await expect(page.locator(".leaflet-image-layer")).toHaveCount(1); // keeps the last good position
  await expect(page.locator(".app-shell")).toBeVisible(); // and the page did not crash
  await page.locator("#terrain-north").fill("2");
  await expect(page.locator("#terrain-north-error")).toContainText("larger than South");
  await page.locator("#terrain-north").fill("38");
  await expect(page.locator("#terrain-north-error")).toHaveCount(0);

  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.waitForTimeout(800);
  await open(page);
  await expect(page.locator(".leaflet-image-layer")).toHaveCount(0); // removal is remembered too
});

test("terrain: 'Fit area to my nodes' matches the picture's shape; a huge picture is refused; a large one is downscaled and kept", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Terrain Setup/ }).click();

  const huge = path.join(os.tmpdir(), "sfd-e2e-huge.png");
  fs.writeFileSync(huge, noisePng(2800, 2000)); // 16 MB, over the 15 MB limit
  await page.getByTestId("terrain-file").setInputFiles(huge);
  await expect(page.locator(".terrain .form-error")).toContainText("the limit is 15 MB");

  const large = path.join(os.tmpdir(), "sfd-e2e-large.png");
  fs.writeFileSync(large, gradientPng(4500, 3000));
  await page.getByTestId("terrain-file").setInputFiles(large);
  await expect(page.locator(".terrain .hint", { hasText: "Image: 4096 × 2731" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Fit area to my nodes" }).click();
  await expect(page.locator(".terrain .form-warning", { hasText: "look stretched" })).toHaveCount(0);
  await expect(page.locator(".leaflet-image-layer")).toHaveCount(1);

  await page.waitForTimeout(1200);
  await open(page);
  await expect(page.locator(".leaflet-image-layer")).toHaveCount(1); // the downscaled picture was kept
  await page.getByRole("button", { name: /Terrain Setup/ }).click();
  await expect(page.locator(".terrain .form-warning", { hasText: "lost when you reload" })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
});

async function select(page, title) {
  await page.getByPlaceholder(/Search title/).fill(title);
  await page.waitForTimeout(1500); // a single match makes the map fly to it
  await page.locator(".leaflet-marker-icon:not(.marker-cluster)").first().click({ force: true });
  await expect(page.locator(".dossier-title", { hasText: title }).first()).toBeVisible();
}

test("editing sends only what changed, deleting asks first, and an uploaded photo survives an edit", async ({ page }) => {
  await open(page, { unlock: true });

  await select(page, "Batch 450");
  const before = (await nodes()).find((n) => n.title === "Batch 450");
  await page.getByRole("button", { name: "Edit Details" }).click();
  const dialog = page.getByRole("dialog", { name: "Update intelligence details" });
  await dialog.getByLabel("Title").fill("Batch 450 edited");
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  expect(await closeDialog(page)).toContain("Node updated");
  const after = (await nodes()).find((n) => n._id === before._id);
  expect(after.title).toBe("Batch 450 edited");
  expect(after.lat).toBe(before.lat);
  expect(after.city).toBe(before.city);

  await page.getByRole("button", { name: "Delete Node" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("permanently remove");
  await page.locator(".dialog-button--danger").click();
  expect(await closeDialog(page)).toContain("Node deleted");
  expect((await nodes()).some((n) => n._id === before._id)).toBe(false);

  await page.getByPlaceholder(/Search title/).fill("");
  await select(page, "Big photo");
  await page.getByRole("button", { name: "Edit Details" }).click();
  await expect(dialog.getByLabel("Image URL")).toHaveValue(""); // not 300 KB of text in a box
  await dialog.getByLabel("Title").fill("Big photo renamed");
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await closeDialog(page);
  expect((await nodes()).find((n) => n.title === "Big photo renamed").image_url).toMatch(/^data:image\/jpeg/);
});

test("when the server cannot be reached the page says so, keeps what was typed, and recovers", async ({ page }) => {
  await open(page, { unlock: true });
  await page.route("**/api/intelligence", (route) => route.abort("connectionrefused"));

  await page.getByRole("button", { name: "Reload nodes" }).click();
  await expect(page.locator(".load-banner")).toContainText("Cannot reach the server");
  await expect(page.locator(".metric-value--small")).toHaveText("Offline");

  await page.locator("#node-lat").fill("10");
  await page.locator("#node-lng").fill("10");
  await page.locator("#node-title").fill("Typed while offline");
  await page.getByRole("button", { name: "Add node" }).click();
  expect(await closeDialog(page)).toContain("Node not saved");
  await expect(page.locator("#node-title")).toHaveValue("Typed while offline"); // nothing to retype

  await page.unroute("**/api/intelligence");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".load-banner")).toHaveCount(0);
  await expect(page.locator(".metric-value--small")).toHaveText("Live");

  await page.getByRole("button", { name: "Add node" }).click();
  expect(await closeDialog(page)).toContain("Node added");
  expect((await nodes()).some((n) => n.title === "Typed while offline")).toBe(true);
});

test("a token the server stops accepting locks the page and asks again", async ({ page }) => {
  await open(page, { unlock: true });
  await page.evaluate(() => window.sessionStorage.setItem("sfd-admin-token", "no-longer-valid-token"));
  await page.locator("#node-lat").fill("11");
  await page.locator("#node-lng").fill("11");
  await page.locator("#node-title").fill("Should not be saved");
  await page.getByRole("button", { name: "Add node" }).click();
  await expect(page.locator("#unlock-title")).toBeVisible();
  await expect(page.getByText(/not accepted/i)).toBeVisible();
  await expect(page.locator(".access-bar")).toContainText("Viewing only");
  expect((await nodes()).some((n) => n.title === "Should not be saved")).toBe(false);
});

test("on a phone the controls open from a button, are usable, and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open controls" }).click();
  await expect(page.locator(".app-sidebar")).toHaveClass(/is-open/);
  await page.getByRole("button", { name: "Unlock editing" }).first().click({ timeout: 5000 }); // not blocked by the dimming overlay
  await expect(page.locator("#unlock-title")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#unlock-title")).toHaveCount(0);
  await page.getByRole("button", { name: "Close controls" }).click();
  await expect(page.locator(".app-sidebar")).not.toHaveClass(/is-open/);
});

test("there are no JavaScript errors on the way through", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|tile\.openstreetmap/.test(m.text())) errors.push(m.text());
  });
  await open(page, { unlock: true });
  await page.getByRole("button", { name: /Terrain Setup/ }).click();
  await page.getByPlaceholder(/Search title/).fill("Delhi");
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});
