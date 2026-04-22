// --------------------
// Imports (ALL at top)
// --------------------
import { useEffect, useMemo, useState } from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  ImageOverlay,
  CircleMarker,
  useMap,
} from "react-leaflet";

import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";

import { markerIcons } from "../utils/markerIcons";
import { getIntelTypeConfig } from "../utils/intelligenceTypes";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

// --------------------
// Leaflet icon fix
// --------------------
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

// --------------------
// Helpers
// --------------------
function isSameNode(left, right) {
  if (!left || !right) return false;

  return (
    left.lat === right.lat &&
    left.lng === right.lng &&
    left.title === right.title &&
    left.type === right.type
  );
}

// --------------------
// UI Components
// --------------------
function HelpButton() {
  return (
    <a
      href="/help.html"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "absolute",
        top: 18,
        right: 18,
        zIndex: 1200,
        background: "#2A81CB",
        color: "#fff",
        borderRadius: "50%",
        width: 38,
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 24,
        fontWeight: 700,
        boxShadow: "0 2px 8px #0005",
        textDecoration: "none",
        border: "2px solid #fff",
        cursor: "pointer",
      }}
      title="Help: About & Usage"
    >
      ?
    </a>
  );
}

function TerrainViewport({ terrainConfig }) {
  const map = useMap();
  const enabled = Boolean(terrainConfig?.enabled && terrainConfig?.imageUrl);

  useEffect(() => {
    if (!enabled) {
      map.setMaxBounds(null);
      return;
    }

    const bounds = [
      [terrainConfig.bounds.south, terrainConfig.bounds.west],
      [terrainConfig.bounds.north, terrainConfig.bounds.east],
    ];

    map.fitBounds(bounds, { padding: [30, 30] });
    map.setMaxBounds(bounds);
  }, [map, terrainConfig, enabled]);

  return null;
}

function FocusController({ focusRequest, terrainConfig }) {
  const map = useMap();

  useEffect(() => {
    if (!focusRequest?.nodes?.length) {
      if (!terrainConfig?.enabled) {
        map.setMaxBounds(null);
      }
      return;
    }

    const coords = focusRequest.nodes
      .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng))
      .map((n) => [n.lat, n.lng]);

    if (!coords.length) return;

    if (coords.length === 1 || focusRequest.mode === "single") {
      map.flyTo(coords[0], Math.max(map.getZoom(), 9), { duration: 0.75 });
    } else {
      map.flyToBounds(coords, { padding: [60, 60], duration: 0.75 });
    }
  }, [focusRequest, map, terrainConfig]);

  return null;
}

// --------------------
// Main Component
// --------------------
function MapView({
  data,
  onNodeClick,
  selectedNode,
  terrainConfig,
  focusRequest,
}) {
  const [hovered, setHovered] = useState(null);

  const terrainEnabled = Boolean(
    terrainConfig?.enabled && terrainConfig?.imageUrl,
  );

  const terrainBounds = terrainEnabled
    ? [
        [terrainConfig.bounds.south, terrainConfig.bounds.west],
        [terrainConfig.bounds.north, terrainConfig.bounds.east],
      ]
    : null;

  const mapCenter = terrainEnabled
    ? [
        (terrainConfig.bounds.south + terrainConfig.bounds.north) / 2,
        (terrainConfig.bounds.west + terrainConfig.bounds.east) / 2,
      ]
    : [20.5937, 78.9629];

  const renderedPoints = useMemo(
    () => data.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [data],
  );

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <HelpButton />

      <MapContainer
        center={mapCenter}
        zoom={terrainEnabled ? 8 : 5}
        maxZoom={19}
        style={{ height: "100%", width: "100%" }}
      >
        {(!terrainEnabled || terrainConfig.showBaseMap) && (
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        )}

        {terrainEnabled && (
          <>
            <ImageOverlay
              url={terrainConfig.imageUrl}
              bounds={terrainBounds}
              opacity={terrainConfig.opacity}
            />
            <TerrainViewport terrainConfig={terrainConfig} />
          </>
        )}

        <FocusController
          focusRequest={focusRequest}
          terrainConfig={terrainConfig}
        />

        <MarkerClusterGroup>
          {renderedPoints.map((point, i) => {
            const typeConfig = getIntelTypeConfig(point.type);
            const isSelected = isSameNode(point, selectedNode);

            return (
              <Marker
                key={`${point.title}-${i}`}
                position={[point.lat, point.lng]}
                icon={markerIcons[point.type] || markerIcons.OSINT}
                eventHandlers={{
                  click: () => onNodeClick(point),
                  mouseover: () => setHovered(point),
                  mouseout: () => setHovered(null),
                }}
              >
                {isSelected && (
                  <CircleMarker
                    center={[point.lat, point.lng]}
                    radius={18}
                    pathOptions={{
                      color: "#fff",
                      weight: 2,
                      fillColor: typeConfig.color,
                      fillOpacity: 0.2,
                    }}
                  />
                )}

                <Popup>
                  <b>{point.title}</b>
                  <br />
                  {point.description}
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>

      {hovered && (
        <div className="map-hover-card">
          <strong>{hovered.title}</strong>
          <div>{hovered.description}</div>
        </div>
      )}
    </div>
  );
}

export default MapView;
