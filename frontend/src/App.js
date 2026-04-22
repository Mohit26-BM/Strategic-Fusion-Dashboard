import { useCallback, useEffect, useState } from "react";
import MapView from "./components/MapView";
import Legend from "./components/Legend";
import FileUpload from "./components/FileUpload";
import AddNodeForm from "./components/AddNodeForm";
import FilterPanel from "./components/FilterPanel";
import IntelligencePanel from "./components/IntelligencePanel";
import TerrainMapControl, {
  DEFAULT_TERRAIN_CONFIG,
} from "./components/TerrainMapControl";
import {
  fetchIntelligence,
  addIntelligence,
  bulkAddIntelligence,
} from "./services/api";
import { normalizeIntelType } from "./utils/intelligenceTypes";
import LandingPage from "./components/LandingPage";

const DEFAULT_SECTIONS = {
  ingestion: true,
  manual: true,
  terrain: false,
  filters: true,
};

function App() {
  const [showDashboard, setShowDashboard] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [source, setSource] = useState("none");
  const [mapFocusRequest, setMapFocusRequest] = useState(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [sectionState, setSectionState] = useState(DEFAULT_SECTIONS);

  const [terrainConfig, setTerrainConfig] = useState(() => {
    const savedValue = window.localStorage.getItem("terrain-config");
    if (!savedValue) return DEFAULT_TERRAIN_CONFIG;
    try {
      return JSON.parse(savedValue);
    } catch {
      return DEFAULT_TERRAIN_CONFIG;
    }
  });

  // 🔥 FILTER STATE (single source of truth)
  const [filterState, setFilterState] = useState({
    search: "",
    type: "all",
  });

  // 🔥 CENTRAL FILTER FUNCTION
  const filterNodes = useCallback((nodes, filter) => {
    let result = nodes;

    // search
    if (filter.search) {
      const term = filter.search.toLowerCase();
      result = result.filter(
        (n) =>
          n.title?.toLowerCase().includes(term) ||
          n.description?.toLowerCase().includes(term) ||
          n.city?.toLowerCase().includes(term) ||
          n.title?.toLowerCase().includes(term) ||
          n.description?.toLowerCase().includes(term),
      );
    }

    // type
    if (filter.type !== "all") {
      result = result.filter(
        (n) =>
          n.type?.trim().toUpperCase() === filter.type.trim().toUpperCase(),
      );
    }

    return result;
  }, []);

  // 🔥 LOAD DATA
  const loadFromMongoDB = useCallback(async () => {
    try {
      const mongoData = await fetchIntelligence();

      const cleaned = mongoData.map((item) => ({
        ...item,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lng),
        type: normalizeIntelType(item.type)?.toUpperCase(),
      }));

      setData(cleaned);
      setSource("mongodb");
    } catch (error) {
      console.error("MongoDB connection failed:", error);
      setSource("none");
    }
  }, []);

  // 🔥 LOAD ON START
  useEffect(() => {
    if (showDashboard) {
      loadFromMongoDB();
    }
  }, [showDashboard, loadFromMongoDB]);

  // 🔥 APPLY FILTER AUTOMATICALLY
  useEffect(() => {
    setFilteredData(filterNodes(data, filterState));
  }, [data, filterState, filterNodes]);

  // 🔥 HANDLE FILTER CHANGE
  const handleFilterChange = (_, options = {}) => {
    setFilterState({
      search: options.search || "",
      type: options.activeType || "all",
    });

    // Focus on node if requested (but do NOT auto-open dossier)
    if (options.shouldFocus && options.focusNode) {
      setMapFocusRequest({
        mode: "single",
        lat: options.focusNode.lat,
        lng: options.focusNode.lng,
        timestamp: Date.now(),
      });
      // Do NOT setSelectedNode here; only set on marker click
    } else if (options.shouldFocus && options.activeType !== "all") {
      setMapFocusRequest({
        type: options.activeType,
        timestamp: Date.now(),
      });
    }
  };

  // 🔥 ADD NODE
  const handleAddNode = async (newNode) => {
    try {
      await addIntelligence(newNode);

      // slight delay (Render cold start safety)
      await new Promise((res) => setTimeout(res, 500));

      await loadFromMongoDB();
    } catch (error) {
      console.error("Failed to add node:", error);
      alert("Failed to save node: " + error.message);
    }
  };

  // 🔥 BULK IMPORT
  const handleImportedData = async (importedNodes) => {
    try {
      await bulkAddIntelligence(importedNodes);

      await new Promise((res) => setTimeout(res, 500));

      await loadFromMongoDB();
      alert(`Successfully imported ${importedNodes.length} nodes`);
    } catch (error) {
      console.error("Failed to import:", error);
      alert("Import failed: " + error.message);
    }
  };

  const toggleSection = (key) => {
    setSectionState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // LANDING PAGE
  if (!showDashboard) {
    return <LandingPage onEnter={() => setShowDashboard(true)} />;
  }

  return (
    <div className="app-shell">
      <button
        type="button"
        className="mobile-drawer-toggle"
        onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
      >
        {isMobileSidebarOpen ? "Close Controls" : "Open Controls"}
      </button>

      <div
        className={`app-sidebar-scrim ${
          isMobileSidebarOpen ? "is-visible" : ""
        }`}
        onClick={() => setIsMobileSidebarOpen(false)}
      />

      <aside className={`app-sidebar ${isMobileSidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-header">
          <p className="sidebar-eyebrow">Strategic Fusion Dashboard</p>
          <h1 className="sidebar-title">Intelligence Control</h1>

          <div className="sidebar-metrics">
            <div className="metric-card">
              <span className="metric-label">Visible Nodes</span>
              <span className="metric-value">{filteredData.length}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Current Source</span>
              <span className="metric-value metric-value--small">
                {source.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div className="sidebar-scroll">
          <SectionCard
            title="Ingestion"
            isOpen={sectionState.ingestion}
            onToggle={() => toggleSection("ingestion")}
          >
            <FileUpload onDataLoaded={handleImportedData} />
          </SectionCard>

          <SectionCard
            title="Manual Node"
            isOpen={sectionState.manual}
            onToggle={() => toggleSection("manual")}
          >
            <AddNodeForm onAdd={handleAddNode} />
          </SectionCard>

          <SectionCard
            title="Terrain Setup"
            isOpen={sectionState.terrain}
            onToggle={() => toggleSection("terrain")}
          >
            <TerrainMapControl
              value={terrainConfig}
              onChange={setTerrainConfig}
            />
          </SectionCard>

          <SectionCard
            title="Filters"
            isOpen={sectionState.filters}
            onToggle={() => toggleSection("filters")}
          >
            <FilterPanel data={data} onFilter={handleFilterChange} />
          </SectionCard>
        </div>
      </aside>

      <main className="map-stage">
        <MapView
          data={filteredData}
          onNodeClick={setSelectedNode}
          selectedNode={selectedNode}
          terrainConfig={terrainConfig}
          focusRequest={mapFocusRequest}
        />

        <IntelligencePanel
          node={selectedNode}
          visibleCount={filteredData.length}
          source={source}
        />

        {/* Legend in a fixed overlay slot for visibility */}
        <div style={{ position: "absolute", top: 20, right: 20, zIndex: 1000 }}>
          <Legend count={filteredData.length} data={filteredData} />
        </div>

        <div className="map-status-pill">
          Live View: {filteredData.length} nodes ({source})
        </div>
      </main>
    </div>
  );
}

function SectionCard({ title, children, isOpen, onToggle }) {
  return (
    <section className="sidebar-section">
      <button type="button" className="section-toggle" onClick={onToggle}>
        <h2>{title}</h2>
      </button>
      {isOpen && <div>{children}</div>}
    </section>
  );
}

export default App;
