import { useCallback, useEffect, useRef, useState } from "react";
import MapView from "./components/MapView";
import Legend from "./components/Legend";
import FileUpload from "./components/FileUpload";
import AddNodeForm from "./components/AddNodeForm";
import FilterPanel from "./components/FilterPanel";
import IntelligencePanel from "./components/IntelligencePanel";
import TerrainMapControl from "./components/TerrainMapControl";
import ErrorBoundary from "./components/ErrorBoundary";
import LandingPage from "./components/LandingPage";
import { NotificationDialog, ConfirmDialog, EditNodeDialog } from "./components/ActionDialogs";
import AccessBar, { LockedNotice } from "./auth/AccessBar";
import UnlockDialog from "./auth/UnlockDialog";
import { useAuth } from "./auth/AuthContext";
import {
  fetchIntelligence,
  addIntelligence,
  bulkAddInBatches,
  updateIntelligence,
  deleteIntelligence,
} from "./services/api";
import { normalizeIntelType } from "./utils/intelligenceTypes";
import { describeSkipped } from "./utils/intelligenceImport";
import { DEFAULT_TERRAIN_CONFIG, loadTerrain, saveTerrain } from "./utils/terrain";

const DEFAULT_SECTIONS = {
  ingestion: true,
  manual: true,
  terrain: false,
  filters: true,
};

const cleanNode = (item) => ({
  ...item,
  lat: parseFloat(item.lat),
  lng: parseFloat(item.lng),
  type: normalizeIntelType(item.type)?.toUpperCase(),
});

function App() {
  const { unlocked, requestUnlock, handleAuthError } = useAuth();
  const [showDashboard, setShowDashboard] = useState(false);
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loadStatus, setLoadStatus] = useState("idle"); // idle | loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [mapFocusRequest, setMapFocusRequest] = useState(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [sectionState, setSectionState] = useState(DEFAULT_SECTIONS);
  const [terrainConfig, setTerrainConfig] = useState(DEFAULT_TERRAIN_CONFIG);
  const [terrainLoaded, setTerrainLoaded] = useState(false);
  const [terrainSaveWarning, setTerrainSaveWarning] = useState("");
  const [filterState, setFilterState] = useState({ search: "", type: "all", source: "all" });
  const [notification, setNotification] = useState(null);
  const [editNode, setEditNode] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const loadTicket = useRef(0);

  const showNotification = useCallback((type, title, message, details) => {
    setNotification({ type, title, message, details });
  }, []);

  // ---------------------------------------------------------------------------------------------- terrain
  useEffect(() => {
    let cancelled = false;
    loadTerrain().then((saved) => {
      if (cancelled) return;
      setTerrainConfig(saved);
      setTerrainLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!terrainLoaded) return undefined; // do not overwrite what was saved before it has been read
    const timer = setTimeout(() => {
      saveTerrain(terrainConfig).then((result) => setTerrainSaveWarning(result.ok ? "" : result.warning));
    }, 400);
    return () => clearTimeout(timer);
  }, [terrainConfig, terrainLoaded]);

  // ---------------------------------------------------------------------------------------------- loading
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
      result = result.filter((node) => node.type?.trim().toUpperCase() === filter.type.trim().toUpperCase());
    }

    if (filter.source !== "all") {
      result = result.filter((node) => (node.source || "unknown") === filter.source);
    }

    return result;
  }, []);

  const loadNodes = useCallback(async () => {
    const ticket = ++loadTicket.current;
    setLoadStatus("loading");
    setLoadError("");
    try {
      const nodes = await fetchIntelligence();
      if (ticket !== loadTicket.current) return; // a newer load has started
      setData(nodes.map(cleanNode));
      setLoadStatus("ready");
    } catch (error) {
      if (ticket !== loadTicket.current) return;
      console.error("Loading nodes failed:", error);
      setLoadError(error.message || "Unable to load intelligence nodes.");
      setLoadStatus("error");
    }
  }, []);

  useEffect(() => {
    if (showDashboard) loadNodes();
  }, [showDashboard, loadNodes]);

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
      setMapFocusRequest({ mode: "single", lat: options.focusNode.lat, lng: options.focusNode.lng, timestamp: Date.now() });
      return;
    }

    if (options.shouldFocus) {
      setMapFocusRequest({ mode: "fit", timestamp: Date.now() });
    }
  }, []);

  // ---------------------------------------------------------------------------------------------- changes
  /** Shows the right message for a failed change. A rejected token also re-opens the unlock dialog. */
  const reportFailure = (error, title, fallback) => {
    if (handleAuthError(error)) return;
    showNotification("error", title, error.message || fallback);
  };

  /** @returns {Promise<boolean>} whether the node was saved (the form keeps its text when it was not) */
  const handleAddNode = async (newNode) => {
    try {
      await addIntelligence(newNode);
      await loadNodes();
      showNotification("success", "Node added", "The node was saved and is on the map.");
      return true;
    } catch (error) {
      console.error("Failed to add node:", error);
      reportFailure(error, "Node not saved", "The node could not be saved.");
      return false;
    }
  };

  const handleImportedData = async (importedNodes, meta = {}, onProgress = () => {}) => {
    let result;
    try {
      result = await bulkAddInBatches(importedNodes, { onProgress });
    } catch (error) {
      console.error("Failed to import:", error);
      reportFailure(error, "Import failed", "The selected file could not be imported.");
      throw error;
    }

    await loadNodes();

    const clientSkipped = meta.skipped || [];
    const details = [];
    if (clientSkipped.length) details.push(`Skipped before sending: ${describeSkipped(clientSkipped)}`);
    if (result.skipped) details.push(`The server skipped ${result.skipped} node${result.skipped === 1 ? "" : "s"}${result.firstError ? ` (${result.firstError})` : ""}.`);
    if (result.inserted > 0) details.push("Place names are being looked up in the background and will appear after a refresh.");

    if (result.inserted === 0) {
      showNotification("error", "Nothing was imported", `None of the ${importedNodes.length} nodes could be saved.`, details);
      return;
    }
    const total = meta.total ?? importedNodes.length;
    const allGood = result.inserted === total && details.length === 1; // only the place-name note
    showNotification(
      allGood ? "success" : "warning",
      allGood ? "Import complete" : "Import finished with some skipped rows",
      `Imported ${result.inserted} of ${total} node${total === 1 ? "" : "s"}${meta.fileName ? ` from ${meta.fileName}` : ""}.`,
      details,
    );
  };

  const handleEditNode = (node) => {
    if (!node?._id) {
      showNotification("error", "Edit unavailable", "This node does not have a database id, so it cannot be updated.");
      return;
    }
    setEditNode(node);
  };

  const handleSaveNode = async (updates) => {
    if (!editNode?._id) return;

    try {
      const response = await updateIntelligence(editNode._id, updates);
      const updatedNode = cleanNode(response.node || { ...editNode, ...updates });
      setData((current) => current.map((node) => (node._id === editNode._id ? updatedNode : node)));
      setSelectedNode(updatedNode);
      setEditNode(null);
      showNotification("success", "Node updated", "The node was updated.");
    } catch (error) {
      console.error("Failed to update node:", error);
      reportFailure(error, "Update failed", "The node could not be updated.");
    }
  };

  const handleRequestDeleteNode = (node) => {
    if (!node?._id) {
      showNotification("error", "Delete unavailable", "This node does not have a database id, so it cannot be deleted.");
      return;
    }
    setDeleteDialog({
      node,
      title: "Delete this node?",
      message: `This will permanently remove "${node.title || "Untitled node"}" from the database.`,
      confirmLabel: "Delete node",
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
      showNotification("success", "Node deleted", "The node was removed.");
    } catch (error) {
      console.error("Failed to delete node:", error);
      setDeleteDialog(null);
      reportFailure(error, "Delete failed", "The node could not be deleted.");
    }
  };

  const toggleSection = (key) => setSectionState((current) => ({ ...current, [key]: !current[key] }));

  if (!showDashboard) {
    return <LandingPage onEnter={() => setShowDashboard(true)} />;
  }

  const statusLabel = { loading: "Loading", ready: "Live", error: "Offline", idle: "…" }[loadStatus];

  return (
    <div className="app-shell">
      <button
        type="button"
        className="mobile-drawer-toggle"
        aria-expanded={isMobileSidebarOpen}
        aria-controls="app-sidebar"
        onClick={() => setIsMobileSidebarOpen((current) => !current)}
      >
        {isMobileSidebarOpen ? "Close controls" : "Open controls"}
      </button>

      <div className={`app-sidebar-scrim ${isMobileSidebarOpen ? "is-visible" : ""}`} onClick={() => setIsMobileSidebarOpen(false)} />

      <aside id="app-sidebar" className={`app-sidebar ${isMobileSidebarOpen ? "is-open" : ""}`} aria-label="Dashboard controls">
        <div className="sidebar-header">
          <p className="sidebar-eyebrow">Strategic Fusion Dashboard</p>
          <h1 className="sidebar-title">Intelligence Control</h1>

          <AccessBar />

          <div className="sidebar-metrics">
            <div className="metric-card">
              <span className="metric-label">Visible Nodes</span>
              <span className="metric-value">{filteredData.length}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Database</span>
              <span className={`metric-value metric-value--small status-${loadStatus}`}>{statusLabel}</span>
            </div>
          </div>
          <button type="button" className="reload-button" onClick={loadNodes} disabled={loadStatus === "loading"}>
            {loadStatus === "loading" ? "Loading…" : "Reload nodes"}
          </button>
        </div>

        <div className="sidebar-scroll">
          <SectionCard id="ingestion" title="Ingestion" isOpen={sectionState.ingestion} onToggle={() => toggleSection("ingestion")}>
            {unlocked ? <FileUpload onDataLoaded={handleImportedData} /> : <LockedNotice what="importing files" />}
          </SectionCard>

          <SectionCard id="manual" title="Manual Node" isOpen={sectionState.manual} onToggle={() => toggleSection("manual")}>
            {unlocked ? <AddNodeForm onAdd={handleAddNode} /> : <LockedNotice what="adding nodes" />}
          </SectionCard>

          <SectionCard id="terrain" title="Terrain Setup" isOpen={sectionState.terrain} onToggle={() => toggleSection("terrain")}>
            <TerrainMapControl value={terrainConfig} onChange={setTerrainConfig} nodes={data} saveWarning={terrainSaveWarning} />
          </SectionCard>

          <SectionCard id="filters" title="Filters" isOpen={sectionState.filters} onToggle={() => toggleSection("filters")}>
            <FilterPanel data={data} onFilter={handleFilterChange} />
          </SectionCard>
        </div>
      </aside>

      <main className="map-stage">
        <a className="map-help-button" href="/help.html" target="_blank" rel="noreferrer" aria-label="Help (opens in a new tab)">
          ?
        </a>

        {loadStatus === "error" && (
          <div className="load-banner" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={loadNodes}>
              Try again
            </button>
          </div>
        )}

        <ErrorBoundary title="The map stopped working" message="The map hit an unexpected error. Your data is safe on the server.">
          <MapView
            data={filteredData}
            onNodeClick={setSelectedNode}
            selectedNode={selectedNode}
            terrainConfig={terrainConfig}
            focusRequest={mapFocusRequest}
            status={loadStatus === "idle" ? "loading" : loadStatus}
            totalCount={data.length}
          />
        </ErrorBoundary>

        <IntelligencePanel
          node={selectedNode}
          visibleCount={filteredData.length}
          source={statusLabel}
          canEdit={unlocked}
          onRequestUnlock={() => requestUnlock("Unlock editing to change or delete this node.")}
          onEdit={handleEditNode}
          onDelete={handleRequestDeleteNode}
        />

        <div className="map-legend-slot">
          <Legend count={filteredData.length} data={filteredData} />
        </div>

        <div className="map-status-pill" role="status">
          {filteredData.length} of {data.length} nodes · {statusLabel}
        </div>
      </main>

      <NotificationDialog notification={notification} onClose={() => setNotification(null)} />
      <ConfirmDialog dialog={deleteDialog} onCancel={() => setDeleteDialog(null)} onConfirm={handleConfirmDeleteNode} />
      <EditNodeDialog node={editNode} onCancel={() => setEditNode(null)} onSave={handleSaveNode} />
      <UnlockDialog />
    </div>
  );
}

function SectionCard({ id, title, children, isOpen, onToggle }) {
  return (
    <section className="sidebar-section">
      <button type="button" className="section-toggle" onClick={onToggle} aria-expanded={isOpen} aria-controls={`section-${id}`}>
        <h2>{title}</h2>
        <span className="section-chevron" aria-hidden="true">{isOpen ? "–" : "+"}</span>
      </button>
      {isOpen && <div id={`section-${id}`}>{children}</div>}
    </section>
  );
}

export default App;
