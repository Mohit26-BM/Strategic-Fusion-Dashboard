# Strategic Fusion Dashboard

A web-based intelligence dashboard for building a common operating picture on a map. A React front end with a Leaflet map talks to a small Express API that stores intelligence nodes in MongoDB. Anyone can look at the map; changing data needs an access token.

```
Browser (React + Leaflet)  --HTTPS-->  Express API  -->  MongoDB
  CSV / JSON / Excel / images            token for changes    collection "intelligence"
  terrain overlay (kept in the browser)  validation, rate limits
```

## What it does

- **Map of nodes** with clustering, hover previews, a dossier panel, a legend, and filters by type, source and keyword.
- **Types:** `OSINT`, `HUMINT`, `IMINT`, `SIGINT`, `CYBINT`, `SEBINT`, plus any other short name found in the data.
- **Ingestion:** CSV, JSON, GeoJSON, Excel (`.xlsx`, `.xls`) and images. You get a preview, and the list of rows that would be skipped (with reasons), before anything is saved. Big files are sent in batches with a progress bar.
- **Manual nodes, editing and deleting** with proper validation and confirmation dialogs.
- **Terrain setup:** pin your own picture (a map, satellite image or plan) to real-world edges. It is saved in your browser, warns about a stretched picture or nodes outside it, and can fit itself to your nodes.
- **Access control:** one shared token. Viewing is open; adding, importing, editing and deleting are locked until you press *Unlock editing*.
- Works on phones, keyboard friendly, clear loading / offline / empty states.

## Quick start (no MongoDB needed)

You need Node.js 18 or newer.

```bash
npm install                      # front end
cd backend && npm install        # API
npm run dev:memdb                # API on http://localhost:5000 with a throw-away in-memory database
# in a second terminal, from the project root:
npm start                        # the app on http://localhost:3000
```

`dev:memdb` prints an access token for the session (`dev-token-1234567890` unless you set `ADMIN_TOKEN`). It never reads `backend/.env` and cannot reach a real database; everything is lost when you stop it. Press **Launch Dashboard**, then **Unlock editing**, and try the sample files in `e2e/fixtures/`.

### With your own MongoDB

```bash
cd backend
cp .env.example .env     # then edit it: MONGO_URI, MONGO_DB, ADMIN_TOKEN, CORS_ORIGINS
npm start                # http://localhost:5000
```

Start the front end with `npm start` in the project root as above. For a database that already has nodes, fill in missing place names with `npm run migrate:cities` (add `-- --all` to redo every node).

## Configuration

Backend (`backend/.env` locally, the service's *Environment* tab on Render). See `backend/.env.example`.

| Variable | Needed | What it does |
|---|---|---|
| `MONGO_URI` | production | MongoDB connection string. Local default `mongodb://localhost:27017` |
| `MONGO_DB` | no | Database name (letters, digits, `_`, `-`). Default `intel_db` |
| `ADMIN_TOKEN` | **to change data** | At least 16 characters. **Without it the API is read-only.** Generate: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` |
| `CORS_ORIGINS` | **in production** | Address(es) of the front end allowed to call the API, comma separated (`https://my-app.onrender.com`). Empty in production = no browser on another address can call it |
| `PORT` | no | Default 5000 |
| `GEOCODING` | no | `off` disables the place-name lookups |
| `GEOCODER_USER_AGENT` | no | How the API identifies itself to OpenStreetMap (they ask for a contact) |

Front end (read when the app is **built**; see `.env.example`):

| Variable | What it does |
|---|---|
| `REACT_APP_API_URL` | API address including `/api`, e.g. `https://my-api.onrender.com/api`. Default: `http://localhost:5000/api` in development, `/api` in production. It is public: never put the token here |

> **A Windows gotcha.** If your computer has a system environment variable called `MONGO_DB` (an old installer left one pointing at a folder), it used to silently beat the value in `.env`. In development `backend/.env` now wins and the API prints a note when it replaced a system value. Production always uses the real environment.

## Access control

- Everybody can read nodes. These need the token: `POST /api/intelligence`, `POST /api/intelligence/bulk`, `PUT` and `DELETE /api/intelligence/:id`.
- The token travels only in an `Authorization: Bearer ...` header, is compared in constant time, and is kept in `sessionStorage`, so it is forgotten when the tab closes.
- Ten wrong tokens from one address in 10 minutes lock that address out for the rest of the window.
- This is a **shared secret, not user accounts**: anyone who has the token can change everything. Keep it private; if it leaks, change `ADMIN_TOKEN` on the server.
- A server with a missing or short `ADMIN_TOKEN` stays usable but read-only, and the page says so.

## Importing data

| | |
|---|---|
| Files | CSV, JSON (an array, `{ "nodes": [...] }`, or GeoJSON points), Excel (first sheet), images |
| Required | latitude and longitude on every row |
| Column names | not case-sensitive. `lat`, `latitude`; `lng`, `lon`, `long`, `longitude`; `title`, `name`; `description`, `summary`, `notes`; `type`; `source`; `image_url`, `image` |
| Limits | 5000 rows and 10 MB per file; 500 nodes per request (the app batches for you) |
| Bad rows | skipped and listed with the row number and reason (`latitude "abc" is not a number`, `latitude 95 is outside -90 to 90`, ...) |
| Images | JPEG, PNG, WebP or GIF up to 15 MB, shrunk in the browser (max 1280 px) so they fit |
| Place names | looked up from OpenStreetMap one per second **after** the import, so a large file never makes you wait |

## Terrain setup

The overlay needs a picture and four edges in degrees: **North** and **South** are latitudes, **West** and **East** are longitudes (North above South, East right of West).

- The picture and settings are saved **in your browser** (the settings in `localStorage`, the picture in IndexedDB), so they survive a reload but are not shared with other people or devices.
- While the overlay is on, the map is limited to its area. The panel tells you how many nodes lie outside it.
- If the picture's shape does not match the area's shape, you get a "stretched by about N%" warning. **Fit area to my nodes** chooses edges around your nodes in the picture's shape.
- Wrong edges never break the page: the overlay keeps its last valid position and the box shows what is wrong.
- Pictures up to 15 MB are accepted; very large ones are scaled down to 4096 px.

## API

| Endpoint | Token | Purpose |
|---|---|---|
| `GET /health` | no | server and database are up |
| `GET /api/config` | no | `{ writesEnabled, bulkMax }` |
| `GET /api/intelligence?limit=` | no | nodes, newest first (max 5000) |
| `POST /api/auth/check` | yes | checks a token, changes nothing |
| `POST /api/intelligence` | yes | add one node |
| `POST /api/intelligence/bulk` | yes | add up to 500 `{ nodes: [...] }`; answers `insertedCount`, `skippedCount`, `skipped` |
| `PUT /api/intelligence/:id` | yes | change fields (only the fields sent) |
| `DELETE /api/intelligence/:id` | yes | delete one node |

Only these fields are ever stored: `lat`, `lng`, `type`, `title`, `description`, `source`, `image_url` (an `http(s)` link or a small embedded PNG/JPEG/WebP/GIF), plus server-managed `city`, `timestamp`, `updatedAt`. Anything else in a request is dropped.

## Tests

| Suite | Command | Covers |
|---|---|---|
| Backend (60) | `cd backend && npm test` | validation, token guard and lockout, CORS, rate limits, error hygiene, geocoder (cache, 1 req/s, failures), config, `.env` handling, and the whole API on a **real in-memory MongoDB** |
| Front end (84) | `npm run test:ci` | import parsing (headers, bad rows, GeoJSON, Excel), terrain bounds and saving (real IndexedDB), API client, unlock flow, dialogs, forms, upload preview |
| Browser (14) | `npm run e2e` | the real app on a throw-away backend: locked and unlocked states, every import path, photo shrinking, terrain (overlay, reload, bad edges, large and huge pictures), edit / delete, offline recovery, phone layout |

`npm run e2e` starts its own servers on ports 3101 and 5101, uses the Microsoft Edge on the machine (or `PW_CHANNEL=chromium` after `npx playwright install chromium`), and never touches a real database.

## Deploying on Render

The front end is a static site and the API a web service. After updating from an older version, do these **before or together with** the deploy, otherwise the live site will stop working:

1. **API service** (`backend` folder, build `npm install`, start `npm start`), add environment variables:
   - `ADMIN_TOKEN`: a long random value (see above). Keep a copy somewhere safe: it is how you unlock editing.
   - `CORS_ORIGINS`: the address of your front end, e.g. `https://strategic-fusion-dashboard.onrender.com`. **Without it the browser blocks every call from the site.**
   - `MONGO_URI`, `MONGO_DB` as before; `NODE_ENV=production` if Render has not already set it.
2. **Static site**: `REACT_APP_API_URL` = `https://YOUR-API.onrender.com/api`, then rebuild.
3. Check `https://YOUR-API.onrender.com/health` and `/api/config` (it should say `"writesEnabled": true`).
4. Open the site: it can be read at once; *Unlock editing* asks for the token.

A free Render service sleeps when idle and takes up to a minute to wake: the page shows "Loading… the server may be waking up" and then recovers by itself or with *Try again*.

## Project structure

```text
intel-dashboard/
|-- backend/
|   |-- server.js        entry point (connects to MongoDB, starts the API)
|   |-- app.js           routes, security headers, CORS, rate limits, error handling
|   |-- config.js        all settings from environment variables
|   |-- validation.js    turns a request body into a clean node (allow-list of fields)
|   |-- auth.js          the admin-token guard and lockout
|   |-- geocoder.js      OpenStreetMap lookups: queue, cache, timeouts
|   |-- store.js         MongoDB data layer (and an in-memory twin for tests)
|   |-- env.js           reads backend/.env (development wins, production does not)
|   |-- updateCities.js  one-off tool to fill in place names
|   |-- scripts/dev-memory-db.js   `npm run dev:memdb`
|   `-- test/            node:test suites
|-- src/
|   |-- App.js           layout, loading states, import / edit / delete flows
|   |-- auth/            token context, unlock dialog, access bar
|   |-- components/      MapView, FileUpload, TerrainMapControl, dialogs, panels, forms
|   |-- services/        api.js (requests, errors, batching), auth.js (token storage)
|   `-- utils/           import parsing, terrain bounds and saving, image resizing, types
|-- e2e/                 Playwright tests and small sample files
|-- public/              index.html, help.html
`-- README.md
```

## Known limits

- One shared token, not individual accounts or roles.
- The terrain overlay cannot cross the 180° line and is stored per browser.
- OpenStreetMap place names are fetched at one request per second, so a big import fills them in gradually.
- Prototype software: do not use it for operational intelligence decisions.
