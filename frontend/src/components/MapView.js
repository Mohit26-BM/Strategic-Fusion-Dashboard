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

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

function isSameNode(a, b) {
  if (!a || !b) {
    return false;
  }

  if (a._id && b._id) {
    return a._id === b._id;
  }

  return (
    Math.abs(Number(a.lat) - Number(b.lat)) < 0.0001 &&
    Math.abs(Number(a.lng) - Number(b.lng)) < 0.0001 &&
    a.title === b.title &&
    a.type === b.type
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

function FocusController({ focusRequest, terrainConfig, data }) {
  const map = useMap();

  useEffect(() => {
    if (!focusRequest) {
      if (!terrainConfig?.enabled) {
        map.setMaxBounds(null);
      }
      return;
    }

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

    const coords = data
      .filter((node) => Number.isFinite(node.lat) && Number.isFinite(node.lng))
      .map((node) => [node.lat, node.lng]);

    if (!coords.length) {
      return;
    }

    if (coords.length === 1) {
      map.flyTo(coords[0], Math.max(map.getZoom(), 9), {
        animate: true,
        duration: 0.5,
        easeLinearity: 0.5,
      });
      return;
    }

    map.flyToBounds(coords, {
      padding: [60, 60],
      animate: true,
      duration: 0.5,
      easeLinearity: 0.5,
    });
  }, [focusRequest, map, terrainConfig, data]);

  return null;
}

function DossierPopupButton({ point, onNodeClick, color }) {
  return (
    <button
      type="button"
      style={{
        background: color || "#4A90E2",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "15px",
        padding: "9px 14px",
        color: "#fff",
        fontWeight: "600",
        marginBottom: "10px",
        width: "100%",
      }}
      onClick={() => {
        if (typeof onNodeClick === "function") {
          onNodeClick(point);
        }
      }}
    >
      View Dossier
    </button>
  );
}

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
    () => data.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
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
          data={data}
        />

        <MarkerClusterGroup
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={false}
        >
          {renderedPoints.map((point, index) => {
            const typeConfig = getIntelTypeConfig(point.type);
            const isSelected = isSameNode(point, selectedNode);

            return (
              <Marker
                key={point._id || `${point.lat}-${point.lng}-${index}`}
                position={[point.lat, point.lng]}
                icon={markerIcons[point.type] || markerIcons.OSINT}
                eventHandlers={{
                  click: () => {
                    if (typeof onNodeClick === "function") {
                      onNodeClick(point);
                    }
                  },
                  mouseover: () => setHovered(point),
                  mouseout: () => setHovered(null),
                }}
              >
                <Popup autoPan={false}>
                  <div style={{ minWidth: "220px" }}>
                    <DossierPopupButton
                      point={point}
                      onNodeClick={onNodeClick}
                      color={typeConfig.color}
                    />

                    <div
                      style={{
                        background: typeConfig.color,
                        color: "white",
                        padding: "8px",
                        marginBottom: "10px",
                        borderRadius: "6px",
                        fontWeight: "bold",
                      }}
                    >
                      {typeConfig.shortLabel} - {typeConfig.label}
                    </div>

                    <strong>{point.title || "Untitled node"}</strong>
                    <div style={{ marginTop: "6px", fontSize: "13px" }}>
                      {point.description || "No description available."}
                    </div>
                  </div>
                </Popup>

                {isSelected && (
                  <CircleMarker
                    center={[point.lat, point.lng]}
                    radius={18}
                    pathOptions={{
                      color: "#ffffff",
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

      {!renderedPoints.length && (
        <div className="map-empty-state">
          <div className="map-empty-kicker">No visible nodes</div>
          <h3 className="map-empty-title">Your current filters returned nothing</h3>
          <p className="map-empty-copy">
            Clear the search term, change the active type, or import a new dataset.
          </p>
        </div>
      )}

      {hovered && (
        <div className="map-hover-card">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                display: "inline-block",
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                background: getIntelTypeConfig(hovered.type)?.color || "#888",
              }}
            />
            <strong>{hovered.title}</strong>
          </div>

          <div style={{ fontSize: "12px", opacity: 0.82, marginTop: "8px" }}>
            Type: {getIntelTypeConfig(hovered.type)?.shortLabel || hovered.type}
          </div>

          {hovered.description && (
            <div style={{ fontSize: "12px", marginTop: "6px" }}>
              {hovered.description}
            </div>
          )}

          {hovered.image_url && (
            <img
              src={hovered.image_url}
              alt={hovered.title || "preview"}
              style={{
                width: "100%",
                marginTop: "8px",
                borderRadius: "6px",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default MapView;
