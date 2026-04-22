import { CORE_INTELLIGENCE_TYPES, getIntelTypeConfig } from "../utils/intelligenceTypes";

function Legend({ count = 0, data = [] }) {
  // ✅ Dynamic visible types based on filtered data
  const visibleTypes =
    data.length > 0
      ? [...new Set(data.map((d) => d.type).filter(Boolean))]
      : CORE_INTELLIGENCE_TYPES;

  // ✅ Count per type (nice UX improvement)
  const typeCounts = data.reduce((acc, item) => {
    const type = item.type;
    if (!type) return acc;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h4 style={{ margin: 0, fontSize: "14px" }}>Visible Types</h4>
        <span style={countStyle}>{count} nodes</span>
      </div>

      {visibleTypes.length === 0 && (
        <div style={emptyStyle}>No visible intelligence</div>
      )}

      {visibleTypes.map((type) => {
        // ✅ Safe fallback (prevents crash)
        const config = getIntelTypeConfig(type) || {
          color: "#888",
          shortLabel: type,
          label: type,
        };

        return (
          <div key={type} style={itemStyle}>
            <span style={{ ...dotStyle, background: config.color }} />

            <div style={{ flex: 1 }}>
              <div style={typeCodeStyle}>{config.shortLabel}</div>
              <div style={typeNameStyle}>{config.label}</div>
            </div>

            {/* ✅ Count badge */}
            {typeCounts[type] !== undefined && (
              <span style={badgeStyle}>{typeCounts[type]}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --------------------
// Styles
// --------------------
const containerStyle = {
  width: "220px",
  background: "rgba(7,16,24,0.86)",
  color: "white",
  padding: "12px",
  borderRadius: "14px",
  border: "1px solid rgba(135,163,191,0.14)",
  backdropFilter: "blur(16px)",
  fontSize: "13px",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "10px",
};

const countStyle = {
  fontSize: "11px",
  color: "#8da1b5",
};

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "8px",
};

const dotStyle = {
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  flexShrink: 0,
};

const typeCodeStyle = {
  fontSize: "12px",
  fontWeight: 700,
};

const typeNameStyle = {
  fontSize: "11px",
  color: "#8da1b5",
};

const badgeStyle = {
  fontSize: "11px",
  background: "rgba(135,163,191,0.2)",
  padding: "2px 6px",
  borderRadius: "6px",
};

const emptyStyle = {
  fontSize: "12px",
  color: "#8da1b5",
};

export default Legend;
