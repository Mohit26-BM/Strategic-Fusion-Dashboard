import { useEffect, useMemo, useRef, useState } from "react";
import { prepareTerrainImage } from "../utils/imageResize";
import {
  DEFAULT_TERRAIN_CONFIG,
  boundsFromNodes,
  compareAspect,
  countOutsideBounds,
  expandToAspect,
  validateBounds,
} from "../utils/terrain";

const FIELDS = [
  { key: "north", label: "North", hint: "top edge, latitude" },
  { key: "south", label: "South", hint: "bottom edge, latitude" },
  { key: "west", label: "West", hint: "left edge, longitude" },
  { key: "east", label: "East", hint: "right edge, longitude" },
];

const toText = (bounds) => ({
  north: String(bounds.north),
  south: String(bounds.south),
  west: String(bounds.west),
  east: String(bounds.east),
});

/**
 * Terrain setup: a picture placed on the map between four real-world edges.
 * @param {{ value: object, onChange: (config: object) => void, nodes?: object[], saveWarning?: string }} props
 */
function TerrainMapControl({ value, onChange, nodes = [], saveWarning = "" }) {
  const config = value || DEFAULT_TERRAIN_CONFIG;
  const [text, setText] = useState(() => toText(config.bounds));
  const [uploadError, setUploadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageSize, setImageSize] = useState(null);
  const fileInput = useRef(null);

  // follow changes that did not come from typing here (loading a saved overlay, "fit to nodes")
  const lastSent = useRef(config.bounds);
  useEffect(() => {
    if (config.bounds !== lastSent.current) {
      lastSent.current = config.bounds;
      setText(toText(config.bounds));
    }
  }, [config.bounds]);

  // the picture's own size is needed to warn about a stretched overlay
  useEffect(() => {
    if (!config.imageUrl) {
      setImageSize(null);
      return undefined;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => !cancelled && setImageSize(null);
    img.src = config.imageUrl;
    return () => {
      cancelled = true;
    };
  }, [config.imageUrl]);

  const validation = useMemo(() => validateBounds(text), [text]);
  const active = Boolean(config.enabled && config.imageUrl);

  const aspect = useMemo(
    () => (imageSize && validation.ok ? compareAspect(imageSize.width, imageSize.height, validation.bounds) : null),
    [imageSize, validation],
  );
  const outside = useMemo(
    () => (active && validation.ok ? countOutsideBounds(nodes, validation.bounds) : 0),
    [active, validation, nodes],
  );

  const push = (next) => {
    lastSent.current = next.bounds;
    onChange(next);
  };

  const handleBound = (key, raw) => {
    const nextText = { ...text, [key]: raw };
    setText(nextText);
    const result = validateBounds(nextText);
    // the map only ever receives a complete, valid set of edges; while a box is empty or wrong the last good ones stay
    if (result.ok) push({ ...config, bounds: result.bounds });
  };

  const handleImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError("");
    setBusy(true);
    try {
      const { dataUrl } = await prepareTerrainImage(file);
      push({ ...config, imageUrl: dataUrl, enabled: true });
    } catch (err) {
      setUploadError(err.message || "That image could not be used.");
    } finally {
      setBusy(false);
    }
  };

  const removeImage = () => {
    setUploadError("");
    push({ ...config, imageUrl: "", enabled: false });
  };

  const fitToNodes = () => {
    let fitted = boundsFromNodes(nodes);
    if (!fitted) return;
    // when a picture is loaded, give the area the picture's shape so it is not stretched
    if (imageSize) fitted = expandToAspect(fitted, imageSize.width / imageSize.height);
    setText(toText(fitted));
    push({ ...config, bounds: fitted });
  };

  const stretchWarning = aspect?.stretched
    ? `The picture is ${Math.round(aspect.imageRatio * 100) / 100}:1 but the area is ${Math.round(aspect.areaRatio * 100) / 100}:1, so it will look stretched by about ${aspect.stretchPercent}%. Adjust the edges to match the picture's shape.`
    : "";

  return (
    <div className="terrain">
      <label className="check-row">
        <input
          type="checkbox"
          checked={active}
          disabled={!config.imageUrl}
          onChange={(e) => push({ ...config, enabled: e.target.checked })}
        />
        <span>Show terrain overlay</span>
      </label>

      <div className="field">
        <span className="field-label">Terrain image</span>
        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? "Reading…" : config.imageUrl ? "Replace image" : "Choose image"}
          </button>
          {config.imageUrl && (
            <button type="button" className="btn-secondary" onClick={removeImage}>
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleImage}
          className="visually-hidden"
          aria-label="Terrain image file"
          data-testid="terrain-file"
        />
        {imageSize && (
          <span className="hint">
            Image: {imageSize.width} × {imageSize.height} px. Saved in this browser, so it is still here after a reload.
          </span>
        )}
        {!config.imageUrl && <span className="hint">JPEG, PNG or WebP, up to 15 MB. A map, satellite picture or floor plan.</span>}
      </div>
      {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
      {saveWarning && <p className="form-warning" role="status">{saveWarning}</p>}

      <fieldset className="bounds">
        <legend>Where the picture sits (degrees)</legend>
        <div className="field-grid">
          {FIELDS.map(({ key, label, hint }) => (
            <div className="field" key={key}>
              <label className="field-label" htmlFor={`terrain-${key}`}>
                {label} <span className="field-hint">{hint}</span>
              </label>
              <input
                id={`terrain-${key}`}
                type="number"
                step="any"
                inputMode="decimal"
                value={text[key]}
                onChange={(e) => handleBound(key, e.target.value)}
                aria-invalid={Boolean(validation.errors[key])}
                aria-describedby={validation.errors[key] ? `terrain-${key}-error` : undefined}
              />
              {validation.errors[key] && (
                <span id={`terrain-${key}-error`} className="field-error">
                  {validation.errors[key]}
                </span>
              )}
            </div>
          ))}
        </div>
        {!validation.ok && <p className="form-warning">The overlay keeps its last valid position until all four edges are correct.</p>}
        {stretchWarning && <p className="form-warning" role="status">{stretchWarning}</p>}
        {outside > 0 && (
          <p className="form-warning" role="status">
            {outside} of {nodes.length} nodes are outside this area. While the overlay is on, the map is limited to the area, so they cannot be reached.
          </p>
        )}
        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={fitToNodes} disabled={nodes.length === 0}>
            Fit area to my nodes
          </button>
        </div>
      </fieldset>

      <label className="check-row">
        <input type="checkbox" checked={config.showBaseMap} onChange={(e) => push({ ...config, showBaseMap: e.target.checked })} />
        <span>Also show the street map underneath</span>
      </label>

      <label className="range-row" htmlFor="terrain-opacity">
        <span>Overlay opacity</span>
        <span>{Math.round(config.opacity * 100)}%</span>
      </label>
      <input
        id="terrain-opacity"
        type="range"
        min="0.2"
        max="1"
        step="0.05"
        value={config.opacity}
        onChange={(e) => push({ ...config, opacity: parseFloat(e.target.value) })}
      />
    </div>
  );
}

export { DEFAULT_TERRAIN_CONFIG };
export default TerrainMapControl;
