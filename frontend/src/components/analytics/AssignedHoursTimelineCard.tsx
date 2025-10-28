import React from 'react';
import Card from '@/components/ui/Card';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useAssignedHoursTimelineData, type TimelineWeeks } from '@/hooks/useAssignedHoursTimelineData';

type Props = {
  initialWeeks?: TimelineWeeks;
  className?: string;
  useGlobalDepartmentFilter?: boolean;
  departmentIdOverride?: number | null;
  includeChildrenOverride?: boolean;
};

// Small helper to format week labels nicely (show MM-DD)
function formatWeekLabel(wk: string): string {
  // wk expected like YYYY-Www or YYYY-MM-DD; fallback to tail 5-6 chars
  if (wk.includes('-') && wk.length >= 10) return wk.slice(5);
  return wk;
}

// Build an SVG path for area between top[] and bottom[] across N points
function buildAreaPath(xs: number[], top: number[], bottom: number[]): string {
  if (xs.length === 0) return '';
  const parts: string[] = [];
  parts.push(`M ${xs[0]} ${top[0]}`);
  for (let i = 1; i < xs.length; i++) parts.push(`L ${xs[i]} ${top[i]}`);
  for (let i = xs.length - 1; i >= 0; i--) parts.push(`L ${xs[i]} ${bottom[i]}`);
  parts.push('Z');
  return parts.join(' ');
}

// Build a simple polyline path for a dataset
function buildLinePath(xs: number[], ys: number[]): string {
  if (xs.length === 0) return '';
  const parts: string[] = [`M ${xs[0]} ${ys[0]}`];
  for (let i = 1; i < xs.length; i++) parts.push(`L ${xs[i]} ${ys[i]}`);
  return parts.join(' ');
}

const AssignedHoursTimelineCard: React.FC<Props> = ({
  initialWeeks = 8,
  className,
  useGlobalDepartmentFilter = true,
  departmentIdOverride,
  includeChildrenOverride,
}) => {
  const [weeks, setWeeks] = React.useState<TimelineWeeks>(initialWeeks);
  const { state: deptState } = useDepartmentFilter();
  const departmentId = useGlobalDepartmentFilter ? (deptState.selectedDepartmentId ?? null) : (departmentIdOverride ?? null);
  const includeChildren = useGlobalDepartmentFilter ? deptState.includeChildren : !!includeChildrenOverride;
  const { loading, error, weekKeys, series, maxY } = useAssignedHoursTimelineData({ weeks, departmentId, includeChildren });

  // SVG layout
  const W = 720;
  const H = 220;
  const PAD_LEFT = 40;
  const PAD_RIGHT = 16;
  const PAD_TOP = 16;
  const PAD_BOTTOM = 28;
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  const n = weekKeys.length;
  const xs = React.useMemo(() => {
    if (n <= 1) return [PAD_LEFT + innerW / 2];
    const step = innerW / (n - 1);
    return Array.from({ length: n }, (_, i) => PAD_LEFT + i * step);
  }, [n, innerW]);

  const scaleY = (val: number) => {
    const m = Math.max(1, maxY);
    const y = PAD_TOP + innerH - (val / m) * innerH;
    return y;
  };

  // Build stacked areas (bottom: active, middle: active_ca, top: other)
  const yActive = series.active.map(scaleY);
  const cumActive = series.active.slice();
  const yCumActive = cumActive.map(scaleY);

  const cumActiveCa = series.active.map((v, i) => v + (series.active_ca[i] || 0));
  const yCumActiveCa = cumActiveCa.map(scaleY);

  const cumAll = series.active.map((v, i) => v + (series.active_ca[i] || 0) + (series.other[i] || 0));
  const yCumAll = cumAll.map(scaleY);

  const baseLine = new Array(n).fill(PAD_TOP + innerH);

  // Colors (VSCode theme inspired): active=emerald, active_ca=blue, other=slate
  const C_ACTIVE = '#34d399';
  const C_ACTIVE_CA = '#60a5fa';
  const C_OTHER = '#64748b';

  // Y-axis ticks (0, 25%, 50%, 75%, 100%)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    y: PAD_TOP + innerH - t * innerH,
    v: Math.round(t * Math.max(1, maxY)),
  }));

  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] ${className || ''}`}>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">Assigned Hours Timeline</h3>
            <div className="text-[10px] text-[var(--muted)]">Stacked by status; includes current week</div>
          </div>
          <div className="flex items-center gap-1">
            {[4, 8, 12, 16].map((w) => (
              <button
                key={w}
                onClick={() => setWeeks(w as TimelineWeeks)}
                className={`px-2 py-0.5 text-[11px] rounded border transition-colors focus-visible:ring-2 ring-[var(--focus)] ring-offset-1 ring-offset-[var(--card)] ${
                  weeks === w
                    ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                    : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                }`}
                aria-pressed={weeks === w}
              >
                {w}w
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-[var(--muted)]">Loading timeline...</div>
        ) : error ? (
          <div className="text-red-400">Error: {error}</div>
        ) : n === 0 ? (
          <div className="text-[var(--muted)]">No assigned hours</div>
        ) : (
          <div className="w-full overflow-x-auto">
            <svg role="img" aria-label="Assigned Hours Timeline" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
              <title>Assigned Hours Timeline</title>
              <desc>Stacked area chart of assigned hours per week, split by project status.</desc>

              {/* Gridlines and Y ticks */}
              {ticks.map((t, i) => (
                <g key={`tick-${i}`}>
                  <line x1={PAD_LEFT} x2={W - PAD_RIGHT} y1={t.y} y2={t.y} stroke="var(--border)" strokeOpacity={0.6} />
                  <text x={PAD_LEFT - 4} y={t.y} textAnchor="end" dominantBaseline="central" fill="var(--muted)" fontSize={10}>
                    {t.v}
                  </text>
                </g>
              ))}

              {/* X-axis week labels (sparse for readability) */}
              {xs.map((x, i) => {
                const sparse = n <= 8 || i % 2 === 0 || i === n - 1;
                return (
                  <g key={`x-${i}`}>
                    <line x1={x} x2={x} y1={PAD_TOP} y2={PAD_TOP + innerH} stroke="var(--border)" strokeOpacity={0.15} />
                    {sparse && (
                      <text x={x} y={H - 6} textAnchor="middle" fill="var(--muted)" fontSize={10}>
                        {formatWeekLabel(weekKeys[i])}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Stacked areas: order matters (draw bottom first) */}
              {/* Active area (bottom) */}
              <path d={buildAreaPath(xs, yCumActive, baseLine)} fill={C_ACTIVE} fillOpacity={0.28} />
              <path d={buildLinePath(xs, yCumActive)} stroke={C_ACTIVE} strokeWidth={2} fill="none" />

              {/* Active CA area (middle) */}
              <path d={buildAreaPath(xs, yCumActiveCa, yCumActive)} fill={C_ACTIVE_CA} fillOpacity={0.28} />
              <path d={buildLinePath(xs, yCumActiveCa)} stroke={C_ACTIVE_CA} strokeWidth={2} fill="none" />

              {/* Other area (top) */}
              <path d={buildAreaPath(xs, yCumAll, yCumActiveCa)} fill={C_OTHER} fillOpacity={0.22} />
              <path d={buildLinePath(xs, yCumAll)} stroke={C_OTHER} strokeWidth={2} fill="none" />
            </svg>

            {/* Inline legend */}
            <div className="mt-2 flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: C_ACTIVE }} /> <span className="text-[var(--text)]">Active</span></div>
              <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: C_ACTIVE_CA }} /> <span className="text-[var(--text)]">Active CA</span></div>
              <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: C_OTHER }} /> <span className="text-[var(--text)]">Other</span></div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default AssignedHoursTimelineCard;

