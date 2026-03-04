import React from 'react';
import type { NetworkGraphEdge, NetworkGraphNode } from '@/types/models';

type NodeConnection = {
  edge: NetworkGraphEdge;
  otherNode: NetworkGraphNode;
};

type Props = {
  node: NetworkGraphNode | null;
  connections: NodeConnection[];
};

function formatMetricValue(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(value % 1 === 0 ? 0 : 2) : '0';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null) return '-';
  return String(value);
}

const NetworkNodeDetailsPanel: React.FC<Props> = ({ node, connections }) => {
  if (!node) {
    return (
      <aside className="border border-[var(--border)] rounded-lg bg-[var(--card)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text)]">Node details</h3>
        <p className="text-xs text-[var(--muted)] mt-2">Select a node to inspect its strongest connections.</p>
      </aside>
    );
  }

  const topConnections = [...connections]
    .sort((a, b) => (Number(b.edge.score || 0) - Number(a.edge.score || 0)))
    .slice(0, 12);

  return (
    <aside className="border border-[var(--border)] rounded-lg bg-[var(--card)] p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text)]">{node.label}</h3>
        <div className="text-xs text-[var(--muted)] capitalize">{node.type.replace('_', ' ')}</div>
      </div>

      {node.metrics ? (
        <div>
          <div className="text-xs font-semibold text-[var(--muted)] mb-1">Node metrics</div>
          <div className="grid grid-cols-1 gap-1 text-xs">
            {Object.entries(node.metrics).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span className="text-[var(--muted)]">{key}</span>
                <span className="text-[var(--text)]">{formatMetricValue(value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className="text-xs font-semibold text-[var(--muted)] mb-1">Top connections ({connections.length})</div>
        <div className="space-y-2 max-h-[48vh] overflow-auto pr-1">
          {topConnections.length === 0 ? (
            <div className="text-xs text-[var(--muted)]">No connected edges for the current filters.</div>
          ) : (
            topConnections.map(({ edge, otherNode }) => (
              <div key={edge.id} className="rounded border border-[var(--border)] px-2 py-1.5 bg-[var(--surface)]">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text)] truncate" title={otherNode.label}>{otherNode.label}</span>
                  <span className="text-[var(--muted)]">score {Number(edge.score || 0).toFixed(2)}</span>
                </div>
                {edge.metrics ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(edge.metrics).map(([k, v]) => (
                      <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)]">
                        {k}: {formatMetricValue(v)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  );
};

export default NetworkNodeDetailsPanel;
