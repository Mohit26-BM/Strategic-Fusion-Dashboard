import { useRef, useState } from "react";
import Papa from "papaparse";
import { describeSkipped, normalizeCsvRows, parseExcelNodes, parseJsonNodes } from "../utils/intelligenceImport";
import { readFileAsArrayBuffer, readFileAsText } from "../utils/fileReaders";
import { resizeImageFile, validateImageFile } from "../utils/imageResize";
import { INTELLIGENCE_TYPE_CONFIG } from "../utils/intelligenceTypes";

const MAX_TABLE_FILE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

function parseCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.replace(/^﻿/, "").trim(),
      complete: (results) => {
        if (!Array.isArray(results.data)) return reject(new Error("That CSV file is empty or in an unknown format."));
        try {
          resolve(normalizeCsvRows(results.data));
        } catch (err) {
          reject(err);
        }
      },
      error: () => reject(new Error(`Could not read ${file.name}. Is it a CSV file?`)),
    });
  });
}

async function parseTable(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.size > MAX_TABLE_FILE_BYTES) {
    throw new Error(`That file is ${(file.size / 1048576).toFixed(1)} MB; the limit is ${MAX_TABLE_FILE_BYTES / 1048576} MB.`);
  }
  if (extension === "csv") return { ...(await parseCsv(file)), source: "csv" };
  if (extension === "json" || extension === "geojson") return { ...parseJsonNodes(await readFileAsText(file)), source: "json" };
  if (extension === "xlsx" || extension === "xls") return { ...parseExcelNodes(await readFileAsArrayBuffer(file)), source: "excel" };
  throw new Error("Unsupported file type. Use CSV, JSON, GeoJSON, XLSX, XLS or a JPEG / PNG / WebP / GIF image.");
}

/**
 * @param {{ onDataLoaded: (nodes: object[], meta: object, onProgress: (done: number, total: number) => void) => Promise<void> }} props
 */
function FileUpload({ onDataLoaded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pending, setPending] = useState(null); // a parsed file waiting for "Import"
  const [pendingImage, setPendingImage] = useState(null);
  const [progress, setProgress] = useState(null);
  const [imageErrors, setImageErrors] = useState({});
  const [imageMeta, setImageMeta] = useState({ lat: "", lng: "", title: "", description: "", type: "IMINT" });
  const inputRef = useRef(null);

  const resetImageForm = () => {
    setPendingImage(null);
    setImageErrors({});
    setImageMeta({ lat: "", lng: "", title: "", description: "", type: "IMINT" });
  };

  const processFile = async (file) => {
    if (!file) return;
    setError("");
    setPending(null);
    setIsProcessing(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();

      if (IMAGE_EXTENSIONS.includes(extension) || file.type.startsWith("image/")) {
        const problem = validateImageFile(file);
        if (problem) throw new Error(problem);
        const resized = await resizeImageFile(file);
        setPendingImage({ image_url: resized.dataUrl, fileName: file.name, ...resized });
        setImageMeta((prev) => ({ ...prev, title: prev.title || file.name.replace(/\.[^.]+$/, "") }));
        return;
      }

      const result = await parseTable(file);
      if (result.nodes.length === 0) {
        const why = describeSkipped(result.skipped);
        throw new Error(
          result.total === 0
            ? "That file has no rows."
            : `None of the ${result.total} rows could be used. ${why ? `${why}.` : ""} The file needs latitude and longitude columns (for example lat, lng or Latitude, Longitude).`,
        );
      }
      setPending({ ...result, fileName: file.name });
    } catch (err) {
      setError(err.message || "Unable to read that file. Please check the format and try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const runImport = async (nodes, meta) => {
    setError("");
    setProgress({ done: 0, total: nodes.length });
    try {
      await onDataLoaded(nodes, meta, (done, total) => setProgress({ done, total }));
      return true;
    } catch (err) {
      setError(err.message || "The import failed.");
      return false;
    } finally {
      setProgress(null);
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    const ok = await runImport(pending.nodes, {
      source: pending.source,
      fileName: pending.fileName,
      total: pending.total,
      skipped: pending.skipped,
    });
    if (ok) setPending(null);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    await processFile(e.dataTransfer.files?.[0]);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    await processFile(file);
  };

  const submitImage = async (e) => {
    e.preventDefault();
    const errors = {};
    const lat = parseFloat(imageMeta.lat);
    const lng = parseFloat(imageMeta.lng);
    if (!imageMeta.title.trim()) errors.title = "Give the image a title.";
    if (imageMeta.lat === "" || Number.isNaN(lat)) errors.lat = "Latitude is required.";
    else if (lat < -90 || lat > 90) errors.lat = "Latitude must be between -90 and 90.";
    if (imageMeta.lng === "" || Number.isNaN(lng)) errors.lng = "Longitude is required.";
    else if (lng < -180 || lng > 180) errors.lng = "Longitude must be between -180 and 180.";
    setImageErrors(errors);
    if (Object.keys(errors).length) return;

    const ok = await runImport(
      [
        {
          lat,
          lng,
          type: imageMeta.type?.trim().toUpperCase() || "IMINT",
          title: imageMeta.title.trim(),
          description: imageMeta.description.trim(),
          image_url: pendingImage.image_url,
        },
      ],
      { source: "image", fileName: pendingImage.fileName, total: 1, skipped: [] },
    );
    if (ok) resetImageForm();
  };

  const typeCounts = pending
    ? Object.entries(
        pending.nodes.reduce((acc, node) => {
          acc[node.type] = (acc[node.type] || 0) + 1;
          return acc;
        }, {}),
      )
    : [];
  const busy = isProcessing || Boolean(progress);

  return (
    <div className="upload">
      <div
        className={`dropzone ${isDragging ? "is-dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,.geojson,.xlsx,.xls,.jpg,.jpeg,.png,.webp,.gif"
          onChange={handleFile}
          className="visually-hidden"
          id="fileInput"
          disabled={busy}
        />
        <label htmlFor="fileInput" className="dropzone-label">
          <strong>Upload intelligence data</strong>
          <span>Drag a file here or click to choose one</span>
          <span className="hint">CSV, JSON, GeoJSON, Excel: one row per node, with latitude and longitude. Images become IMINT nodes.</span>
          {isProcessing && <span className="status">Reading file…</span>}
        </label>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      {pending && (
        <div className="import-preview" role="region" aria-label="Import preview">
          <h4>Ready to import</h4>
          <p>
            <strong>{pending.nodes.length}</strong> of {pending.total} rows from <em>{pending.fileName}</em>
            {pending.sheet ? ` (sheet "${pending.sheet}")` : ""} can be imported.
          </p>
          {typeCounts.length > 0 && (
            <p className="hint">{typeCounts.map(([type, count]) => `${count} ${type}`).join(" · ")}</p>
          )}
          {pending.skipped.length > 0 && (
            <details className="skipped" open={pending.skipped.length <= 3}>
              <summary>{pending.skipped.length} rows will be skipped</summary>
              <ul>
                {pending.skipped.slice(0, 20).map((s) => (
                  <li key={s.row}>row {s.row}: {s.reason}</li>
                ))}
                {pending.skipped.length > 20 && <li>…and {pending.skipped.length - 20} more</li>}
              </ul>
            </details>
          )}
          {progress && (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <div className="progress-bar" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              <span>Importing {progress.done} / {progress.total}</span>
            </div>
          )}
          <div className="btn-row">
            <button type="button" className="btn-primary" onClick={confirmImport} disabled={busy}>
              {progress ? "Importing…" : `Import ${pending.nodes.length} nodes`}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {pendingImage && (
        <form onSubmit={submitImage} className="import-preview" noValidate>
          <h4>Create IMINT node from image</h4>
          <img src={pendingImage.image_url} alt={pendingImage.fileName} className="image-preview" />
          <p className="hint">
            Resized to {pendingImage.width} × {pendingImage.height} px ({Math.round(pendingImage.bytes / 1024)} KB)
            {pendingImage.originalWidth > pendingImage.width ? ` from ${pendingImage.originalWidth} × ${pendingImage.originalHeight}` : ""}.
          </p>

          <div className="field">
            <label className="field-label" htmlFor="img-title">Title</label>
            <input id="img-title" type="text" value={imageMeta.title} onChange={(e) => setImageMeta({ ...imageMeta, title: e.target.value })} aria-invalid={Boolean(imageErrors.title)} />
            {imageErrors.title && <span className="field-error">{imageErrors.title}</span>}
          </div>

          <div className="field-grid">
            <div className="field">
              <label className="field-label" htmlFor="img-lat">Latitude</label>
              <input id="img-lat" type="number" step="any" value={imageMeta.lat} onChange={(e) => setImageMeta({ ...imageMeta, lat: e.target.value })} aria-invalid={Boolean(imageErrors.lat)} />
              {imageErrors.lat && <span className="field-error">{imageErrors.lat}</span>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="img-lng">Longitude</label>
              <input id="img-lng" type="number" step="any" value={imageMeta.lng} onChange={(e) => setImageMeta({ ...imageMeta, lng: e.target.value })} aria-invalid={Boolean(imageErrors.lng)} />
              {imageErrors.lng && <span className="field-error">{imageErrors.lng}</span>}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="img-type">Type</label>
            <select id="img-type" value={imageMeta.type} onChange={(e) => setImageMeta({ ...imageMeta, type: e.target.value })}>
              {Object.entries(INTELLIGENCE_TYPE_CONFIG).map(([type, config]) => (
                <option key={type} value={type}>{config.shortLabel} - {config.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="img-desc">Description</label>
            <textarea id="img-desc" rows={3} value={imageMeta.description} onChange={(e) => setImageMeta({ ...imageMeta, description: e.target.value })} />
          </div>

          <div className="btn-row">
            <button type="submit" className="btn-primary" disabled={busy}>
              {progress ? "Saving…" : "Add image node"}
            </button>
            <button type="button" className="btn-secondary" onClick={resetImageForm} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default FileUpload;
