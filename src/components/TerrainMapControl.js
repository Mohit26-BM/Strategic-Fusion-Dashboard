import { useEffect, useState } from "react";
import { readFileAsDataUrl } from "../utils/fileReaders";

const DEFAULT_TERRAIN_CONFIG = {
  enabled: false,
  imageUrl: "",
  bounds: {
    south: 20.0,
    west: 70.0,
    north: 35.0,
    east: 90.0,
  },
  opacity: 0.9,
  showBaseMap: false,
};

function TerrainMapControl({ value, onChange }) {
  const [formState, setFormState] = useState(value || DEFAULT_TERRAIN_CONFIG);

  useEffect(() => {
    setFormState(value || DEFAULT_TERRAIN_CONFIG);
  }, [value]);

  const handleFieldChange = (field, nextValue) => {
    const nextState = {
      ...formState,
      [field]: nextValue,
    };
    setFormState(nextState);
    onChange(nextState);
  };

  const handleBoundsChange = (field, nextValue) => {
    const parsedValue = nextValue === "" ? "" : parseFloat(nextValue);
    const nextState = {
      ...formState,
      bounds: {
        ...formState.bounds,
        [field]: parsedValue,
      },
    };
    setFormState(nextState);
    onChange(nextState);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];

    if (!file) {
      return;
    }

    const imageUrl = await readFileAsDataUrl(file);
    const nextState = {
      ...formState,
      imageUrl,
      enabled: true,
    };
    setFormState(nextState);
    onChange(nextState);
    e.target.value = "";
  };

  const clearTerrain = () => {
    const nextState = {
      ...DEFAULT_TERRAIN_CONFIG,
      bounds: { ...formState.bounds },
    };
    setFormState(nextState);
    onChange(nextState);
  };

  return (
    <div style={panelStyle}>
      <label style={toggleRowStyle}>
        <input
          type="checkbox"
          checked={Boolean(formState.enabled && formState.imageUrl)}
          onChange={(e) => handleFieldChange("enabled", e.target.checked)}
        />
        <span>Enable overlay</span>
      </label>

      <input
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        onChange={handleImageUpload}
        style={inputStyle}
      />

      <div style={helperTextStyle}>
        Supply the image plus real-world bounds so markers sit on a fixed area of terrain.
      </div>

      <div style={gridStyle}>
        <input
          type="number"
          step="any"
          value={formState.bounds.south}
          placeholder="South"
          onChange={(e) => handleBoundsChange("south", e.target.value)}
          style={inputStyle}
        />
        <input
          type="number"
          step="any"
          value={formState.bounds.west}
          placeholder="West"
          onChange={(e) => handleBoundsChange("west", e.target.value)}
          style={inputStyle}
        />
        <input
          type="number"
          step="any"
          value={formState.bounds.north}
          placeholder="North"
          onChange={(e) => handleBoundsChange("north", e.target.value)}
          style={inputStyle}
        />
        <input
          type="number"
          step="any"
          value={formState.bounds.east}
          placeholder="East"
          onChange={(e) => handleBoundsChange("east", e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={footerRowStyle}>
        <label style={toggleRowStyle}>
          <input
            type="checkbox"
            checked={formState.showBaseMap}
            onChange={(e) => handleFieldChange("showBaseMap", e.target.checked)}
          />
          <span>Show base map</span>
        </label>

        <button type="button" onClick={clearTerrain} style={buttonStyle}>
          Clear
        </button>
      </div>

      <label style={rangeLabelStyle}>
        <span>Overlay opacity</span>
        <span>{Math.round(formState.opacity * 100)}%</span>
      </label>
      <input
        type="range"
        min="0.2"
        max="1"
        step="0.05"
        value={formState.opacity}
        onChange={(e) => handleFieldChange("opacity", parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

const panelStyle = {
  display: "grid",
  gap: "10px",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  background: "#0b141d",
  border: "1px solid rgba(135,163,191,0.16)",
  borderRadius: "10px",
  color: "#edf3f8",
  boxSizing: "border-box",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "8px",
};

const helperTextStyle = {
  fontSize: "12px",
  color: "#8da1b5",
  lineHeight: 1.5,
};

const toggleRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "13px",
  color: "#dbe5ee",
};

const footerRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
};

const rangeLabelStyle = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "13px",
  color: "#c8d1dc",
};

const buttonStyle = {
  background: "transparent",
  color: "#c8d1dc",
  border: "1px solid rgba(135,163,191,0.16)",
  padding: "9px 12px",
  borderRadius: "10px",
  cursor: "pointer",
};

export { DEFAULT_TERRAIN_CONFIG };
export default TerrainMapControl;
