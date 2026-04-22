import { CORE_INTELLIGENCE_TYPES, getIntelTypeConfig } from "../utils/intelligenceTypes";


function Legend({ count = 0, data = [] }) {
  // Always show all core types in the legend
  const visibleTypes = CORE_INTELLIGENCE_TYPES;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h4 style={{ margin: 0, fontSize: "14px" }}>Visible Types</h4>
        <span style={countStyle}>{count} nodes</span>
      </div>

      {visibleTypes.length === 0 && <div style={emptyStyle}>No visible intelligence</div>}

      {visibleTypes.map((type) => {
        const config = getIntelTypeConfig(type);

        return (
          <div key={type} style={itemStyle}>
            <span style={{ ...dotStyle, background: config.color }} />
            <div>
              <div style={typeCodeStyle}>{config.shortLabel}</div>
              <div style={typeNameStyle}>{config.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

const emptyStyle = {
  fontSize: "12px",
  color: "#8da1b5",
};

export default Legend;
