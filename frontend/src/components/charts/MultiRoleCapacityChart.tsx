import React from 'react';

export interface RoleSeries {
  roleId: number;
  roleName: string;
  assigned: number[]; // per week
  capacity: number[]; // per week
}

export interface MultiRoleCapacityChartProps {
  weekKeys: string[]; // YYYY-MM-DD Sundays
  series: RoleSeries[]; // one entry per role
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

export const MultiRoleCapacityChart: React.FC<MultiRoleCapacityChartProps> = ({ weekKeys, series }) => {
  if (!weekKeys?.length || !series?.length) return <div className="text-[var(--muted)]">No data</div>;

  const pad = 40;
  const step = 44;
  const width = Math.max(720, pad * 2 + (weekKeys.length - 1) * step);
  const height = 300;

  // Compute Y-domain
  let maxY = 10;
  for (const s of series) {
    for (const v of [...s.assigned, ...s.capacity]) maxY = Math.max(maxY, v || 0);
  }
  maxY *= 1.15;
  const x = (i: number) => pad + i * step;
  const y = (v: number) => height - pad - (v * (height - 2 * pad)) / maxY;

  const linePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${y(v)}`).join(' ');

  const yTicks = Array.from({ length: 4 + 1 }, (_, i) => Math.round((maxY * i) / 4));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} role="img" aria-label="Role capacity vs assigned">
        {/* Axes */}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="#4b5563" strokeWidth={1} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="#4b5563" strokeWidth={1} />

        {/* Y ticks */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad - 4} y1={y(t)} x2={width - pad} y2={y(t)} stroke="#374151" strokeDasharray="2,4" />
            <text x={8} y={y(t) + 4} fontSize={10} fill="#9ca3af">{t}</text>
          </g>
        ))}

        {/* Series */}
        {series.map((s, idx) => {
          const color = COLORS[idx % COLORS.length];
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

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2">
        {series.map((s, idx) => (
          <div key={s.roleId} className="flex items-center gap-2 text-xs text-[var(--text)]">
            <span style={{ background: COLORS[idx % COLORS.length], width: 12, height: 2, display: 'inline-block' }}></span>
            <span>{s.roleName}</span>
            <span className="text-[var(--muted)]">(solid: assigned, dashed: capacity)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MultiRoleCapacityChart;

