import { getIntelTypeConfig } from "../utils/intelligenceTypes";

function IntelligencePanel({
  node,
  visibleCount = 0,
  source = "none",
  onEdit = () => {},
  onDelete = () => {},
}) {
  // --------------------
  // EMPTY STATE
  // --------------------
  if (!node) {
    return (
      <div className="dossier-panel">
        <div className="dossier-empty">
          <div className="dossier-empty-kicker">No active dossier</div>
          <h3 className="dossier-title">Select a node on the map</h3>
          <p className="dossier-empty-copy">
            Hover gives a quick peek. Clicking a marker opens a fuller dossier
            here without interrupting the map view.
          </p>

          <div className="dossier-stat-grid">
            <div className="dossier-stat-card">
              <span className="dossier-stat-label">Visible Nodes</span>
              <span className="dossier-stat-value">{visibleCount}</span>
            </div>
            <div className="dossier-stat-card">
              <span className="dossier-stat-label">Source</span>
              <span className="dossier-stat-value dossier-stat-value--small">
                {source?.toUpperCase?.() || "UNKNOWN"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --------------------
  // SAFE TYPE CONFIG
  // --------------------
  const typeConfig = getIntelTypeConfig(node.type) || {
    color: "#888",
    shortLabel: node.type || "UNK",
    label: node.type || "Unknown",
  };

  // --------------------
  // SAFE COORDINATES
  // --------------------
  const safeLat = Number.isFinite(Number(node.lat))
    ? Number(node.lat).toFixed(4)
    : "N/A";

  const safeLng = Number.isFinite(Number(node.lng))
    ? Number(node.lng).toFixed(4)
    : "N/A";

  return (
    <div className="dossier-panel">
      {/* TYPE */}
      <div
        className="dossier-type-pill"
        style={{ background: typeConfig.color }}
      >
        {typeConfig.shortLabel} - {typeConfig.label}
      </div>

      {/* TITLE */}
      <h3 className="dossier-title">
        {node.title || "Untitled Intelligence Node"}
      </h3>

      <div className="dossier-action-row">
        <button
          type="button"
          className="dossier-action-button"
          onClick={() => onEdit(node)}
        >
          Edit Details
        </button>
        <button
          type="button"
          className="dossier-action-button dossier-action-button--danger"
          onClick={() => onDelete(node)}
        >
          Delete Node
        </button>
      </div>

      {/* COORDINATES */}
      <div className="dossier-meta-grid">
        <div className="dossier-meta-card">
          <span className="dossier-meta-label">Latitude</span>
          <span className="dossier-meta-value">{safeLat}</span>
        </div>
        <div className="dossier-meta-card">
          <span className="dossier-meta-label">Longitude</span>
          <span className="dossier-meta-value">{safeLng}</span>
        </div>
      </div>

      {/* DESCRIPTION */}
      <div className="dossier-section">
        <div className="dossier-section-label">Description</div>
        <p className="dossier-description">
          {node.description?.trim() ||
            "No description provided for this intelligence node."}
        </p>
      </div>

      {/* IMAGE */}
      {node.image_url ? (
        <div className="dossier-section">
          <div className="dossier-section-label">Imagery</div>
          <img
            src={node.image_url}
            alt={node.title || "Intelligence imagery"}
            className="dossier-image"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        </div>
      ) : (
        <div className="dossier-imagery-empty">
          No linked imagery for this node.
        </div>
      )}
    </div>
  );
}

export default IntelligencePanel;
