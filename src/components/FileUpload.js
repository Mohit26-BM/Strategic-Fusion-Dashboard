import { useState } from "react";
import Papa from "papaparse";
import {
  parseExcelNodes,
  parseJsonNodes,
  normalizeNodes,
} from "../utils/intelligenceImport";
import {
  readFileAsArrayBuffer,
  readFileAsDataUrl,
  readFileAsText,
} from "../utils/fileReaders";
import { INTELLIGENCE_TYPE_CONFIG } from "../utils/intelligenceTypes";

function FileUpload({ onDataLoaded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [imageMeta, setImageMeta] = useState({
    lat: "",
    lng: "",
    title: "",
    description: "",
    type: "IMINT",
  });

  const resetImageForm = () => {
    setPendingImage(null);
    setImageMeta({
      lat: "",
      lng: "",
      title: "",
      description: "",
      type: "IMINT",
    });
  };

  // 🔥 FINAL CLEAN IMPORT HANDLER
  const completeImport = (nodes, source) => {
    if (!Array.isArray(nodes) || !nodes.length) {
      setError(
        "No valid records were found. Ensure your file contains latitude and longitude columns.",
      );
      return;
    }

    const invalid = nodes.find(
      (n) =>
        n.lat == null ||
        n.lng == null ||
        Number.isNaN(Number(n.lat)) ||
        Number.isNaN(Number(n.lng)),
    );

    if (invalid) {
      setError(
        "Some records are missing valid coordinates. Please check your data.",
      );
      return;
    }

    // ✅ Normalize everything (critical fix)
    const cleaned = nodes.map((n) => ({
      ...n,
      lat: Number(n.lat),
      lng: Number(n.lng),
      type: n.type?.trim().toUpperCase() || "OSINT",
    }));

    setError("");
    onDataLoaded(cleaned, source);
  };

  const processCsvFile = (file) =>
    new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!Array.isArray(results.data)) {
            reject(new Error("CSV format is invalid or empty."));
            return;
          }
          resolve(normalizeNodes(results.data));
        },
        error: () =>
          reject(
            new Error(
              `Failed to parse file: ${file.name}. Please check format.`,
            ),
          ),
      });
    });

  const processStructuredFile = async (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      const nodes = await processCsvFile(file);
      completeImport(nodes, "csv");
      return;
    }

    if (extension === "json") {
      const text = await readFileAsText(file);
      const nodes = parseJsonNodes(text);
      completeImport(nodes, "json");
      return;
    }

    if (extension === "xlsx" || extension === "xls") {
      const data = await readFileAsArrayBuffer(file);
      const nodes = parseExcelNodes(data);
      completeImport(nodes, "excel");
      return;
    }

    throw new Error(
      "Unsupported file type. Only CSV, JSON, XLSX, XLS, or images are allowed.",
    );
  };

  const processImageFile = async (file) => {
    const imageUrl = await readFileAsDataUrl(file);

    setPendingImage({
      image_url: imageUrl,
      fileName: file.name,
    });

    setImageMeta((prev) => ({
      ...prev,
      title: prev.title || file.name.replace(/\.[^.]+$/, ""),
    }));

    setError("");
  };

  const processFile = async (file) => {
    if (!file) {
      setError("No file selected.");
      return;
    }

    setIsProcessing(true);

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (["jpg", "jpeg", "png"].includes(extension)) {
        await processImageFile(file);
      } else {
        await processStructuredFile(file);
      }
    } catch (err) {
      setError(
        err.message ||
          "Unable to import file. Please check the format and try again.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    await processFile(e.dataTransfer.files[0]);
  };

  const handleFile = async (e) => {
    await processFile(e.target.files[0]);
    e.target.value = "";
  };

  const handleImageSubmit = (e) => {
    e.preventDefault();

    const lat = parseFloat(imageMeta.lat);
    const lng = parseFloat(imageMeta.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng) || !imageMeta.title.trim()) {
      setError("Latitude, longitude, and title are required.");
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError("Coordinates out of valid range.");
      return;
    }

    completeImport(
      [
        {
          lat,
          lng,
          type: imageMeta.type?.trim().toUpperCase(),
          title: imageMeta.title.trim(),
          description: imageMeta.description.trim(),
          image_url: pendingImage.image_url,
        },
      ],
      "image",
    );

    resetImageForm();
  };

  return (
    <div style={panelStyle}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          padding: "24px",
          border: `2px dashed ${
            isDragging ? "#4eb6ff" : "rgba(135,163,191,0.22)"
          }`,
          borderRadius: "14px",
          textAlign: "center",
          background: isDragging ? "rgba(28,52,74,0.72)" : "#0b141d",
        }}
      >
        <input
          type="file"
          accept=".csv,.json,.xlsx,.xls,.jpg,.jpeg,.png"
          onChange={handleFile}
          style={{ display: "none" }}
          id="fileInput"
        />

        <label
          htmlFor="fileInput"
          style={{ cursor: "pointer", display: "block" }}
        >
          <h3>Upload Intelligence Data</h3>
          <p>Drag & drop or click to import files</p>
          <p style={helpTextStyle}>
            CSV/JSON/Excel require lat/lng. Images create IMINT nodes.
          </p>

          {isProcessing && <p style={statusStyle}>Processing file...</p>}
        </label>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {pendingImage && (
        <form onSubmit={handleImageSubmit} style={imageFormStyle}>
          <h4>Create IMINT Node</h4>

          <img
            src={pendingImage.image_url}
            alt={pendingImage.fileName}
            style={previewImageStyle}
          />

          <input
            type="text"
            value={imageMeta.title}
            placeholder="Title"
            onChange={(e) =>
              setImageMeta({ ...imageMeta, title: e.target.value })
            }
            style={inputStyle}
          />

          <div style={coordinateGridStyle}>
            <input
              type="number"
              step="any"
              placeholder="Latitude"
              value={imageMeta.lat}
              onChange={(e) =>
                setImageMeta({ ...imageMeta, lat: e.target.value })
              }
              style={inputStyle}
            />
            <input
              type="number"
              step="any"
              placeholder="Longitude"
              value={imageMeta.lng}
              onChange={(e) =>
                setImageMeta({ ...imageMeta, lng: e.target.value })
              }
              style={inputStyle}
            />
          </div>

          <select
            value={imageMeta.type}
            onChange={(e) =>
              setImageMeta({ ...imageMeta, type: e.target.value })
            }
            style={inputStyle}
          >
            {Object.entries(INTELLIGENCE_TYPE_CONFIG).map(([type, config]) => (
              <option key={type} value={type}>
                {config.shortLabel} - {config.label}
              </option>
            ))}
          </select>

          <textarea
            placeholder="Description"
            value={imageMeta.description}
            onChange={(e) =>
              setImageMeta({ ...imageMeta, description: e.target.value })
            }
            style={{ ...inputStyle, minHeight: "90px" }}
          />

          <div style={buttonRowStyle}>
            <button type="submit" style={primaryButtonStyle}>
              Add Image Node
            </button>
            <button
              type="button"
              onClick={resetImageForm}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const panelStyle = {
  display: "grid",
  gap: "12px",
};

const imageFormStyle = {
  background: "#0b141d",
  border: "1px solid rgba(135,163,191,0.16)",
  borderRadius: "14px",
  padding: "12px",
};

const helpTextStyle = {
  fontSize: "12px",
  color: "#8aa0b6",
  marginBottom: "6px",
};

const statusStyle = {
  fontSize: "12px",
  color: "#7cc7ff",
  marginTop: "10px",
};

const errorStyle = {
  background: "rgba(203,43,62,0.15)",
  border: "1px solid rgba(203,43,62,0.45)",
  color: "#ffb3bd",
  padding: "10px",
  borderRadius: "12px",
  fontSize: "13px",
};

const inputStyle = {
  width: "100%",
  padding: "10px",
  borderRadius: "10px",
  border: "1px solid rgba(135,163,191,0.16)",
  background: "#0b141d",
  color: "#edf3f8",
  fontSize: "14px",
  boxSizing: "border-box",
};

const coordinateGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
};

const buttonRowStyle = {
  display: "flex",
  gap: "10px",
};

const primaryButtonStyle = {
  flex: 1,
  background: "linear-gradient(135deg, #1e88d7, #3fb2ff)",
  color: "white",
  border: "none",
  borderRadius: "10px",
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: "bold",
};

const secondaryButtonStyle = {
  flex: 1,
  background: "transparent",
  color: "#c8d1dc",
  border: "1px solid rgba(135,163,191,0.16)",
  borderRadius: "10px",
  padding: "10px 12px",
  cursor: "pointer",
};

const previewImageStyle = {
  width: "100%",
  maxHeight: "180px",
  objectFit: "cover",
  borderRadius: "12px",
  marginBottom: "12px",
};

export default FileUpload;