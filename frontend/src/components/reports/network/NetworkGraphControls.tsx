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
          <span className="block text-[var(--muted)] mb-1">Mode</span>
          <select className={`${fieldClass} h-8 text-xs py-1`} value={mode} onChange={(e) => onModeChange(e.target.value as NetworkGraphMode)}>
            <option value="project_people">Project-People</option>
            <option value="coworker">Coworker Network</option>
            <option value="client_experience">Client Experience</option>
          </select>
        </label>

        <label className="text-[11px] w-[165px]">
          <span className="block text-[var(--muted)] mb-1">Window</span>
          <select className={`${fieldClass} h-8 text-xs py-1`} value={windowPreset} onChange={(e) => onWindowPresetChange(e.target.value as WindowPreset)}>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
            <option value="24m">Last 24 months</option>
            <option value="all">All available</option>
            <option value="custom">Custom months</option>
          </select>
        </label>

        <label className="text-[11px] w-[110px]">
          <span className="block text-[var(--muted)] mb-1">Custom months</span>
          <input className={`${fieldClass} h-8 text-xs py-1`} type="number" min={1} max={240} value={customMonths} disabled={windowPreset !== 'custom'} onChange={(e) => onCustomMonthsChange(Math.max(1, Math.min(240, Number(e.target.value || 24))))} />
        </label>

        <label className="text-[11px] w-[110px]">
          <span className="block text-[var(--muted)] mb-1">Max edges</span>
          <input className={`${fieldClass} h-8 text-xs py-1`} type="number" min={100} max={10000} value={maxEdges} onChange={(e) => onMaxEdgesChange(Math.max(100, Math.min(10000, Number(e.target.value || 4000))))} />
        </label>

        <label className="text-[11px] flex items-center gap-2 h-8 px-2 mt-[17px] rounded border border-[var(--border)] bg-[var(--surface)]">
          <input type="checkbox" checked={includeInactive} onChange={(e) => onIncludeInactiveChange(e.target.checked)} />
          <span>Include inactive</span>
        </label>

        {mode === 'client_experience' ? (
          <label className="text-[11px] w-[190px]">
            <span className="block text-[var(--muted)] mb-1">Client filter</span>
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
            <span className="block text-[var(--muted)] mb-1">Client project weight</span>
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
            <span className="block text-[var(--muted)] mb-1">Client week weight</span>
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
            <span className="block text-[var(--muted)] mb-1">Client score threshold: {clientThreshold.toFixed(1)}</span>
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
          <span className="block text-[var(--muted)] mb-1">Focus node</span>
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
            <span className="block text-[var(--muted)] mb-1">Coworker project weight</span>
            <input className={`${fieldClass} h-8 text-xs py-1`} type="number" step="0.1" value={coworkerProjectWeight} onChange={(e) => onCoworkerProjectWeightChange(Number(e.target.value || 0))} />
          </label>
          <label className="text-[11px] w-[130px]">
            <span className="block text-[var(--muted)] mb-1">Coworker week weight</span>
            <input className={`${fieldClass} h-8 text-xs py-1`} type="number" step="0.1" value={coworkerWeekWeight} onChange={(e) => onCoworkerWeekWeightChange(Number(e.target.value || 0))} />
          </label>
          <label className="text-[11px] w-[340px] min-w-[240px]">
            <span className="block text-[var(--muted)] mb-1">Coworker score threshold: {coworkerThreshold.toFixed(1)}</span>
            <input className="w-full" type="range" min={0} max={40} step={0.5} value={coworkerThreshold} onChange={(e) => onCoworkerThresholdChange(Number(e.target.value || 0))} />
          </label>
        </div>
      ) : null}
    </section>
  );
};

export default NetworkGraphControls;
