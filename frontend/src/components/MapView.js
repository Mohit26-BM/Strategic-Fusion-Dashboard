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
  // Prefer _id if present
  if (a._id && b._id) return a._id === b._id;
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
    if (
      focusRequest.mode === "single" &&
      Number.isFinite(focusRequest.lat) &&
      Number.isFinite(focusRequest.lng)
    ) {
      map.flyTo(
        [focusRequest.lat, focusRequest.lng],
        Math.max(map.getZoom(), 9),
        { animate: true, duration: 0.5, easeLinearity: 0.5 },
      );
      return;
    }

    // Otherwise, focus on all filtered nodes
    const coords = data
      .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lng))
      .map((n) => [n.lat, n.lng]);

    if (!coords.length) return;

    if (coords.length === 1) {
      map.flyTo(coords[0], Math.max(map.getZoom(), 9), {
        animate: true,
        duration: 0.5,
        easeLinearity: 0.5,
      });
    } else {
      map.flyToBounds(coords, {
        padding: [60, 60],
        animate: true,
        duration: 0.5,
        easeLinearity: 0.5,
      });
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
        <MarkerClusterGroup
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
        >
          {renderedPoints.map((point, i) => {
            const typeConfig = getIntelTypeConfig(point.type);
            const isSelected = isSameNode(point, selectedNode);

            return (
              <Marker
                key={point._id || `${point.lat}-${point.lng}-${i}`}
                position={[point.lat, point.lng]}
                icon={markerIcons[point.type] || markerIcons.OSINT}
                eventHandlers={{
                  click: (e) => {
                    console.log("🔥 MARKER CLICKED (LEAFLET):", point);

                    if (typeof onNodeClick === "function") {
                      onNodeClick({ ...point, _timestamp: Date.now() });
                    }

                    // prevent cluster swallowing event
                    e.originalEvent?.stopPropagation?.();
                  },
                  mouseover: () => setHovered(point),
                  mouseout: () => setHovered(null),
                }}
              >
                <Popup>
                  <div style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      style={{
                        background: typeConfig.color || "#4A90E2",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "16px",
                        padding: "8px 16px",
                        color: "#fff",
                        fontWeight: "600",
                        marginBottom: "8px",
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        transition: "all 0.2s",
                      }}
                      title="Open full dossier"
                      tabIndex={0}
                      onClick={function (e) {
                        console.log("🟢 BUTTON CLICKED:", point);

                        if (typeof onNodeClick === "function") {
                          const updated = { ...point, _timestamp: Date.now() };
                          console.log("➡️ BUTTON SENDING:", updated);
                          onNodeClick(updated);
                        }

                        var popup = e.target.closest(".leaflet-popup");
                        if (popup) {
                          var closeBtn = popup.querySelector(
                            ".leaflet-popup-close-button",
                          );
                          if (closeBtn) closeBtn.click();
                        }
                      }}
                      onMouseOver={(e) => {
                        e.target.style.transform = "scale(1.05)";
                        e.target.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
                      }}
                      onMouseOut={(e) => {
                        e.target.style.transform = "scale(1)";
                        e.target.style.boxShadow = "none";
                      }}
                    >
                      <span role="img" aria-label="navigation">
                        🧭
                      </span>
                      <span>View Dossier</span>
                    </button>
                  </div>
                  <b>{point.title}</b>
                  <br />
                  {point.description}
                </Popup>
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
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>

      {/* Hover card */}
      {hovered && (
        <div
          className="map-hover-card"
          style={{
            borderLeft: `6px solid ${getIntelTypeConfig(hovered.type)?.color || "#888"}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Type color dot and label */}
            <span
              style={{
                display: "inline-block",
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: getIntelTypeConfig(hovered.type)?.color || "#888",
                marginRight: 6,
              }}
            />
            <strong>{hovered.title}</strong>
            <span
              style={{
                background: getIntelTypeConfig(hovered.type)?.color || "#888",
                color: "#fff",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                marginLeft: 6,
              }}
            >
              {getIntelTypeConfig(hovered.type)?.shortLabel || hovered.type}
            </span>
          </div>
          <div style={{ fontSize: 13, margin: "6px 0" }}>
            {hovered.description}
          </div>
          {hovered.image_url && (
            <img
              src={hovered.image_url}
              alt={hovered.title}
              style={{
                maxWidth: 180,
                maxHeight: 90,
                borderRadius: 8,
                marginTop: 6,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default MapView;
