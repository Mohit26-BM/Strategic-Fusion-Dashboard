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
import { isTerrainActive } from "../utils/terrain";

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

function TerrainViewport({ terrainConfig }) {
  const map = useMap();
  const enabled = isTerrainActive(terrainConfig);
  const { south, west, north, east } = terrainConfig?.bounds || {};

  // depends on the four edges only, so moving the opacity slider does not re-fit (and reset) the map each time
  useEffect(() => {
    if (!enabled) {
      map.setMaxBounds(null);
      return;
    }

    const bounds = [
      [south, west],
      [north, east],
    ];

    map.fitBounds(bounds, { padding: [30, 30] });
    map.setMaxBounds(bounds);
  }, [map, enabled, south, west, north, east]);

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

function DossierPopupButton({ point, onSelectNode, color }) {
  const handlePress = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectNode(point);
  };

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
      onMouseDown={handlePress}
      onPointerDown={handlePress}
      onClick={handlePress}
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
  status = "ready",
  totalCount = 0,
}) {
  const [hovered, setHovered] = useState(null);

  const handleSelectNode = (point) => {
    if (typeof onNodeClick === "function") {
      onNodeClick({ ...point, _selectedAt: Date.now() });
    }
  };

  // the overlay is only drawn with an image, switched on, AND valid edges (bad bounds would make Leaflet throw)
  const terrainEnabled = isTerrainActive(terrainConfig);

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

            return (
              <Marker
                key={point._id || `${point.lat}-${point.lng}-${index}`}
                position={[point.lat, point.lng]}
                icon={markerIcons[point.type] || markerIcons.OSINT}
                riseOnHover={true}
                bubblingMouseEvents={false}
                eventHandlers={{
                  mousedown: () => handleSelectNode(point),
                  touchstart: () => handleSelectNode(point),
                  click: () => handleSelectNode(point),
                  popupopen: () => handleSelectNode(point),
                  mouseover: () => setHovered(point),
                  mouseout: () => setHovered(null),
                }}
              >
                <Popup autoPan={false}>
                  <div style={{ minWidth: "220px" }}>
                    <DossierPopupButton
                      point={point}
                      onSelectNode={handleSelectNode}
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

              </Marker>
            );
          })}
        </MarkerClusterGroup>

        {selectedNode &&
          Number.isFinite(selectedNode.lat) &&
          Number.isFinite(selectedNode.lng) && (
            <CircleMarker
              center={[selectedNode.lat, selectedNode.lng]}
              radius={18}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: getIntelTypeConfig(selectedNode.type).color,
                fillOpacity: 0.2,
              }}
            />
          )}
      </MapContainer>

      {status === "loading" && !renderedPoints.length && (
        <div className="map-empty-state" role="status">
          <div className="map-empty-kicker">Loading</div>
          <h3 className="map-empty-title">Loading intelligence nodes…</h3>
          <p className="map-empty-copy">
            If the server was idle this can take up to a minute while it wakes up.
          </p>
        </div>
      )}

      {status === "ready" && !renderedPoints.length && totalCount === 0 && (
        <div className="map-empty-state">
          <div className="map-empty-kicker">Nothing here yet</div>
          <h3 className="map-empty-title">There are no intelligence nodes</h3>
          <p className="map-empty-copy">
            Unlock editing, then import a CSV, JSON or Excel file, upload an image, or add a node by hand.
          </p>
        </div>
      )}

      {status === "ready" && !renderedPoints.length && totalCount > 0 && (
        <div className="map-empty-state">
          <div className="map-empty-kicker">No visible nodes</div>
          <h3 className="map-empty-title">Your current filters returned nothing</h3>
          <p className="map-empty-copy">
            Clear the search term or change the active type to see the {totalCount} nodes again.
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
