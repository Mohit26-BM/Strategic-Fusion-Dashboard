// Browser tests: they start their own throw-away backend (in-memory MongoDB, nothing real is touched) and the React
// dev server, on ports 5101 and 3101, so a normal `npm start` can keep running next to them.
//   npm run e2e
// Browser: the Microsoft Edge on the machine (nothing to download). For Playwright's own Chromium run
// `npx playwright install chromium` once and set PW_CHANNEL=chromium.
const { defineConfig } = require("@playwright/test");

const channel = process.env.PW_CHANNEL === "chromium" ? undefined : process.env.PW_CHANNEL || "msedge";

module.exports = defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: { baseURL: "http://localhost:3101", channel, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    {
      command: "npm run dev:memdb",
      cwd: "./backend",
      env: { PORT: "5101", CORS_ORIGINS: "http://localhost:3101", ADMIN_TOKEN: "e2e-token-1234567890" },
      url: "http://localhost:5101/health",
      reuseExistingServer: !!process.env.PW_REUSE,
      timeout: 90_000,
    },
    {
      command: "npm start",
      env: { PORT: "3101", BROWSER: "none", REACT_APP_API_URL: "http://localhost:5101/api" },
      url: "http://localhost:3101",
      reuseExistingServer: !!process.env.PW_REUSE,
      timeout: 180_000,
    },
  ],
});
