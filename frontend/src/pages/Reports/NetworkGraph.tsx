import React from 'react';
import Layout from '@/components/layout/Layout';
import NetworkGraphCanvas from '@/components/reports/network/NetworkGraphCanvas';
import NetworkGraphControls, { type WindowPreset } from '@/components/reports/network/NetworkGraphControls';
import NetworkLegend from '@/components/reports/network/NetworkLegend';
import NetworkNodeDetailsPanel from '@/components/reports/network/NetworkNodeDetailsPanel';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useNetworkGraph, useNetworkGraphBootstrap } from '@/hooks/useNetworkGraph';
import type { NetworkGraphEdge, NetworkGraphMode, NetworkGraphNode } from '@/types/models';
import { useLocation } from 'react-router';
import { parseDeptFromSearch } from '@/utils/deptQuery';
import { parseVerticalFromSearch } from '@/utils/verticalQuery';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthsAgoIso(months: number): string {
  const now = new Date();
  const copy = new Date(now.getTime());
  copy.setMonth(copy.getMonth() - Math.max(1, months));
  return isoDate(copy);
}

function currentIsoDate(): string {
  return isoDate(new Date());
}

function presetForMonths(months: number): WindowPreset {
  if (months === 6) return '6m';
  if (months === 12) return '12m';
  if (months === 24) return '24m';
  return 'custom';
}

function recomputeEdgeScore(
  edge: NetworkGraphEdge,
  mode: NetworkGraphMode,
  weights: {
    coworkerProjectWeight: number;
    coworkerWeekWeight: number;
    clientProjectWeight: number;
    clientWeekWeight: number;
  }
): number {
  if (mode === 'coworker') {
    const sharedProjectsCount = Number(edge.metrics?.sharedProjectsCount || 0);
    const sharedWeeksCount = Number(edge.metrics?.sharedWeeksCount || 0);
    return (weights.coworkerProjectWeight * sharedProjectsCount) + (weights.coworkerWeekWeight * sharedWeeksCount);
  }
  if (mode === 'client_experience') {
    const distinctProjectsCount = Number(edge.metrics?.distinctProjectsCount || 0);
    const distinctWeeksCount = Number(edge.metrics?.distinctWeeksCount || 0);
    return (weights.clientProjectWeight * distinctProjectsCount) + (weights.clientWeekWeight * distinctWeeksCount);
  }
  return Number(edge.score || 0);
}

const ExpandToggleButton: React.FC<{ expanded: boolean; onToggle: () => void }> = ({ expanded, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className="absolute bottom-3 right-3 z-20 h-9 w-9 rounded-md border border-[var(--border)] bg-[var(--card)]/95 text-[var(--text)] shadow-md hover:bg-[var(--surfaceHover)]"
    aria-label={expanded ? 'Exit expanded graph view' : 'Expand graph view'}
    title={expanded ? 'Exit expanded view' : 'Expand view'}
  >
    {expanded ? (
      <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 3H3v5" />
        <path d="M3 3l6 6" />
        <path d="M16 21h5v-5" />
        <path d="M21 21l-6-6" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M15 3h6v6" />
        <path d="M21 3l-7 7" />
        <path d="M9 21H3v-6" />
        <path d="M3 21l7-7" />
      </svg>
    )}
  </button>
);

const NetworkGraphPage: React.FC = () => {
  const { state: verticalState } = useVerticalFilter();
  const { backendParams } = useDepartmentFilter();
  const location = useLocation();

  const [mode, setMode] = React.useState<NetworkGraphMode>('project_people');
  const [windowPreset, setWindowPreset] = React.useState<WindowPreset>('24m');
  const [customMonths, setCustomMonths] = React.useState(24);
  const [includeInactive, setIncludeInactive] = React.useState(false);
  const [selectedClient, setSelectedClient] = React.useState('');
  const [maxEdges, setMaxEdges] = React.useState(4000);
  const [coworkerProjectWeight, setCoworkerProjectWeight] = React.useState(3);
  const [coworkerWeekWeight, setCoworkerWeekWeight] = React.useState(1);
  const [coworkerThreshold, setCoworkerThreshold] = React.useState(6);
  const [clientProjectWeight, setClientProjectWeight] = React.useState(4);
  const [clientWeekWeight, setClientWeekWeight] = React.useState(1);
  const [clientThreshold, setClientThreshold] = React.useState(8);
  const [focusedNodeId, setFocusedNodeId] = React.useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [resetNonce, setResetNonce] = React.useState(0);
  const [expandedGraph, setExpandedGraph] = React.useState(false);

  const hasExplicitDepartmentFilter = React.useMemo(() => {
    const parsed = parseDeptFromSearch(location.search);
    if (!parsed) return false;
    if (parsed.selectedDepartmentId != null) return true;
    return Boolean(parsed.filters && parsed.filters.length > 0);
  }, [location.search]);
  const hasExplicitVerticalFilter = React.useMemo(() => parseVerticalFromSearch(location.search) != null, [location.search]);

  const scopedDepartment = hasExplicitDepartmentFilter ? backendParams.department : undefined;
  const scopedIncludeChildren = hasExplicitDepartmentFilter ? backendParams.include_children : undefined;
  const scopedVertical = hasExplicitVerticalFilter ? (verticalState.selectedVerticalId ?? undefined) : undefined;

  const bootstrapQuery = useNetworkGraphBootstrap({
    vertical: scopedVertical,
    department: scopedDepartment,
    include_children: scopedIncludeChildren,
  });

  const bootstrap = bootstrapQuery.data;
  const initializedRef = React.useRef(false);
  React.useEffect(() => {
    if (!bootstrap || initializedRef.current) return;
    initializedRef.current = true;
    const defaults = bootstrap.defaults;
    setWindowPreset(presetForMonths(Number(defaults.defaultWindowMonths || 24)));
    setCustomMonths(Number(defaults.defaultWindowMonths || 24));
    setIncludeInactive(Boolean(defaults.includeInactiveDefault));
    setMaxEdges(Number(defaults.maxEdgesDefault || 4000));
    setCoworkerProjectWeight(Number(defaults.coworkerProjectWeight || 3));
    setCoworkerWeekWeight(Number(defaults.coworkerWeekWeight || 1));
    setCoworkerThreshold(Number(defaults.coworkerMinScore || 6));
    setClientProjectWeight(Number(defaults.clientProjectWeight || 4));
    setClientWeekWeight(Number(defaults.clientWeekWeight || 1));
    setClientThreshold(Number(defaults.clientMinScore || 8));
  }, [bootstrap]);

  const effectiveWindow = React.useMemo(() => {
    if (windowPreset === 'all') {
      return {
        start: bootstrap?.snapshotBounds?.minWeekStart || undefined,
        end: bootstrap?.snapshotBounds?.maxWeekStart || undefined,
      };
    }
    if (windowPreset === 'custom') {
      return {
        start: monthsAgoIso(customMonths),
        end: currentIsoDate(),
      };
    }
    if (windowPreset === '6m') {
      return { start: monthsAgoIso(6), end: currentIsoDate() };
    }
    if (windowPreset === '12m') {
      return { start: monthsAgoIso(12), end: currentIsoDate() };
    }
    return { start: monthsAgoIso(24), end: currentIsoDate() };
  }, [windowPreset, customMonths, bootstrap?.snapshotBounds?.minWeekStart, bootstrap?.snapshotBounds?.maxWeekStart]);

  const graphQuery = useNetworkGraph({
    mode,
    start: effectiveWindow.start,
    end: effectiveWindow.end,
    vertical: scopedVertical,
    department: scopedDepartment,
    include_children: scopedIncludeChildren,
    include_inactive: includeInactive ? 1 : 0,
    client: mode === 'client_experience' && selectedClient ? selectedClient : undefined,
    max_edges: maxEdges,
  });

  const graphData = graphQuery.data;

  const filteredGraph = React.useMemo(() => {
    const sourceNodes = graphData?.nodes || [];
    const sourceEdges = graphData?.edges || [];
    const applyClientThreshold = mode === 'client_experience' && !selectedClient;
    const recomputed = sourceEdges
      .map((edge) => ({
        ...edge,
        score: recomputeEdgeScore(edge, mode, {
          coworkerProjectWeight,
          coworkerWeekWeight,
          clientProjectWeight,
          clientWeekWeight,
        }),
      }))
      .filter((edge) => {
        if (mode === 'coworker') return edge.score >= coworkerThreshold;
        if (mode === 'client_experience') return !applyClientThreshold || edge.score >= clientThreshold;
        return true;
      })
      .sort((a, b) => {
        const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return a.id.localeCompare(b.id);
      })
      .slice(0, maxEdges);

    const nodeIds = new Set<string>();
    for (const edge of recomputed) {
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    }
    const nodes = sourceNodes.filter((node) => nodeIds.has(node.id));
    return { nodes, edges: recomputed };
  }, [
    graphData?.nodes,
    graphData?.edges,
    mode,
    coworkerProjectWeight,
    coworkerWeekWeight,
    coworkerThreshold,
    clientProjectWeight,
    clientWeekWeight,
    clientThreshold,
    selectedClient,
    maxEdges,
  ]);

  React.useEffect(() => {
    const ids = new Set(filteredGraph.nodes.map((n) => n.id));
    if (focusedNodeId && !ids.has(focusedNodeId)) {
      setFocusedNodeId(null);
    }
    if (hoveredNodeId && !ids.has(hoveredNodeId)) {
      setHoveredNodeId(null);
    }
  }, [filteredGraph.nodes, focusedNodeId, hoveredNodeId]);

  const nodeById = React.useMemo(() => {
    const map = new Map<string, NetworkGraphNode>();
    for (const node of filteredGraph.nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [filteredGraph.nodes]);

  const activeNode = React.useMemo(
    () => (focusedNodeId ? nodeById.get(focusedNodeId) || null : null),
    [focusedNodeId, nodeById]
  );

  const activeConnections = React.useMemo(() => {
    if (!activeNode) return [];
    return filteredGraph.edges
      .filter((edge) => edge.source === activeNode.id || edge.target === activeNode.id)
      .map((edge) => {
        const otherNodeId = edge.source === activeNode.id ? edge.target : edge.source;
        return {
          edge,
          otherNode: nodeById.get(otherNodeId) || {
            id: otherNodeId,
            label: otherNodeId,
            type: 'person',
          },
        };
      });
  }, [activeNode, filteredGraph.edges, nodeById]);

  const resetView = React.useCallback(() => {
    setFocusedNodeId(null);
    setHoveredNodeId(null);
    setResetNonce((n) => n + 1);
  }, []);

  React.useEffect(() => {
    if (!expandedGraph) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedGraph(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expandedGraph]);

  const handleNodeClick = React.useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId);
  }, []);

  const handleStageClick = React.useCallback(() => {
    setFocusedNodeId(null);
    setHoveredNodeId(null);
  }, []);

  const resetToDefaults = React.useCallback(() => {
    const defaults = bootstrap?.defaults;
    if (!defaults) return;
    setWindowPreset(presetForMonths(Number(defaults.defaultWindowMonths || 24)));
    setCustomMonths(Number(defaults.defaultWindowMonths || 24));
    setIncludeInactive(Boolean(defaults.includeInactiveDefault));
    setSelectedClient('');
    setMaxEdges(Number(defaults.maxEdgesDefault || 4000));
    setCoworkerProjectWeight(Number(defaults.coworkerProjectWeight || 3));
    setCoworkerWeekWeight(Number(defaults.coworkerWeekWeight || 1));
    setCoworkerThreshold(Number(defaults.coworkerMinScore || 6));
    setClientProjectWeight(Number(defaults.clientProjectWeight || 4));
    setClientWeekWeight(Number(defaults.clientWeekWeight || 1));
    setClientThreshold(Number(defaults.clientMinScore || 8));
    resetView();
  }, [bootstrap?.defaults, resetView]);

  const warnings = React.useMemo(() => {
    const all: string[] = [];
    if (graphData?.truncated) {
      all.push('Server edge cap was hit; increase max edges only if rendering remains responsive.');
    }
    for (const warning of graphData?.warnings || []) {
      if (/latest snapshot week/i.test(warning)) continue;
      if (/requested start .* before first snapshot week/i.test(warning)) continue;
      all.push(warning);
    }
    return all;
  }, [graphData?.truncated, graphData?.warnings]);

  const latestSnapshotWeek = React.useMemo(() => {
    return (
      bootstrap?.defaults?.lastSnapshotWeekStart ||
      graphData?.snapshotBounds?.maxWeekStart ||
      bootstrap?.snapshotBounds?.maxWeekStart ||
      null
    );
  }, [
    bootstrap?.defaults?.lastSnapshotWeekStart,
    graphData?.snapshotBounds?.maxWeekStart,
    bootstrap?.snapshotBounds?.maxWeekStart,
  ]);

  const isLoading = bootstrapQuery.isLoading || graphQuery.isLoading;
  const hasError = bootstrapQuery.error || graphQuery.error;
  const empty = !isLoading && !hasError && filteredGraph.edges.length === 0;

  const graphCanvas = (
    <div className="relative h-full min-h-0">
      <NetworkGraphCanvas
        key={expandedGraph ? 'expanded' : 'normal'}
        nodes={filteredGraph.nodes}
        edges={filteredGraph.edges}
        focusedNodeId={focusedNodeId}
        hoveredNodeId={hoveredNodeId}
        onNodeClick={handleNodeClick}
        onNodeHover={setHoveredNodeId}
        onStageClick={handleStageClick}
        resetNonce={resetNonce}
        className={expandedGraph ? 'h-full min-h-0 rounded-md' : undefined}
      />
      <ExpandToggleButton expanded={expandedGraph} onToggle={() => setExpandedGraph((v) => !v)} />
    </div>
  );

  if (expandedGraph) {
    return (
      <Layout>
        <div className="h-full min-h-0 flex flex-col">
          {isLoading ? <div className="text-sm text-[var(--muted)] p-3">Loading network graph...</div> : null}
          {hasError ? (
            <div className="mx-3 mt-3 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {(hasError as Error).message || 'Failed to load network graph.'}
            </div>
          ) : null}
          {empty ? (
            <div className="mx-3 mt-3 rounded border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
              No graph connections for the current filters. Try a wider window or lower threshold.
            </div>
          ) : null}
          {!isLoading && !hasError && !empty ? (
            <div className="flex-1 min-h-0 px-2 pb-2">
              {graphCanvas}
            </div>
          ) : null}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="ux-page-shell space-y-4">
        <div className="ux-page-hero py-2">
          <div className="flex items-end justify-between gap-3">
            <h1 className="text-2xl font-bold text-[var(--text)]">Network Graph</h1>
            <div className="text-xs text-[var(--muted)] whitespace-nowrap">
              {latestSnapshotWeek ? `Last snapshot: ${latestSnapshotWeek}` : 'Last snapshot: n/a'}
            </div>
          </div>
        </div>

        <NetworkGraphControls
          mode={mode}
          onModeChange={setMode}
          windowPreset={windowPreset}
          onWindowPresetChange={setWindowPreset}
          customMonths={customMonths}
          onCustomMonthsChange={setCustomMonths}
          includeInactive={includeInactive}
          onIncludeInactiveChange={setIncludeInactive}
          clientOptions={bootstrap?.clients || []}
          selectedClient={selectedClient}
          onSelectedClientChange={setSelectedClient}
          maxEdges={maxEdges}
          onMaxEdgesChange={setMaxEdges}
          coworkerProjectWeight={coworkerProjectWeight}
          onCoworkerProjectWeightChange={setCoworkerProjectWeight}
          coworkerWeekWeight={coworkerWeekWeight}
          onCoworkerWeekWeightChange={setCoworkerWeekWeight}
          coworkerThreshold={coworkerThreshold}
          onCoworkerThresholdChange={setCoworkerThreshold}
          clientProjectWeight={clientProjectWeight}
          onClientProjectWeightChange={setClientProjectWeight}
          clientWeekWeight={clientWeekWeight}
          onClientWeekWeightChange={setClientWeekWeight}
          clientThreshold={clientThreshold}
          onClientThresholdChange={setClientThreshold}
          searchNodes={filteredGraph.nodes}
          onSearchNode={setFocusedNodeId}
          onResetToDefaults={resetToDefaults}
          onResetView={resetView}
        />

        {warnings.length > 0 ? (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">
            {warnings.map((warning, idx) => (
              <div key={`${warning}-${idx}`}>{warning}</div>
            ))}
          </div>
        ) : null}

        {isLoading ? <div className="text-sm text-[var(--muted)]">Loading network graph...</div> : null}
        {hasError ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {(hasError as Error).message || 'Failed to load network graph.'}
          </div>
        ) : null}
        {empty ? (
          <div className="rounded border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted)]">
            No graph connections for the current filters. Try a wider window or lower threshold.
          </div>
        ) : null}

        {!isLoading && !hasError && !empty ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            {graphCanvas}
            <div className="space-y-3">
              <aside className="border border-[var(--border)] rounded-lg bg-[var(--card)] p-3">
                <NetworkLegend />
                <div className="mt-2 text-xs text-[var(--muted)]">
                  {graphData ? `Nodes: ${filteredGraph.nodes.length} | Edges: ${filteredGraph.edges.length}` : null}
                </div>
              </aside>
              <NetworkNodeDetailsPanel node={activeNode} connections={activeConnections} />
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
};

export default NetworkGraphPage;
