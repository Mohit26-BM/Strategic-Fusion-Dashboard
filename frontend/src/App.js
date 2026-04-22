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
    if (!savedValue) {
      return DEFAULT_TERRAIN_CONFIG;
    }
    try {
      return JSON.parse(savedValue);
    } catch (error) {
      console.error("Failed to parse terrain config:", error);
      return DEFAULT_TERRAIN_CONFIG;
    }
  });

  const loadFromMongoDB = useCallback(async () => {
    try {
      const mongoData = await fetchIntelligence();

      const cleaned = mongoData.map((item) => ({
        ...item,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lng),
        type: normalizeIntelType(item.type),
      }));

      setData(cleaned);
      setFilteredData(cleaned);
      setSource("mongodb");
    } catch (error) {
      console.error("MongoDB connection failed:", error);
      setSource("none");
    }
  }, []);

  useEffect(() => {
    if (showDashboard) {
      loadFromMongoDB();
    }
  }, [showDashboard, loadFromMongoDB]);

  const handleAddNode = async (newNode) => {
    try {
      await addIntelligence(newNode);
      await loadFromMongoDB();
    } catch (error) {
      console.error("Failed to add node:", error);
      alert("Failed to save node: " + error.message);
    }
  };

  const handleImportedData = async (importedNodes) => {
    try {
      await bulkAddIntelligence(importedNodes);
      await loadFromMongoDB();
      alert(`Successfully imported ${importedNodes.length} nodes`);
    } catch (error) {
      console.error("Failed to import:", error);
      alert("Import failed: " + error.message);
    }
  };

  const handleFilterChange = (filtered, options = {}) => {
    setFilteredData(filtered);
    if (options.shouldFocus && options.activeType !== "all") {
      setMapFocusRequest({ type: options.activeType, timestamp: Date.now() });
    }
  };

  const toggleSection = (key) => {
    setSectionState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // SHOW LANDING PAGE IF NOT YET ENTERED
  if (!showDashboard) {
    return <LandingPage onEnter={() => setShowDashboard(true)} />;
  }

  // SHOW DASHBOARD
  return (
    <div className="app-shell">
      <button
        type="button"
        className="mobile-drawer-toggle"
        onClick={() => setIsMobileSidebarOpen((current) => !current)}
      >
        {isMobileSidebarOpen ? "Close Controls" : "Open Controls"}
      </button>

      <div
        className={`app-sidebar-scrim ${isMobileSidebarOpen ? "is-visible" : ""}`}
        onClick={() => setIsMobileSidebarOpen(false)}
      />

      <aside className={`app-sidebar ${isMobileSidebarOpen ? "is-open" : ""}`}>
        <div className="sidebar-header">
          <p className="sidebar-eyebrow">Strategic Fusion Dashboard</p>
          <h1 className="sidebar-title">Intelligence Control</h1>
          <p className="sidebar-subtitle">
            One workspace for ingestion, geospatial context, and rapid node
            review.
          </p>

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
            description="Import structured intelligence records or create an imagery node from a local file."
            isOpen={sectionState.ingestion}
            onToggle={() => toggleSection("ingestion")}
          >
            <FileUpload onDataLoaded={handleImportedData} />
          </SectionCard>

          <SectionCard
            title="Manual Node"
            description="Drop in a single report quickly when you already know the coordinates."
            isOpen={sectionState.manual}
            onToggle={() => toggleSection("manual")}
          >
            <AddNodeForm onAdd={handleAddNode} />
          </SectionCard>

          <SectionCard
            title="Terrain Setup"
            description="Anchor the map to a fixed mission image and tune how it sits on the geography."
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
            description="Narrow the common operating picture by keyword or intelligence type."
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

        <div className="map-legend-slot">
          <Legend count={filteredData.length} data={filteredData} />
        </div>

        <div className="map-status-pill">
          Live View: {filteredData.length} nodes across {source.toUpperCase()}{" "}
          intake
        </div>
      </main>
    </div>
  );
}

function SectionCard({ title, description, children, isOpen, onToggle }) {
  return (
    <section className="sidebar-section">
      <button type="button" className="section-toggle" onClick={onToggle}>
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-copy">{description}</p>
        </div>
        <span className={`section-chevron ${isOpen ? "is-open" : ""}`}>▾</span>
      </button>

      {isOpen && <div className="section-body">{children}</div>}
    </section>
  );
}

export default App;
