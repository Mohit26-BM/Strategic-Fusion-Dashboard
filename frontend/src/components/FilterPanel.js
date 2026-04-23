import { useMemo, useState, useEffect } from "react";

function FilterPanel({ data, onFilter = () => {} }) {
  const [filters, setFilters] = useState({
    type: "all",
    searchTerm: "",
    source: "all",
  });

  const [filteredCount, setFilteredCount] = useState(data.length);

  // Available sources
  const availableSources = useMemo(() => {
    const sources = Array.from(
      new Set(data.map((d) => d.source).filter(Boolean)),
    );
    return ["all", ...sources];
  }, [data]);

  // Available types
  const availableTypes = useMemo(() => {
    const types = Array.from(new Set(data.map((d) => d.type).filter(Boolean)));
    return ["all", ...types];
  }, [data]);

  // Keep filters valid
  useEffect(() => {
    if (filters.type !== "all" && !availableTypes.includes(filters.type)) {
      setFilters((prev) => ({ ...prev, type: "all" }));
    }

    if (
      filters.source !== "all" &&
      !availableSources.includes(filters.source)
    ) {
      setFilters((prev) => ({ ...prev, source: "all" }));
    }
  }, [availableTypes, availableSources, filters.type, filters.source]);

  // 🔥 MAIN EFFECT (ONLY SEND FILTER STATE)
  useEffect(() => {
    onFilter(null, {
      search: filters.searchTerm,
      activeType: filters.type,
      activeSource: filters.source,
    });

    // Only for UI count
    let filtered = data;

    if (filters.type !== "all") {
      filtered = filtered.filter(
        (d) =>
          d.type?.trim().toUpperCase() === filters.type.trim().toUpperCase(),
      );
    }

    if (filters.source !== "all") {
      filtered = filtered.filter((d) => d.source === filters.source);
    }

    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.title?.toLowerCase().includes(term) ||
          d.description?.toLowerCase().includes(term) ||
          d.city?.toLowerCase().includes(term)
      );
    }

    setFilteredCount(filtered.length);

    // Auto-focus case
    if (filters.searchTerm.trim() && filtered.length === 1) {
      onFilter(null, {
        shouldFocus: true,
        search: filters.searchTerm,
        activeType: filters.type,
        activeSource: filters.source,
        focusNode: filtered[0],
      });
    }
  }, [filters, data, onFilter]);

  const handleReset = () => {
    setFilters({ type: "all", searchTerm: "", source: "all" });
  };

  return (
    <div style={panelStyle}>
      <h4 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>Filters</h4>

      {/* Type Chips */}
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

      {/* Search */}
      <input
        style={inputStyle}
        type="text"
        placeholder="Search title or description..."
        value={filters.searchTerm}
        onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
      />

      {/* Source */}
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

      {/* Summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 10,
        }}
      >
        <div style={summaryStyle}>
          Showing {filteredCount} of {data.length}
        </div>

        {(filters.type !== "all" ||
          filters.searchTerm ||
          filters.source !== "all") && (
          <button style={resetButtonStyle} onClick={handleReset}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// styles (same as yours)
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
};

const activeChipStyle = {
  background: "#2A81CB",
  color: "white",
};

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: "4px",
};

const summaryStyle = {
  fontSize: "11px",
  color: "#666",
};

const resetButtonStyle = {
  background: "#f5f5f5",
  border: "1px solid #ddd",
  borderRadius: "4px",
  padding: "5px 12px",
  cursor: "pointer",
};

export default FilterPanel;
