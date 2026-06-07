import { useMemo, useState, useEffect } from "react";

function FilterPanel({ data, onFilter = () => {} }) {
  const [filters, setFilters] = useState({
    type: "all",
    searchTerm: "",
    source: "all",
  });

  const [filteredCount, setFilteredCount] = useState(data.length);

  const availableSources = useMemo(() => {
    const sources = Array.from(
      new Set(data.map((item) => item.source).filter(Boolean)),
    );
    return ["all", ...sources];
  }, [data]);

  const availableTypes = useMemo(() => {
    const types = Array.from(new Set(data.map((item) => item.type).filter(Boolean)));
    return ["all", ...types];
  }, [data]);

  useEffect(() => {
    if (filters.type !== "all" && !availableTypes.includes(filters.type)) {
      setFilters((current) => ({ ...current, type: "all" }));
    }

    if (filters.source !== "all" && !availableSources.includes(filters.source)) {
      setFilters((current) => ({ ...current, source: "all" }));
    }
  }, [availableTypes, availableSources, filters.type, filters.source]);

  useEffect(() => {
    onFilter(null, {
      search: filters.searchTerm,
      activeType: filters.type,
      activeSource: filters.source,
    });

    let filtered = data;

    if (filters.type !== "all") {
      filtered = filtered.filter(
        (item) =>
          item.type?.trim().toUpperCase() === filters.type.trim().toUpperCase(),
      );
    }

    if (filters.source !== "all") {
      filtered = filtered.filter((item) => item.source === filters.source);
    }

    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.title?.toLowerCase().includes(term) ||
          item.description?.toLowerCase().includes(term) ||
          item.city?.toLowerCase().includes(term),
      );
    }

    setFilteredCount(filtered.length);

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

  const hasActiveFilters =
    filters.type !== "all" || filters.searchTerm || filters.source !== "all";

  return (
    <div style={panelStyle}>
      <h4 style={{ margin: 0, fontSize: "14px", color: "#f3f7fb" }}>Filters</h4>

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

      <input
        style={inputStyle}
        type="text"
        placeholder="Search title, city, or description"
        value={filters.searchTerm}
        onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
      />

      {availableSources.length > 1 && (
        <select
          style={inputStyle}
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
        >
          {availableSources.map((source) => (
            <option key={source} value={source}>
              {source === "all" ? "All Sources" : source}
            </option>
          ))}
        </select>
      )}

      <div style={footerStyle}>
        <div style={summaryStyle}>
          Showing {filteredCount} of {data.length}
        </div>

        {hasActiveFilters && (
          <button type="button" style={resetButtonStyle} onClick={handleReset}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

const panelStyle = {
  display: "grid",
  gap: "12px",
};

const chipRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const chipStyle = {
  border: "1px solid rgba(135,163,191,0.16)",
  background: "#0b141d",
  color: "#a6b7c8",
  borderRadius: "999px",
  padding: "8px 12px",
  fontSize: "12px",
  cursor: "pointer",
};

const activeChipStyle = {
  background: "rgba(63,178,255,0.16)",
  borderColor: "rgba(124,199,255,0.45)",
  color: "#e8f6ff",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid rgba(135,163,191,0.16)",
  borderRadius: "10px",
  background: "#0b141d",
  color: "#edf3f8",
  boxSizing: "border-box",
};

const footerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
};

const summaryStyle = {
  fontSize: "12px",
  color: "#8da1b5",
};

const resetButtonStyle = {
  background: "transparent",
  border: "1px solid rgba(135,163,191,0.16)",
  color: "#c8d1dc",
  borderRadius: "10px",
  padding: "7px 12px",
  cursor: "pointer",
};

export default FilterPanel;
