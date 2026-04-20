import L from "leaflet";
import { INTELLIGENCE_TYPE_CONFIG } from "./intelligenceTypes";

function buildIcon(markerColor) {
  const colorSegment = markerColor === "grey" ? "grey" : markerColor;

  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${colorSegment}.png`,
    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

export const markerIcons = Object.fromEntries(
  Object.entries(INTELLIGENCE_TYPE_CONFIG).map(([type, config]) => [
    type,
    buildIcon(config.markerColor),
  ]),
);
