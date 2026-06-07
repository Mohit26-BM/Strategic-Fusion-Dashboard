import { useEffect, useState } from "react";
import { INTELLIGENCE_TYPE_CONFIG } from "../utils/intelligenceTypes";

function NotificationDialog({ notification, onClose }) {
  if (!notification) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className={`dialog-card dialog-card--${notification.type || "info"}`} role="status">
        <p className="dialog-kicker">{notification.type || "Notice"}</p>
        <h2 className="dialog-title">{notification.title}</h2>
        {notification.message && (
          <p className="dialog-copy">{notification.message}</p>
        )}
        <div className="dialog-actions">
          <button type="button" className="dialog-button dialog-button--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null;

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <p className="dialog-kicker">Confirm Action</p>
        <h2 id="confirm-title" className="dialog-title">{dialog.title}</h2>
        <p className="dialog-copy">{dialog.message}</p>
        <div className="dialog-actions">
          <button type="button" className="dialog-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="dialog-button dialog-button--danger" onClick={onConfirm}>
            {dialog.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditNodeDialog({ node, onCancel, onSave }) {
  const [form, setForm] = useState(() => getInitialForm(node));

  useEffect(() => {
    setForm(getInitialForm(node));
  }, [node]);

  if (!node) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave({
      ...form,
      lat: Number(form.lat),
      lng: Number(form.lng),
    });
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog-card dialog-card--wide" onSubmit={handleSubmit}>
        <p className="dialog-kicker">Edit Node</p>
        <h2 className="dialog-title">Update intelligence details</h2>

        <label className="dialog-field">
          <span>Title</span>
          <input name="title" value={form.title} onChange={handleChange} required />
        </label>

        <label className="dialog-field">
          <span>Type</span>
          <select name="type" value={form.type} onChange={handleChange} required>
            {Object.entries(INTELLIGENCE_TYPE_CONFIG).map(([key, type]) => (
              <option key={key} value={key}>
                {type.shortLabel} - {type.label}
              </option>
            ))}
          </select>
        </label>

        <div className="dialog-field-grid">
          <label className="dialog-field">
            <span>Latitude</span>
            <input name="lat" type="number" step="any" value={form.lat} onChange={handleChange} required />
          </label>
          <label className="dialog-field">
            <span>Longitude</span>
            <input name="lng" type="number" step="any" value={form.lng} onChange={handleChange} required />
          </label>
        </div>

        <label className="dialog-field">
          <span>Source</span>
          <input name="source" value={form.source} onChange={handleChange} />
        </label>

        <label className="dialog-field">
          <span>Image URL</span>
          <input name="image_url" value={form.image_url} onChange={handleChange} />
        </label>

        <label className="dialog-field">
          <span>Description</span>
          <textarea name="description" rows="4" value={form.description} onChange={handleChange} />
        </label>

        <div className="dialog-actions">
          <button type="button" className="dialog-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="dialog-button dialog-button--primary">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

function getInitialForm(node) {
  return {
    title: node?.title || "",
    type: node?.type || "OSINT",
    lat: node?.lat ?? "",
    lng: node?.lng ?? "",
    source: node?.source || "",
    image_url: node?.image_url || "",
    description: node?.description || "",
  };
}

export { NotificationDialog, ConfirmDialog, EditNodeDialog };
