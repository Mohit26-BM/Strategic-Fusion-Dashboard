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
  updateIntelligence,
  deleteIntelligence,
} from "./services/api";
import { normalizeIntelType } from "./utils/intelligenceTypes";
import LandingPage from "./components/LandingPage";
import {
  NotificationDialog,
  ConfirmDialog,
  EditNodeDialog,
} from "./components/ActionDialogs";

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
    } catch {
      return DEFAULT_TERRAIN_CONFIG;
    }
  });
  const [filterState, setFilterState] = useState({
    search: "",
    type: "all",
    source: "all",
  });
  const [notification, setNotification] = useState(null);
  const [editNode, setEditNode] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const showNotification = useCallback((type, title, message) => {
    setNotification({ type, title, message });
  }, []);

  const filterNodes = useCallback((nodes, filter) => {
    let result = nodes;

    if (filter.search) {
      const term = filter.search.toLowerCase();
      result = result.filter(
        (node) =>
          node.title?.toLowerCase().includes(term) ||
          node.description?.toLowerCase().includes(term) ||
          node.city?.toLowerCase().includes(term),
      );
    }

    if (filter.type !== "all") {
      result = result.filter(
        (node) =>
          node.type?.trim().toUpperCase() === filter.type.trim().toUpperCase(),
      );
    }

    if (filter.source !== "all") {
      result = result.filter((node) => (node.source || "unknown") === filter.source);
    }

    return result;
  }, []);

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
      showNotification(
        "error",
        "Connection Failed",
        error.message || "Unable to load intelligence nodes from MongoDB.",
      );
    }
  }, [showNotification]);

  useEffect(() => {
    if (showDashboard) {
      loadFromMongoDB();
    }
  }, [showDashboard, loadFromMongoDB]);

  useEffect(() => {
    setFilteredData(filterNodes(data, filterState));
  }, [data, filterState, filterNodes]);

  const handleFilterChange = useCallback((_, options = {}) => {
    setFilterState({
      search: options.search || "",
      type: options.activeType || "all",
      source: options.activeSource || "all",
    });

    if (options.shouldFocus && options.focusNode) {
      setMapFocusRequest({
        mode: "single",
        lat: options.focusNode.lat,
        lng: options.focusNode.lng,
        timestamp: Date.now(),
      });
      return;
    }

    if (options.shouldFocus) {
      setMapFocusRequest({
        mode: "fit",
        timestamp: Date.now(),
      });
    }
  }, []);

  const handleAddNode = async (newNode) => {
    try {
      await addIntelligence(newNode);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await loadFromMongoDB();
      showNotification(
        "success",
        "Node Added",
        "The intelligence node was saved and added to the map.",
      );
    } catch (error) {
      console.error("Failed to add node:", error);
      showNotification(
        "error",
        "Node Save Failed",
        error.message || "The intelligence node could not be saved.",
      );
    }
  };

  const handleImportedData = async (importedNodes) => {
    try {
      await bulkAddIntelligence(importedNodes);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await loadFromMongoDB();
      showNotification(
        "success",
        "Import Complete",
        `Successfully imported ${importedNodes.length} nodes.`,
      );
    } catch (error) {
      console.error("Failed to import:", error);
      showNotification(
        "error",
        "Import Failed",
        error.message || "The selected file could not be imported.",
      );
    }
  };

  const handleEditNode = (node) => {
    if (!node?._id) {
      showNotification(
        "error",
        "Edit Unavailable",
        "This node does not have a database id, so it cannot be updated.",
      );
      return;
    }

    setEditNode(node);
  };

  const handleSaveNode = async (updates) => {
    if (!editNode?._id) return;

    try {
      const response = await updateIntelligence(editNode._id, updates);
      const updatedNode = {
        ...(response.node || editNode),
        lat: Number(response.node?.lat ?? updates.lat),
        lng: Number(response.node?.lng ?? updates.lng),
        type: normalizeIntelType(response.node?.type ?? updates.type)?.toUpperCase(),
      };

      setData((current) =>
        current.map((node) => (node._id === editNode._id ? updatedNode : node)),
      );
      setSelectedNode(updatedNode);
      setEditNode(null);
      showNotification(
        "success",
        "Node Updated",
        "The intelligence node details were updated successfully.",
      );
    } catch (error) {
      console.error("Failed to update node:", error);
      showNotification(
        "error",
        "Update Failed",
        error.message || "The intelligence node could not be updated.",
      );
    }
  };

  const handleRequestDeleteNode = (node) => {
    if (!node?._id) {
      showNotification(
        "error",
        "Delete Unavailable",
        "This node does not have a database id, so it cannot be deleted.",
      );
      return;
    }

    setDeleteDialog({
      node,
      title: "Delete this node?",
      message: `This will permanently remove "${node.title || "Untitled node"}" from MongoDB.`,
      confirmLabel: "Delete Node",
    });
  };

  const handleConfirmDeleteNode = async () => {
    const node = deleteDialog?.node;
    if (!node?._id) return;

    try {
      await deleteIntelligence(node._id);
      setData((current) => current.filter((item) => item._id !== node._id));
      setSelectedNode((current) => (current?._id === node._id ? null : current));
      setDeleteDialog(null);
      showNotification(
        "success",
        "Node Deleted",
        "The intelligence node was removed from the dashboard.",
      );
    } catch (error) {
      console.error("Failed to delete node:", error);
      showNotification(
        "error",
        "Delete Failed",
        error.message || "The intelligence node could not be deleted.",
      );
    }
  };

  const toggleSection = (key) => {
    setSectionState((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  if (!showDashboard) {
    return <LandingPage onEnter={() => setShowDashboard(true)} />;
  }

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
            <TerrainMapControl value={terrainConfig} onChange={setTerrainConfig} />
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
        <a className="map-help-button" href="/help.html" target="_blank" rel="noreferrer">
          ?
        </a>

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
          onEdit={handleEditNode}
          onDelete={handleRequestDeleteNode}
        />

        <div style={{ position: "absolute", bottom: 20, right: 20, zIndex: 1000 }}>
          <Legend count={filteredData.length} data={filteredData} />
        </div>

        <div className="map-status-pill">
          Live View: {filteredData.length} nodes ({source})
        </div>
      </main>

      <NotificationDialog
        notification={notification}
        onClose={() => setNotification(null)}
      />
      <ConfirmDialog
        dialog={deleteDialog}
        onCancel={() => setDeleteDialog(null)}
        onConfirm={handleConfirmDeleteNode}
      />
      <EditNodeDialog
        node={editNode}
        onCancel={() => setEditNode(null)}
        onSave={handleSaveNode}
      />
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
