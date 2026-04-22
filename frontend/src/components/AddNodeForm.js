import { useState } from "react";
import { INTELLIGENCE_TYPE_CONFIG } from "../utils/intelligenceTypes";

function AddNodeForm({ onAdd }) {
  const [formData, setFormData] = useState({
    lat: "",
    lng: "",
    type: "OSINT",
    title: "",
    description: "",
    image_url: "",
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    const lat = parseFloat(formData.lat);
    const lng = parseFloat(formData.lng);
    const title = formData.title.trim();

    // ✅ Better validation feedback
    if (Number.isNaN(lat) || Number.isNaN(lng) || !title) {
      alert("Please enter valid latitude, longitude, and title");
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert("Coordinates must be within valid ranges");
      return;
    }

    onAdd({
      ...formData,
      title,
      description: formData.description.trim() || "",

      // 🔥 IMPORTANT FIX (prevents filter bugs)
      type: formData.type?.trim().toUpperCase(),

      lat,
      lng,
    });

    // Reset form
    setFormData({
      lat: "",
      lng: "",
      type: "OSINT",
      title: "",
      description: "",
      image_url: "",
    });
  };

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <div style={gridStyle}>
        <input
          type="number"
          step="any"
          placeholder="Latitude"
          value={formData.lat}
          onChange={(e) =>
            setFormData({ ...formData, lat: e.target.value })
          }
          required
          style={inputStyle}
        />

        <input
          type="number"
          step="any"
          placeholder="Longitude"
          value={formData.lng}
          onChange={(e) =>
            setFormData({ ...formData, lng: e.target.value })
          }
          required
          style={inputStyle}
        />
      </div>

      <select
        value={formData.type}
        onChange={(e) =>
          setFormData({ ...formData, type: e.target.value })
        }
        style={inputStyle}
      >
        {Object.entries(INTELLIGENCE_TYPE_CONFIG).map(([type, config]) => (
          <option key={type} value={type}>
            {config.shortLabel} - {config.label}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Title"
        value={formData.title}
        onChange={(e) =>
          setFormData({ ...formData, title: e.target.value })
        }
        required
        style={inputStyle}
      />

      <textarea
        placeholder="Description"
        value={formData.description}
        onChange={(e) =>
          setFormData({
            ...formData,
            description: e.target.value,
          })
        }
        style={{ ...inputStyle, minHeight: "88px", resize: "vertical" }}
      />

      <input
        type="url"
        placeholder="Image URL (optional)"
        value={formData.image_url}
        onChange={(e) =>
          setFormData({
            ...formData,
            image_url: e.target.value,
          })
        }
        style={inputStyle}
      />

      <div style={helperTextStyle}>
        Local image uploads now live in the Ingestion panel to avoid duplicate controls.
      </div>

      <button type="submit" style={buttonStyle}>
        Add Node
      </button>
    </form>
  );
}

// Styles
const formStyle = {
  display: "grid",
  gap: "10px",
};

const inputStyle = {
  padding: "10px 12px",
  border: "1px solid rgba(135,163,191,0.16)",
  borderRadius: "10px",
  fontSize: "14px",
  width: "100%",
  background: "#0b141d",
  color: "#edf3f8",
  boxSizing: "border-box",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
};

const helperTextStyle = {
  fontSize: "12px",
  color: "#8da1b5",
  lineHeight: 1.5,
};

const buttonStyle = {
  background: "linear-gradient(135deg, #1e88d7, #3fb2ff)",
  color: "white",
  border: "none",
  padding: "12px",
  borderRadius: "10px",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: "bold",
};

export default AddNodeForm;
