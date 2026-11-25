import { useState } from "react";
import { INTELLIGENCE_TYPE_CONFIG } from "../utils/intelligenceTypes";

const EMPTY = { lat: "", lng: "", type: "OSINT", title: "", description: "", image_url: "" };

export function validateNodeForm(form) {
  const errors = {};
  const lat = Number(form.lat);
  const lng = Number(form.lng);
  if (!form.title.trim()) errors.title = "Give the node a title.";
  if (form.lat === "" || !Number.isFinite(lat)) errors.lat = "Latitude is required.";
  else if (lat < -90 || lat > 90) errors.lat = "Latitude must be between -90 and 90.";
  if (form.lng === "" || !Number.isFinite(lng)) errors.lng = "Longitude is required.";
  else if (lng < -180 || lng > 180) errors.lng = "Longitude must be between -180 and 180.";
  if (form.image_url.trim() && !/^https?:\/\//i.test(form.image_url.trim())) errors.image_url = "The image link must start with http:// or https://";
  return errors;
}

/** @param {{ onAdd: (node: object) => Promise<boolean|void> | boolean | void }} props */
function AddNodeForm({ onAdd }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((current) => ({ ...current, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const found = validateNodeForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const saved = await onAdd({
        lat: Number(form.lat),
        lng: Number(form.lng),
        type: form.type.trim().toUpperCase(),
        title: form.title.trim(),
        description: form.description.trim(),
        image_url: form.image_url.trim(),
      });
      if (saved !== false) setForm(EMPTY); // keep what was typed when saving failed, so nothing has to be retyped
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="node-form" noValidate>
      <div className="field-grid">
        <div className="field">
          <label className="field-label" htmlFor="node-lat">Latitude</label>
          <input id="node-lat" type="number" step="any" inputMode="decimal" value={form.lat} onChange={set("lat")} aria-invalid={Boolean(errors.lat)} placeholder="e.g. 28.6139" />
          {errors.lat && <span className="field-error">{errors.lat}</span>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="node-lng">Longitude</label>
          <input id="node-lng" type="number" step="any" inputMode="decimal" value={form.lng} onChange={set("lng")} aria-invalid={Boolean(errors.lng)} placeholder="e.g. 77.2090" />
          {errors.lng && <span className="field-error">{errors.lng}</span>}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="node-type">Type</label>
        <select id="node-type" value={form.type} onChange={set("type")}>
          {Object.entries(INTELLIGENCE_TYPE_CONFIG).map(([type, config]) => (
            <option key={type} value={type}>
              {config.shortLabel} - {config.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="node-title">Title</label>
        <input id="node-title" type="text" value={form.title} onChange={set("title")} maxLength={200} aria-invalid={Boolean(errors.title)} />
        {errors.title && <span className="field-error">{errors.title}</span>}
      </div>

      <div className="field">
        <label className="field-label" htmlFor="node-desc">Description <span className="field-hint">optional</span></label>
        <textarea id="node-desc" rows={3} value={form.description} onChange={set("description")} maxLength={5000} />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="node-image">Image link <span className="field-hint">optional</span></label>
        <input id="node-image" type="url" value={form.image_url} onChange={set("image_url")} placeholder="https://…" aria-invalid={Boolean(errors.image_url)} />
        {errors.image_url && <span className="field-error">{errors.image_url}</span>}
        <span className="hint">To upload a picture from your computer, use the Ingestion panel.</span>
      </div>

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? "Saving…" : "Add node"}
      </button>
    </form>
  );
}

export default AddNodeForm;
