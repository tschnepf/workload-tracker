import React from 'react';
import Card from '@/components/ui/Card';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { useAssignedHoursBreakdownData, type HorizonWeeks, type Slice } from '@/hooks/useAssignedHoursBreakdownData';

// removed old donut chart (kept PieChart below)

// Full pie renderer (filled sectors). Used for compact analytics card.
function PieChart({ slices, size = 120, title = 'Assigned Hours by Status' }: { slices: Slice[]; size?: number; title?: string }) {
  const total = Math.max(0, slices.reduce((s, x) => s + x.value, 0));
  const data = total > 0 ? slices : slices.map(s => ({ ...s, value: 1 }));
  const sum = data.reduce((s, x) => s + x.value, 0);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
    const a = (angle - 90) * (Math.PI / 180);
    return { x: cx + (r * Math.cos(a)), y: cy + (r * Math.sin(a)) };
  }

  let startAngle = 0;
  const paths = data.map((s, idx) => {
    const fraction = s.value / sum;
    const sweep = fraction * 360;
    const endAngle = startAngle + sweep;
    // Points for the arc segment (clockwise)
    const p1 = polarToCartesian(cx, cy, r, startAngle);
    const p2 = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = sweep > 180 ? 1 : 0;

    // Special-case: a single full slice (avoid degenerate arc)
    if (fraction >= 0.999 && data.length === 1) {
      return <circle key={s.key} cx={cx} cy={cy} r={r} fill={s.color} />;
    }

    const d = [
      `M ${cx} ${cy}`,
      `L ${p1.x} ${p1.y}`,
      // Sweep flag 1 -> clockwise
      `A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
      'Z',
    ].join(' ');
    startAngle = endAngle;
    return <path key={`${s.key}-${idx}`} d={d} fill={s.color} />;
  });

  // Compose a short description for a11y
  const desc = total > 0
    ? data.map(s => `${s.label}: ${Math.round(s.value)} hours`).join(', ')
    : 'No assigned hours';

  return (
    <svg role="img" aria-label={title} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <title>{title}</title>
      <desc>{desc}</desc>
      {total === 0 && <circle cx={cx} cy={cy} r={r} fill="rgba(148,163,184,0.25)" />}
      {paths}
    </svg>
  );
}

type Props = {
  initialWeeks?: HorizonWeeks;
  size?: number; // pie size
  useGlobalDepartmentFilter?: boolean;
  departmentIdOverride?: number | null;
  includeChildrenOverride?: boolean;
  className?: string;
  responsive?: boolean; // derive size from container width when true
};

const AssignedHoursBreakdownCard: React.FC<Props> = ({
  initialWeeks = 4,
  size = 120,
  useGlobalDepartmentFilter = true,
  departmentIdOverride,
  includeChildrenOverride,
  className,
  responsive = false,
}) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const { width } = useContainerWidth(rootRef);
  const [weeks, setWeeks] = React.useState<HorizonWeeks>(initialWeeks);
  const { state: deptState } = useDepartmentFilter();
  const { state: verticalState } = useVerticalFilter();
  const departmentId = useGlobalDepartmentFilter ? (deptState.selectedDepartmentId ?? null) : (departmentIdOverride ?? null);
  const includeChildren = useGlobalDepartmentFilter ? deptState.includeChildren : !!includeChildrenOverride;
  const { loading, error, slices, total } = useAssignedHoursBreakdownData({
    weeks,
    departmentId,
    includeChildren,
    vertical: verticalState.selectedVerticalId ?? null,
  });

  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const chartSize = React.useMemo(() => {
    if (!responsive || !width) return size;
    const s = Math.floor(width * 0.35);
    return Math.max(96, Math.min(180, s));
  }, [responsive, width, size]);

  const legendLayoutClass = React.useMemo(() => {
    if ((width ?? 0) >= 520) {
      return 'flex flex-wrap gap-x-6 gap-y-1';
    }
    return 'flex flex-col gap-2';
  }, [width]);

  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] w-full min-w-[16rem] ${className || ''}`}>
      <div ref={rootRef} className="p-4">
        <div className="mb-2">
          <h3 className="text-base font-semibold text-[var(--text)]">Assigned Hours</h3>
          <div className="text-[10px] text-[var(--muted)]">Includes current week; by project type</div>
        </div>
        <div className="flex items-center gap-1 mb-2">
          {[4, 8, 12, 16].map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w as HorizonWeeks)}
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

        {loading ? (
          <div className="text-[var(--muted)]">Calculating hours...</div>
        ) : error ? (
          <div className="text-red-400">Error: {error}</div>
        ) : total <= 0 ? (
          <div className="text-[var(--muted)]">No upcoming assigned hours</div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              <PieChart slices={slices} size={chartSize} />
            </div>

            <div className={legendLayoutClass}>
              {slices.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <div className="text-xs text-[var(--text)]">
                    {s.label}
                    <span className="text-[var(--muted)]"> — {Math.round(s.value)}h • {pct(s.value)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default AssignedHoursBreakdownCard;
