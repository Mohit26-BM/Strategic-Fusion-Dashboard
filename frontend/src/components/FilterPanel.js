import { useMemo, useState, useEffect } from "react";

function FilterPanel({ data, onFilter = () => {} }) {
  const [filters, setFilters] = useState({
    type: "all",
    searchTerm: "",
    source: "all",
  });

  const [filteredCount, setFilteredCount] = useState(data.length);

  // Collect unique sources for filtering
  const availableSources = useMemo(() => {
    const sources = Array.from(
      new Set(data.map((d) => d.source).filter(Boolean)),
    );
    return ["all", ...sources];
  }, [data]);

  // Collect unique types for filtering
  const availableTypes = useMemo(() => {
    const types = Array.from(new Set(data.map((d) => d.type).filter(Boolean)));
    return ["all", ...types];
  }, [data]);

  useEffect(() => {
    if (filters.type !== "all" && !availableTypes.includes(filters.type)) {
      setFilters((current) => ({ ...current, type: "all" }));
    }
    if (
      filters.source !== "all" &&
      !availableSources.includes(filters.source)
    ) {
      setFilters((current) => ({ ...current, source: "all" }));
    }
  }, [availableTypes, availableSources, filters.type, filters.source]);

  useEffect(() => {
    let filtered = data;

    if (filters.type !== "all") {
      filtered = filtered.filter((d) => d.type === filters.type);
    }
    if (filters.source !== "all") {
      filtered = filtered.filter((d) => d.source === filters.source);
    }
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.title?.toLowerCase().includes(term) ||
          d.description?.toLowerCase().includes(term),
      );
    }

    setFilteredCount(filtered.length);
    // If only one match, auto-focus/select it
    if (filters.searchTerm.trim() && filtered.length === 1) {
      onFilter(filtered, { shouldFocus: true });
    } else {
      onFilter(filtered);
    }
  }, [filters, data, onFilter]);

  const handleReset = () => {
    setFilters({ type: "all", searchTerm: "", source: "all" });
  };

  return (
    <div style={panelStyle}>
      <h4 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>Filters</h4>

      {/* Type Filter Chips */}
      <div style={chipRowStyle}>
        {availableTypes.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilters({ ...filters, type })}
            style={{
              ...chipStyle,
              ...(filters.type === type ? activeChipStyle : {}),
            }}
          >
            {type === "all" ? "All" : type}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <input
        style={inputStyle}
        type="text"
        placeholder="Search title or description..."
        value={filters.searchTerm}
        onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            let filtered = data;
            if (filters.type !== "all") {
              filtered = filtered.filter((d) => d.type === filters.type);
            }
            if (filters.source !== "all") {
              filtered = filtered.filter((d) => d.source === filters.source);
            }
            if (filters.searchTerm.trim()) {
              const term = filters.searchTerm.toLowerCase();
              filtered = filtered.filter(
                (d) =>
                  d.title?.toLowerCase().includes(term) ||
                  d.description?.toLowerCase().includes(term),
              );
            }
            if (filtered.length > 0) {
              onFilter(filtered, { shouldFocus: true });
            }
          }
        }}
      />

      {/* Source Filter */}
      {availableSources.length > 1 && (
        <select
          style={inputStyle}
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
        >
          {availableSources.map((src) => (
            <option key={src} value={src}>
              {src === "all" ? "All Sources" : src}
            </option>
          ))}
        </select>
      )}

      {/* Summary and Reset */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "10px",
        }}
      >
        <div style={summaryStyle}>
          Showing {filteredCount} of {data.length}
        </div>
        {(filters.type !== "all" ||
          filters.searchTerm ||
          filters.source !== "all") && (
          <button type="button" style={resetButtonStyle} onClick={handleReset}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// Styles defined outside component
const panelStyle = {
  background: "white",
  padding: "15px",
  borderRadius: "6px",
  marginBottom: "15px",
};

const chipRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  marginBottom: "10px",
};

const chipStyle = {
  border: "1px solid #ddd",
  background: "white",
  color: "#666",
  borderRadius: "20px",
  padding: "5px 10px",
  fontSize: "11px",
  cursor: "pointer",
  transition: "all 0.2s",
  fontWeight: "500",
};

const activeChipStyle = {
  background: "#2A81CB",
  borderColor: "#2A81CB",
  color: "white",
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  background: "white",
  border: "1px solid #ddd",
  borderRadius: "4px",
  color: "#333",
  boxSizing: "border-box",
  fontSize: "13px",
};

const summaryStyle = {
  fontSize: "11px",
  color: "#666",
};

const resetButtonStyle = {
  background: "#f5f5f5",
  color: "#333",
  border: "1px solid #ddd",
  borderRadius: "4px",
  padding: "5px 12px",
  fontSize: "11px",
  cursor: "pointer",
  fontWeight: "500",
};

export default FilterPanel;
