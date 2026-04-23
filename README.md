# Strategic Fusion Dashboard

A web-based intelligence dashboard for building a common operating picture across geospatial intelligence feeds. The project combines a React frontend, a Leaflet map interface, and a small Express/MongoDB backend for storing and retrieving intelligence nodes.

![Strategic Fusion Dashboard](dashboard.png)

## Overview

This dashboard is designed to bring multiple intelligence streams into one interactive map-driven workspace. It supports:

- `OSINT` - Open Source Intelligence
- `HUMINT` - Human Intelligence
- `IMINT` - Imagery Intelligence
- Additional Mongo-backed types such as `SIGINT`, `CYBINT`, and `SEBINT`

The main workflow is:

1. Ingest intelligence data from MongoDB or local files.
2. Render each record as a geospatial marker.
3. Inspect imagery and metadata through hover cards, marker popups, and the dossier panel.
4. Edit or delete selected records directly from the dossier panel.
5. Filter visible intelligence and automatically move the map to the matching node set.
6. Optionally anchor the map to a fixed terrain image instead of relying only on the standard base map.

## Current Features

- MongoDB-backed intelligence retrieval from the backend API
- Manual and bulk intelligence node creation, persisted to MongoDB
- Update and delete support for existing MongoDB-backed nodes
- City detection and storage for nodes using OpenStreetMap reverse geocoding
- Clean title and description handling: city is stored separately instead of being prefixed into the title/description
- Migration script (`backend/updateCities.js`) to update existing data with city info
- CSV, JSON, and Excel import with `.xlsx` and `.xls`
- Image ingestion for IMINT-style nodes
- Fixed terrain image overlay: upload a custom image and anchor it to real-world coordinates
- Marker clustering for dense data
- Hover preview cards for quick node inspection
- Click-to-open dossier panel for selected nodes, including edit/delete actions
- Center-screen notification, confirmation, and edit dialogs for node actions
- Type, source, and keyword filters
- Auto-focus/select node on unique match or Enter key in search
- Dynamic legend always shows core intelligence types (OSINT, HUMINT, IMINT)
- Support for standardized intelligence type labels and colors across the UI
- Floating help button linking to `/help.html` with usage instructions and limitations

## Tech Stack

### Frontend

- React
- React Scripts
- Leaflet
- React Leaflet
- React Leaflet Cluster
- Papa Parse
- SheetJS `xlsx`

### Backend

- Node.js
- Express
- MongoDB Node driver
- CORS

## Project Structure

```text
intel-dashboard/
|-- backend/
|   |-- package.json
|   |-- package-lock.json
|   `-- server.js
|-- public/
|   `-- index.html
|-- src/
|   |-- components/
|   |   |-- ActionDialogs.js
|   |   |-- AddNodeForm.js
|   |   |-- FileUpload.js
|   |   |-- FilterPanel.js
|   |   |-- IntelligencePanel.js
|   |   |-- Legend.js
|   |   |-- MapView.js
|   |   `-- TerrainMapControl.js
|   |-- services/
|   |   `-- api.js
|   |-- utils/
|   |   |-- fileReaders.js
|   |   |-- intelligenceImport.js
|   |   |-- intelligenceTypes.js
|   |   `-- markerIcons.js
|   |-- App.js
|   |-- index.css
|   `-- index.js
|-- package.json
|-- package-lock.json
|-- .gitignore
`-- README.md
```

## Frontend File Guide

### Core App

- [src/App.js](/d:/intel-dashboard/src/App.js)
  Coordinates the overall dashboard layout, Mongo polling, terrain state, filter-to-map focus behavior, and panel composition.

- [src/index.js](/d:/intel-dashboard/src/index.js)
  React entry point.

- [src/index.css](/d:/intel-dashboard/src/index.css)
  Global viewport, layout, dossier, dialog, and shared dashboard styling.

### Components

- [src/components/FileUpload.js](/d:/intel-dashboard/src/components/FileUpload.js)
  Handles local ingestion for CSV, JSON, Excel, and image files. Image uploads create map-ready IMINT nodes with metadata.

- [src/components/AddNodeForm.js](/d:/intel-dashboard/src/components/AddNodeForm.js)
  Sidebar form for manually creating a single intelligence node by coordinates.

- [src/components/FilterPanel.js](/d:/intel-dashboard/src/components/FilterPanel.js)
  Filters nodes by intelligence type and keyword, then triggers map focus updates.

- [src/components/TerrainMapControl.js](/d:/intel-dashboard/src/components/TerrainMapControl.js)
  Uploads a terrain image and georeferences it with south/west/north/east bounds so it can be used as a fixed map overlay.

- [src/components/MapView.js](/d:/intel-dashboard/src/components/MapView.js)
  Renders the Leaflet map, terrain overlay, clustered markers, hover cards, popups, and focus logic for filtered nodes.

- [src/components/IntelligencePanel.js](/d:/intel-dashboard/src/components/IntelligencePanel.js)
  Displays detailed metadata for the currently selected node and exposes edit/delete actions.

- [src/components/ActionDialogs.js](/d:/intel-dashboard/src/components/ActionDialogs.js)
  Provides reusable center-screen notification, confirmation, and edit dialogs.

- [src/components/Legend.js](/d:/intel-dashboard/src/components/Legend.js)
  Shows only the intelligence types currently visible on the map.

### Services

- [src/services/api.js](/d:/intel-dashboard/src/services/api.js)
  Frontend API wrapper for backend intelligence retrieval, creation, bulk import, update, and delete operations.

### Utilities

- [src/utils/fileReaders.js](/d:/intel-dashboard/src/utils/fileReaders.js)
  FileReader helpers for text, array buffer, and image data URL conversion.

- [src/utils/intelligenceImport.js](/d:/intel-dashboard/src/utils/intelligenceImport.js)
  Normalizes imported CSV/JSON/Excel records into the frontend node shape.

- [src/utils/intelligenceTypes.js](/d:/intel-dashboard/src/utils/intelligenceTypes.js)
  Central source of truth for intelligence type labels, colors, and normalization.

- [src/utils/markerIcons.js](/d:/intel-dashboard/src/utils/markerIcons.js)
  Builds Leaflet marker icons from intelligence type configuration.

## Backend File Guide

- [backend/server.js](/d:/intel-dashboard/backend/server.js)
  Express server that connects to MongoDB and exposes:
  - `GET /api/intelligence`
  - `POST /api/intelligence`
  - `POST /api/intelligence/bulk`
  - `PUT /api/intelligence/:id`
  - `DELETE /api/intelligence/:id`

- [backend/package.json](/d:/intel-dashboard/backend/package.json)
  Backend dependency manifest.

## Data Shape

The frontend expects intelligence nodes in roughly this format:

```json
{
  "lat": 28.6139,
  "lng": 77.209,
  "type": "OSINT",
  "title": "Example node",
  "description": "Summary of the intelligence item",
  "city": "Delhi",
  "source": "manual",
  "image_url": "https://example.com/image.jpg"
}
```

Supported input aliases during import include:

- `lat` or `latitude`
- `lng`, `lon`, `long`, or `longitude`
- `image_url` or `imageUrl`
- `title` or `name`
- `description` or `summary`

## Help & Usage

A floating question mark "?" button on the map links to `/help.html`, which explains what the project is, how to use it, and its limitations.

## Running The Project

### Front end

From the project root:

```bash
npm install
npm start
```

The frontend runs at `http://localhost:3000`.

### Back end

From the `backend` folder:

```bash
npm install
node server.js
```

The backend runs at `http://localhost:5000`.

#### MongoDB

The backend expects a local MongoDB instance at:

```
mongodb://localhost:27017
```

- Database: `intel_db`
- Collection: `intelligence`

#### Data Migration (City Detection)

To update existing data with city info, run:

```bash
node updateCities.js
```

in the `backend` folder. This adds or refreshes the `city` field for existing nodes using OpenStreetMap reverse geocoding.

#### API Routes

The backend exposes the following intelligence routes:

```text
GET    /api/intelligence
POST   /api/intelligence
POST   /api/intelligence/bulk
PUT    /api/intelligence/:id
DELETE /api/intelligence/:id
```

The `PUT` and `DELETE` routes require a MongoDB `_id` value. Local-only nodes without a database id cannot be updated or deleted through the backend.

## Build

To create a production build from the frontend:

```bash
npm run build
```

## Notes And Current Scope

- AWS S3 integration is not implemented in the current version.
- File ingestion is local and browser-based.
- The backend supports MongoDB retrieval, insertion, bulk insertion, update, and delete.
- The terrain overlay is stored in browser `localStorage`, not in the backend.
- The intelligence type system is standardized in the UI, but uncommon types depend on what is stored in MongoDB.

## Suggested Next Improvements

- Add map calibration helpers for terrain alignment
- Add README screenshots or sample datasets for easier onboarding
- Add authentication before exposing update/delete routes in a real deployment
