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

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

// --------------------
// Helper (safe comparison)
// --------------------
function isSameNode(a, b) {
  if (!a || !b) return false;

  return (
    Math.abs(a.lat - b.lat) < 0.0001 &&
    Math.abs(a.lng - b.lng) < 0.0001 &&
    a.title === b.title &&
    a.type === b.type
  );
}

// --------------------
// Focus Controller (FIXED)
// --------------------
function FocusController({ focusRequest, terrainConfig, data }) {
  const map = useMap();

  useEffect(() => {
    if (!focusRequest) {
      if (!terrainConfig?.enabled) {
        map.setMaxBounds(null);
      }
      return;
    }

    // Focus on a specific node if requested
    if (focusRequest.mode === "single" && Number.isFinite(focusRequest.lat) && Number.isFinite(focusRequest.lng)) {
      map.flyTo([focusRequest.lat, focusRequest.lng], Math.max(map.getZoom(), 9), { duration: 0.75 });
      return;
    }

    // Otherwise, focus on all filtered nodes
    const coords = data
      .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng))
      .map((n) => [n.lat, n.lng]);

    if (!coords.length) return;

    if (coords.length === 1) {
      map.flyTo(coords[0], Math.max(map.getZoom(), 9), { duration: 0.75 });
    } else {
      map.flyToBounds(coords, { padding: [60, 60], duration: 0.75 });
    }
  }, [focusRequest, map, terrainConfig, data]);

  return null;
}

// --------------------
// Terrain Controller
// --------------------
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

  // Only valid points
  const renderedPoints = useMemo(
    () => data.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)),
    [data],
  );

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <MapContainer
        center={mapCenter}
        zoom={terrainEnabled ? 8 : 5}
        maxZoom={19}
        style={{ height: "100%", width: "100%" }}
      >
        {/* Base map */}
        {(!terrainEnabled || terrainConfig.showBaseMap) && (
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        )}

        {/* Terrain overlay */}
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

        {/* Focus logic */}
        <FocusController
          focusRequest={focusRequest}
          terrainConfig={terrainConfig}
          data={data}
        />

        {/* Markers */}
        <MarkerClusterGroup>
          {renderedPoints.map((point, i) => {
            const typeConfig = getIntelTypeConfig(point.type);
            const isSelected = isSameNode(point, selectedNode);

            return (
              <Marker
                key={point._id || `${point.lat}-${point.lng}-${i}`}
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

      {/* Hover card */}
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
