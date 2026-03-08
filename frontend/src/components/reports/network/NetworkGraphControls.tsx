import React from 'react';
import type { NetworkGraphMode, NetworkGraphNode } from '@/types/models';

export type WindowPreset = '6m' | '12m' | '24m' | 'all' | 'custom';

type Props = {
  mode: NetworkGraphMode;
  onModeChange: (mode: NetworkGraphMode) => void;
  windowPreset: WindowPreset;
  onWindowPresetChange: (preset: WindowPreset) => void;
  customMonths: number;
  onCustomMonthsChange: (months: number) => void;
  includeInactive: boolean;
  onIncludeInactiveChange: (next: boolean) => void;
  clientOptions: string[];
  selectedClient: string;
  onSelectedClientChange: (client: string) => void;
  maxEdges: number;
  onMaxEdgesChange: (value: number) => void;
  coworkerProjectWeight: number;
  onCoworkerProjectWeightChange: (value: number) => void;
  coworkerWeekWeight: number;
  onCoworkerWeekWeightChange: (value: number) => void;
  coworkerThreshold: number;
  onCoworkerThresholdChange: (value: number) => void;
  clientProjectWeight: number;
  onClientProjectWeightChange: (value: number) => void;
  clientWeekWeight: number;
  onClientWeekWeightChange: (value: number) => void;
  clientThreshold: number;
  onClientThresholdChange: (value: number) => void;
  searchNodes: NetworkGraphNode[];
  onSearchNode: (nodeId: string) => void;
  onResetToDefaults: () => void;
  onResetView: () => void;
};

const fieldClass = 'w-full rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-2 py-1.5 text-sm';
const tooltipClass = 'pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-64 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[10px] leading-4 text-[var(--text)] shadow-lg group-hover:block';

const ControlLabel: React.FC<{ label: string; tooltip: string }> = ({ label, tooltip }) => (
  <span className="relative mb-1 inline-flex cursor-help items-center gap-1 text-[var(--muted)] group">
    <span>{label}</span>
    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--border)] text-[9px] text-[var(--muted)]">
      i
    </span>
    <span className={tooltipClass}>{tooltip}</span>
  </span>
);

const NetworkGraphControls: React.FC<Props> = ({
  mode,
  onModeChange,
  windowPreset,
  onWindowPresetChange,
  customMonths,
  onCustomMonthsChange,
  includeInactive,
  onIncludeInactiveChange,
  clientOptions,
  selectedClient,
  onSelectedClientChange,
  maxEdges,
  onMaxEdgesChange,
  coworkerProjectWeight,
  onCoworkerProjectWeightChange,
  coworkerWeekWeight,
  onCoworkerWeekWeightChange,
  coworkerThreshold,
  onCoworkerThresholdChange,
  clientProjectWeight,
  onClientProjectWeightChange,
  clientWeekWeight,
  onClientWeekWeightChange,
  clientThreshold,
  onClientThresholdChange,
  searchNodes,
  onSearchNode,
  onResetToDefaults,
  onResetView,
}) => {
  const [searchNodeId, setSearchNodeId] = React.useState('');

  return (
    <section className="border border-[var(--border)] rounded-lg bg-[var(--card)] p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">Network Controls</h2>
        <div className="flex items-center gap-2">
          <button type="button" className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surfaceHover)]" onClick={onResetView}>
            Reset view
          </button>
          <button type="button" className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surfaceHover)]" onClick={onResetToDefaults}>
            Reset defaults
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] w-[165px]">
          <ControlLabel
            label="Mode"
            tooltip="Switches which relationship network is shown. Changing mode swaps node/edge types and scoring rules."
          />
          <select className={`${fieldClass} h-8 text-xs py-1`} value={mode} onChange={(e) => onModeChange(e.target.value as NetworkGraphMode)}>
            <option value="project_people">Project-People</option>
            <option value="coworker">Coworker Network</option>
            <option value="client_experience">Client Experience</option>
          </select>
        </label>

        <label className="text-[11px] w-[165px]">
          <ControlLabel
            label="Window"
            tooltip="Limits snapshots to this time range. Larger windows usually increase node/edge counts and scores; smaller windows reduce noise."
          />
          <select className={`${fieldClass} h-8 text-xs py-1`} value={windowPreset} onChange={(e) => onWindowPresetChange(e.target.value as WindowPreset)}>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
            <option value="24m">Last 24 months</option>
            <option value="all">All available</option>
            <option value="custom">Custom months</option>
          </select>
        </label>

        <label className="text-[11px] w-[110px]">
          <ControlLabel
            label="Custom months"
            tooltip="Used only when Window is Custom months. Higher value expands history; lower value tightens the graph to recent relationships."
          />
          <input className={`${fieldClass} h-8 text-xs py-1`} type="number" min={1} max={240} value={customMonths} disabled={windowPreset !== 'custom'} onChange={(e) => onCustomMonthsChange(Math.max(1, Math.min(240, Number(e.target.value || 24))))} />
        </label>

        <label className="text-[11px] w-[110px]">
          <ControlLabel
            label="Max edges"
            tooltip="Server-side edge cap for performance. Higher values show more weak relationships but can clutter and slow rendering. Lower values keep only stronger links."
          />
          <input className={`${fieldClass} h-8 text-xs py-1`} type="number" min={100} max={10000} value={maxEdges} onChange={(e) => onMaxEdgesChange(Math.max(100, Math.min(10000, Number(e.target.value || 4000))))} />
        </label>

        <label className="relative group text-[11px] flex items-center gap-2 h-8 px-2 mt-4 rounded border border-[var(--border)] bg-[var(--surface)]">
          <input type="checkbox" checked={includeInactive} onChange={(e) => onIncludeInactiveChange(e.target.checked)} />
          <span>Include inactive</span>
          <span className={tooltipClass}>
            Include inactive people/projects from snapshots. Turning this on increases coverage; turning it off keeps the graph focused on active staffing.
          </span>
        </label>

        {mode === 'client_experience' ? (
          <label className="text-[11px] w-[190px]">
            <ControlLabel
              label="Client filter"
              tooltip="Focuses Client Experience mode to one client. Selecting one client narrows nodes/edges to that client only."
            />
            <select className={`${fieldClass} h-8 text-xs py-1`} value={selectedClient} onChange={(e) => onSelectedClientChange(e.target.value)}>
              <option value="">All clients</option>
              {clientOptions.map((client) => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === 'client_experience' ? (
          <label className="text-[11px] w-[120px]">
            <ControlLabel
              label="Client project weight"
              tooltip="Weight applied to distinct projects in client score. Increase to prioritize breadth across many projects; decrease to reduce that effect."
            />
            <input
              className={`${fieldClass} h-8 text-xs py-1`}
              type="number"
              step="0.1"
              value={clientProjectWeight}
              onChange={(e) => onClientProjectWeightChange(Number(e.target.value || 0))}
            />
          </label>
        ) : null}

        {mode === 'client_experience' ? (
          <label className="text-[11px] w-[120px]">
            <ControlLabel
              label="Client week weight"
              tooltip="Weight applied to distinct weeks in client score. Increase to emphasize sustained time with a client; decrease to emphasize project count instead."
            />
            <input
              className={`${fieldClass} h-8 text-xs py-1`}
              type="number"
              step="0.1"
              value={clientWeekWeight}
              onChange={(e) => onClientWeekWeightChange(Number(e.target.value || 0))}
            />
          </label>
        ) : null}

        {mode === 'client_experience' ? (
          <label className="text-[11px] w-[260px] min-w-[220px]">
            <ControlLabel
              label={`Client score threshold: ${clientThreshold.toFixed(1)}`}
              tooltip="Minimum client score required to show an edge when All clients is selected. Raising it hides weaker links; lowering it reveals more links."
            />
            <input
              className="w-full"
              type="range"
              min={0}
              max={40}
              step={0.5}
              value={clientThreshold}
              onChange={(e) => onClientThresholdChange(Number(e.target.value || 0))}
            />
          </label>
        ) : null}

        <label className="text-[11px] w-[280px] min-w-[220px]">
          <ControlLabel
            label="Focus node"
            tooltip="Find and center a node quickly. Use this to inspect one node and its immediate neighborhood."
          />
          <div className="flex gap-1">
            <select className={`${fieldClass} h-8 text-xs py-1`} value={searchNodeId} onChange={(e) => setSearchNodeId(e.target.value)}>
              <option value="">Select...</option>
              {searchNodes.slice(0, 500).map((node) => (
                <option key={node.id} value={node.id}>{node.label} ({node.type})</option>
              ))}
            </select>
            <button type="button" className="px-2 py-1 rounded border border-[var(--border)] text-xs" onClick={() => searchNodeId && onSearchNode(searchNodeId)}>Go</button>
          </div>
        </label>
      </div>
      {mode === 'client_experience' && selectedClient ? (
        <div className="text-[10px] text-[var(--muted)] -mt-1">
          Threshold is bypassed while a specific client is selected.
        </div>
      ) : null}

      {mode === 'coworker' ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] w-[135px]">
            <ControlLabel
              label="Coworker project weight"
              tooltip="Weight applied to shared project count. Increase to reward repeated collaboration across multiple projects."
            />
            <input className={`${fieldClass} h-8 text-xs py-1`} type="number" step="0.1" value={coworkerProjectWeight} onChange={(e) => onCoworkerProjectWeightChange(Number(e.target.value || 0))} />
          </label>
          <label className="text-[11px] w-[130px]">
            <ControlLabel
              label="Coworker week weight"
              tooltip="Weight applied to shared weeks. Increase to emphasize long-running collaboration over one-off overlap."
            />
            <input className={`${fieldClass} h-8 text-xs py-1`} type="number" step="0.1" value={coworkerWeekWeight} onChange={(e) => onCoworkerWeekWeightChange(Number(e.target.value || 0))} />
          </label>
          <label className="text-[11px] w-[340px] min-w-[240px]">
            <ControlLabel
              label={`Coworker score threshold: ${coworkerThreshold.toFixed(1)}`}
              tooltip="Minimum coworker score required to render a link. Raise to show only strong partnerships; lower to show more weak ties."
            />
            <input className="w-full" type="range" min={0} max={40} step={0.5} value={coworkerThreshold} onChange={(e) => onCoworkerThresholdChange(Number(e.target.value || 0))} />
          </label>
        </div>
      ) : null}
    </section>
  );
};

export default NetworkGraphControls;
