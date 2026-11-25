import { useEffect, useRef, useState } from "react";
import { INTELLIGENCE_TYPE_CONFIG } from "../utils/intelligenceTypes";

/** Escape closes a dialog, like people expect. */
function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}

/** Moves focus into the dialog when it opens, so keyboard and screen-reader users land in it. */
function useAutoFocus(active) {
  const ref = useRef(null);
  useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  return ref;
}

function NotificationDialog({ notification, onClose }) {
  useEscape(Boolean(notification), onClose);
  const focusRef = useAutoFocus(Boolean(notification));
  if (!notification) return null;
  const isError = notification.type === "error";

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`dialog-card dialog-card--${notification.type || "info"}`}
        role={isError ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="notice-title"
        aria-describedby={notification.message ? "notice-copy" : undefined}
      >
        <p className="dialog-kicker">{notification.type || "Notice"}</p>
        <h2 id="notice-title" className="dialog-title">{notification.title}</h2>
        {notification.message && <p id="notice-copy" className="dialog-copy">{notification.message}</p>}
        {notification.details?.length > 0 && (
          <ul className="dialog-details">
            {notification.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button ref={focusRef} type="button" className="dialog-button dialog-button--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ dialog, onCancel, onConfirm }) {
  useEscape(Boolean(dialog), onCancel);
  const focusRef = useAutoFocus(Boolean(dialog));
  if (!dialog) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-copy">
        <p className="dialog-kicker">Confirm Action</p>
        <h2 id="confirm-title" className="dialog-title">{dialog.title}</h2>
        <p id="confirm-copy" className="dialog-copy">{dialog.message}</p>
        <div className="dialog-actions">
          <button ref={focusRef} type="button" className="dialog-button" onClick={onCancel}>
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

const isEmbeddedImage = (value) => typeof value === "string" && value.startsWith("data:");

function getInitialForm(node) {
  return {
    title: node?.title || "",
    type: node?.type || "OSINT",
    lat: node?.lat ?? "",
    lng: node?.lng ?? "",
    source: node?.source || "",
    // an embedded (uploaded) picture is hundreds of kilobytes of text: do not pour it into a text box
    image_url: isEmbeddedImage(node?.image_url) ? "" : node?.image_url || "",
    description: node?.description || "",
  };
}

/** Only what the person actually changed is sent, so an untouched position is not re-geocoded. */
export function changedFields(node, form) {
  const initial = getInitialForm(node);
  const changes = {};
  for (const key of ["title", "type", "source", "description"]) {
    if (String(form[key]).trim() !== String(initial[key]).trim()) changes[key] = String(form[key]).trim();
  }
  if (Number(form.lat) !== Number(initial.lat) || Number(form.lng) !== Number(initial.lng)) {
    changes.lat = Number(form.lat);
    changes.lng = Number(form.lng);
  }
  if (!isEmbeddedImage(node?.image_url) || form.image_url.trim() !== "") {
    if (form.image_url.trim() !== initial.image_url.trim()) changes.image_url = form.image_url.trim();
  }
  return changes;
}

function EditNodeDialog({ node, onCancel, onSave }) {
  const [form, setForm] = useState(() => getInitialForm(node));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useAutoFocus(Boolean(node));
  useEscape(Boolean(node), onCancel);

  useEffect(() => {
    setForm(getInitialForm(node));
    setError("");
    setSaving(false);
  }, [node]);

  if (!node) return null;

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const types = INTELLIGENCE_TYPE_CONFIG[form.type] ? Object.keys(INTELLIGENCE_TYPE_CONFIG) : [form.type, ...Object.keys(INTELLIGENCE_TYPE_CONFIG)];

  const handleSubmit = async (event) => {
    event.preventDefault();
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (form.lat === "" || form.lng === "" || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError("Latitude must be between -90 and 90 and longitude between -180 and 180.");
      return;
    }
    if (!form.title.trim()) {
      setError("The title cannot be empty.");
      return;
    }
    const changes = changedFields(node, form);
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave(changes);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="dialog-card dialog-card--wide" role="dialog" aria-modal="true" aria-labelledby="edit-title" onSubmit={handleSubmit} noValidate>
        <p className="dialog-kicker">Edit Node</p>
        <h2 id="edit-title" className="dialog-title">Update intelligence details</h2>

        <label className="dialog-field">
          <span>Title</span>
          <input ref={titleRef} name="title" value={form.title} onChange={handleChange} maxLength={200} />
        </label>

        <label className="dialog-field">
          <span>Type</span>
          <select name="type" value={form.type} onChange={handleChange}>
            {types.map((key) => {
              const known = INTELLIGENCE_TYPE_CONFIG[key];
              return (
                <option key={key} value={key}>
                  {known ? `${known.shortLabel} - ${known.label}` : key}
                </option>
              );
            })}
          </select>
        </label>

        <div className="dialog-field-grid">
          <label className="dialog-field">
            <span>Latitude</span>
            <input name="lat" type="number" step="any" value={form.lat} onChange={handleChange} />
          </label>
          <label className="dialog-field">
            <span>Longitude</span>
            <input name="lng" type="number" step="any" value={form.lng} onChange={handleChange} />
          </label>
        </div>

        <label className="dialog-field">
          <span>Source</span>
          <input name="source" value={form.source} onChange={handleChange} maxLength={100} />
        </label>

        <label className="dialog-field">
          <span>Image URL</span>
          <input
            name="image_url"
            value={form.image_url}
            onChange={handleChange}
            placeholder={isEmbeddedImage(node.image_url) ? "Uploaded image (leave empty to keep it)" : "https://…"}
          />
        </label>

        <label className="dialog-field">
          <span>Description</span>
          <textarea name="description" rows="4" value={form.description} onChange={handleChange} maxLength={5000} />
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="dialog-button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="dialog-button dialog-button--primary" disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

export { NotificationDialog, ConfirmDialog, EditNodeDialog };
