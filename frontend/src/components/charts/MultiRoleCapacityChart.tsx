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
  height?: number; // override default height
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

export const MultiRoleCapacityChart: React.FC<MultiRoleCapacityChartProps> = ({ weekKeys, series, mode = 'hours', tension, hideLegend, height: heightProp }) => {
  // Keep the chart frame visible even when series is empty (e.g., all roles deselected).
  // Only fall back to a small "No data" placeholder when there are no week keys to render an axis.
  if (!weekKeys?.length) return <div className="text-[var(--muted)]">No data</div>;

  // Padding tuned to avoid clipping rotated Y label and y-tick values
  const padV = 40; // top/bottom
  const padLeft = 72; // extra room for label and tick text
  const padRight = 24;
  const step = 44;
  const width = Math.max(720, padLeft + padRight + (weekKeys.length - 1) * step);
  const height = heightProp ?? 300;
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
  if (!normalized) maxY *= 1.15;
  const x = (i: number) => padLeft + i * step;
  const y = (v: number) => height - padV - (v * (height - 2 * padV)) / maxY;

  // Hover state for tooltip/crosshair
  const [hover, setHover] = React.useState<null | {
    i: number;
    roleId: number;
    roleName: string;
    x: number;
    y: number; // anchor near assigned line
    rawAssigned: number;
    rawCapacity: number;
    pctAssigned: number;
    availableHours: number;
    availablePct: number;
    color: string;
  }>(null);

  // Smooth line using Catmull-Rom -> cubic Bezier conversion
  const linePath = (vals: number[]) => {
    const pts = vals.map((v, i) => ({ x: x(i), y: y(v) }));
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
    const smooth = Math.max(0, Math.min(1, tension ?? 0.75)); // looser default
    const yFloor = y(0); // do not allow curves to dip below 0
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + ((p2.x - p0.x) / 6) * smooth;
      let c1y = p1.y + ((p2.y - p0.y) / 6) * smooth;
      const c2x = p2.x - ((p3.x - p1.x) / 6) * smooth;
      let c2y = p2.y - ((p3.y - p1.y) / 6) * smooth;
      // Clamp control points so the curve never dips below 0
      if (c1y > yFloor) c1y = yFloor;
      if (c2y > yFloor) c2y = yFloor;
      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  // Build y-axis ticks
  let yTicks: number[] = [];
  if (normalized) {
    // Fixed percent ticks at 0,20,40,60,80,100
    yTicks = [0, 20, 40, 60, 80, 100];
  } else {
    // Nice tick step around 10/50/100 (1-2-5 progression * power of ten)
    const desired = 5;
    const raw = maxY / desired;
    const pow10 = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
    const r = raw / pow10;
    let step = 1;
    if (r <= 1) step = 1; else if (r <= 2) step = 2; else if (r <= 5) step = 5; else step = 10;
    step *= pow10;
    const top = Math.ceil(maxY / step) * step;
    for (let v = 0; v <= top + 1e-9; v += step) yTicks.push(Math.round(v));
  }

  return (
    <div style={{ overflowX: 'auto', display: 'inline-block', maxWidth: '100%', position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label="Role capacity vs assigned">
        {/* Axes */}
        <line x1={padLeft} y1={height - padV} x2={width - padRight} y2={height - padV} stroke="#4b5563" strokeWidth={1} />
        <line x1={padLeft} y1={padV} x2={padLeft} y2={height - padV} stroke="#4b5563" strokeWidth={1} />

        {/* Axis labels */}
        <text x={width / 2} y={height - 6} fontSize={11} fill="#94a3b8" textAnchor="middle">{xLabel}</text>
        <text x={18} y={height / 2} fontSize={11} fill="#94a3b8" textAnchor="middle" transform={`rotate(-90, 18, ${height / 2})`}>{yLabel}</text>

        {/* Y ticks */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padLeft - 4} y1={y(t)} x2={width - padRight} y2={y(t)} stroke="#374151" strokeDasharray="2,4" />
            <text x={padLeft - 10} y={y(t) + 4} fontSize={10} fill="#9ca3af" textAnchor="end">{t}</text>
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

        {/* Hover crosshair + markers */}
        {hover && (
          <g pointerEvents="none">
            {/* vertical line */}
            <line x1={hover.x} y1={padV} x2={hover.x} y2={height - padV} stroke="#6b7280" strokeDasharray="3,3" />
            {/* markers for hovered role */}
            {(() => {
              const sRaw = series.find((r) => r.roleId === hover.roleId);
              if (!sRaw) return null;
              const i = hover.i;
              const color = hover.color;
              const ay = y(normalized ? (sRaw.assigned[i] && sRaw.capacity[i] ? (sRaw.assigned[i] / (sRaw.capacity[i] || 1)) * 100 : 0) : (sRaw.assigned[i] || 0));
              const cy = y(normalized ? (sRaw.capacity[i] > 0 ? 100 : 0) : (sRaw.capacity[i] || 0));
              const ax = x(i);
              return (
                <g>
                  <circle cx={ax} cy={ay} r={3} fill={color} />
                  <circle cx={ax} cy={cy} r={3} fill={color} opacity={0.7} />
                </g>
              );
            })()}
          </g>
        )}

        {/* Transparent overlay to capture pointer events */}
        <rect
          x={padLeft}
          y={padV}
          width={width - padLeft - padRight}
          height={height - 2 * padV}
          fill="transparent"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const ne = e.nativeEvent as any;
            const offsetX: number = ne.offsetX;
            const offsetY: number = ne.offsetY;
            // Find nearest week index
            let i = Math.round((offsetX - padLeft) / step);
            i = Math.max(0, Math.min(weekKeys.length - 1, i));
            const mx = x(i);
            const my = offsetY;
            // Choose nearest role series to cursor at this x
            let best: null | { roleId: number; roleName: string; dist: number } = null;
            for (const s of seriesData) {
              const ay = y(s.assigned[i] || 0);
              const cy = y(s.capacity[i] || 0);
              const d = Math.min(Math.abs(ay - my), Math.abs(cy - my));
              if (!best || d < best.dist) best = { roleId: s.roleId, roleName: s.roleName, dist: d };
            }
            if (!best) { setHover(null); return; }
            const raw = series.find(r => r.roleId === best!.roleId);
            if (!raw) { setHover(null); return; }
            const rawAssigned = Number(raw.assigned[i] || 0);
            const rawCapacity = Number(raw.capacity[i] || 0);
            const pctAssigned = rawCapacity > 0 ? (rawAssigned / rawCapacity) * 100 : 0;
            const availableHours = Math.max(0, rawCapacity - rawAssigned);
            const availablePct = rawCapacity > 0 ? Math.max(0, 100 - pctAssigned) : 0;
            const color = roleColorForId(best.roleId);
            const ayPlot = y(normalized ? (rawCapacity > 0 ? (rawAssigned / rawCapacity) * 100 : 0) : rawAssigned);
            setHover({ i, roleId: best.roleId, roleName: best.roleName, x: mx, y: ayPlot, rawAssigned, rawCapacity, pctAssigned, availableHours, availablePct, color });
          }}
        />

        {/* X labels */}
        {weekKeys.map((wk, i) => (
          <text key={wk} x={x(i)} y={height - padV + 14} fontSize={10} fill="#94a3b8" textAnchor="middle">
            {wk.slice(5)}
          </text>
        ))}
      </svg>

      {/* HTML tooltip rendered above the SVG (positioned within container) */}
      {hover && (
        <div
          style={{ position: 'absolute', left: hover.x + 10, top: Math.max(8, hover.y - 36), pointerEvents: 'none', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', color: 'var(--text)', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
          role="tooltip"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, background: hover.color, borderRadius: 2, display: 'inline-block' }} />
            <strong style={{ fontWeight: 600 }}>{hover.roleName}</strong>
          </div>
          <div style={{ color: 'var(--muted)' }}>{weekKeys[hover.i]}</div>
          <div>Assigned: {Math.round(hover.rawAssigned)}h / Available: {Math.round(hover.availableHours)}h</div>
          <div>Assigned: {Math.round(hover.pctAssigned)}% / Available: {Math.round(hover.availablePct)}%</div>
        </div>
      )}

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
