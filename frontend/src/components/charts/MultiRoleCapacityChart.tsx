import React from 'react';

export interface RoleSeries {
  roleId: number;
  roleName: string;
  assigned: number[]; // per week
  capacity: number[]; // per week
}

export type ChartMode = 'hours' | 'percent';

export interface MultiRoleCapacityChartProps {
  weekKeys: string[]; // YYYY-MM-DD Sundays
  series: RoleSeries[]; // one entry per role
  mode?: ChartMode; // raw hours (default) or % of capacity
  tension?: number; // 0..1 smoothing (Catmull-Rom)
  hideLegend?: boolean; // allow parent to own legend/selection
}

const COLORS = [
  '#22c55e', // green
  '#60a5fa', // blue
  '#a78bfa', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#10b981', // emerald
  '#3b82f6', // blue-500
  '#eab308', // yellow-500
];

export function roleColorForId(roleId: number): string {
  // Deterministic color selection by id for legend/selection parity
  const hash = (Math.imul(roleId, 2654435761) >>> 0) % COLORS.length;
  return COLORS[hash];
}

export const MultiRoleCapacityChart: React.FC<MultiRoleCapacityChartProps> = ({ weekKeys, series, mode = 'hours', tension, hideLegend }) => {
  if (!weekKeys?.length || !series?.length) return <div className="text-[var(--muted)]">No data</div>;

  const pad = 40;
  const step = 44;
  const width = Math.max(720, pad * 2 + (weekKeys.length - 1) * step);
  const height = 300;
  const xLabel = 'Week';
  const yLabel = mode === 'hours' ? 'Hours' : '% of Capacity';

  // Optionally normalize to percent of capacity per role and week
  const normalized = mode === 'percent';
  const seriesData = series.map((s) => {
    if (!normalized) return s;
    const assignedPct = s.assigned.map((v, i) => {
      const cap = s.capacity[i] || 0;
      return cap > 0 ? (v / cap) * 100 : 0;
    });
    const capacityPct = s.capacity.map((cap) => (cap > 0 ? 100 : 0));
    return { ...s, assigned: assignedPct, capacity: capacityPct } as RoleSeries;
  });

  // Compute Y-domain
  let maxY = normalized ? 100 : 10;
  for (const s of seriesData) {
    for (const v of [...s.assigned, ...s.capacity]) maxY = Math.max(maxY, v || 0);
  }
  maxY *= 1.15;
  const x = (i: number) => pad + i * step;
  const y = (v: number) => height - pad - (v * (height - 2 * pad)) / maxY;

  // Smooth line using Catmull-Rom -> cubic Bezier conversion
  const linePath = (vals: number[]) => {
    const pts = vals.map((v, i) => ({ x: x(i), y: y(v) }));
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
    const smooth = Math.max(0, Math.min(1, tension ?? 0.75)); // looser default
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + ((p2.x - p0.x) / 6) * smooth;
      const c1y = p1.y + ((p2.y - p0.y) / 6) * smooth;
      const c2x = p2.x - ((p3.x - p1.x) / 6) * smooth;
      const c2y = p2.y - ((p3.y - p1.y) / 6) * smooth;
      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const yTicks = Array.from({ length: 4 + 1 }, (_, i) => Math.round((maxY * i) / 4));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} role="img" aria-label="Role capacity vs assigned">
        {/* Axes */}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#4b5563" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#4b5563" strokeWidth={1} />

        {/* Axis labels */}
        <text x={width / 2} y={height - 6} fontSize={11} fill="#94a3b8" textAnchor="middle">{xLabel}</text>
        <text x={4} y={height / 2} fontSize={11} fill="#94a3b8" textAnchor="middle" transform={`rotate(-90, 4, ${height / 2})`}>{yLabel}</text>

        {/* Y ticks */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad - 4} y1={y(t)} x2={width - pad} y2={y(t)} stroke="#374151" strokeDasharray="2,4" />
            <text x={8} y={y(t) + 4} fontSize={10} fill="#9ca3af">{t}</text>
          </g>
        ))}

        {/* Series */}
        {seriesData.map((s) => {
          const color = roleColorForId(s.roleId);
          const assignedPath = linePath(s.assigned);
          const capacityPath = linePath(s.capacity);
          return (
            <g key={s.roleId}>
              {/* capacity dashed */}
              <path d={capacityPath} stroke={color} strokeDasharray="6,4" strokeWidth={2} fill="none" />
              {/* assigned solid */}
              <path d={assignedPath} stroke={color} strokeWidth={2} fill="none" />
            </g>
          );
        })}

        {/* X labels */}
        {weekKeys.map((wk, i) => (
          <text key={wk} x={x(i)} y={height - pad + 14} fontSize={10} fill="#94a3b8" textAnchor="middle">
            {wk.slice(5)}
          </text>
        ))}
      </svg>

      {/* Legend (optional) */}
      {!hideLegend && (
        <div className="flex flex-wrap gap-3 mt-2">
          {seriesData.map((s) => (
            <div key={s.roleId} className="flex items-center gap-2 text-xs text-[var(--text)]">
              <span style={{ background: roleColorForId(s.roleId), width: 12, height: 2, display: 'inline-block' }}></span>
              <span>{s.roleName}</span>
              <span className="text-[var(--muted)]">(solid: {normalized ? '% assigned' : 'assigned'}, dashed: {normalized ? '100% cap' : 'capacity'})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MultiRoleCapacityChart;
