import React from 'react';
import Card from '@/components/ui/Card';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useAssignedHoursByClientData, type ClientHorizonWeeks } from '@/hooks/useAssignedHoursByClientData';
import { getAssignedHoursClientProjects } from '@/services/analyticsApi';

type Slice = { key: string; label: string; value: number; color: string };

function PieChart({ slices, size = 120, title = 'Assigned Hours by Client', onSliceClick }: { slices: Slice[]; size?: number; title?: string; onSliceClick?: (s: Slice) => void }) {
  const total = Math.max(0, slices.reduce((s, x) => s + x.value, 0));
  const data = total > 0 ? slices : (slices.length ? slices : [{ key: 'empty', label: 'No Data', value: 1, color: 'rgba(148,163,184,0.35)' }]);
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
    const p1 = polarToCartesian(cx, cy, r, startAngle);
    const p2 = polarToCartesian(cx, cy, r, endAngle);
    const largeArc = sweep > 180 ? 1 : 0;
    if (fraction >= 0.999 && data.length === 1) {
      return <circle key={s.key} cx={cx} cy={cy} r={r} fill={s.color} />;
    }
    const d = [
      `M ${cx} ${cy}`,
      `L ${p1.x} ${p1.y}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
      'Z',
    ].join(' ');
    startAngle = endAngle;
    return (
      <path
        key={`${s.key}-${idx}`}
        d={d}
        fill={s.color}
        className={total > 0 ? 'cursor-pointer' : undefined}
        onClick={total > 0 ? () => onSliceClick?.(s) : undefined}
      />
    );
  });

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
  initialWeeks?: ClientHorizonWeeks; // 4 | 5 | 12 | 16
  size?: number; // pie size
  useGlobalDepartmentFilter?: boolean;
  departmentIdOverride?: number | null;
  includeChildrenOverride?: boolean;
  className?: string;
};

const AssignedHoursByClientCard: React.FC<Props> = ({
  initialWeeks = 4,
  size = 120,
  useGlobalDepartmentFilter = true,
  departmentIdOverride,
  includeChildrenOverride,
  className,
}) => {
  const [weeks, setWeeks] = React.useState<ClientHorizonWeeks>(initialWeeks);
  const { state: deptState } = useDepartmentFilter();
  const departmentId = useGlobalDepartmentFilter ? (deptState.selectedDepartmentId ?? null) : (departmentIdOverride ?? null);
  const includeChildren = useGlobalDepartmentFilter ? deptState.includeChildren : !!includeChildrenOverride;
  const { loading, error, slices, total } = useAssignedHoursByClientData({ weeks, departmentId, includeChildren });

  const [focusClient, setFocusClient] = React.useState<string | null>(null);

  const PALETTE = React.useMemo(() => [
    '#34d399', '#60a5fa', '#f59e0b', '#ef4444', '#a78bfa', '#22d3ee',
    '#f472b6', '#10b981', '#93c5fd', '#fbbf24', '#f87171', '#38bdf8',
    '#c084fc', '#2dd4bf', '#fb7185',
  ], []);

  const [drilldownLoading, setDrilldownLoading] = React.useState(false);
  const [drilldownError, setDrilldownError] = React.useState<string | null>(null);
  const [drilldown, setDrilldown] = React.useState<Slice[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!focusClient) return;
      try {
        setDrilldownLoading(true);
        setDrilldownError(null);
        const res = await getAssignedHoursClientProjects(focusClient, {
          weeks,
          department: departmentId != null ? Number(departmentId) : undefined,
          include_children: departmentId != null ? (includeChildren ? 1 : 0) : undefined,
        });
        if (cancelled) return;
        const rows = (res.projects || []).map((p, idx) => ({
          key: String(p.id),
          label: p.name,
          value: p.hours,
          color: PALETTE[idx % PALETTE.length],
        }));
        setDrilldown(rows);
      } catch (e: any) {
        if (cancelled) return;
        setDrilldownError(e?.message || 'Failed to load client projects');
      } finally {
        if (!cancelled) setDrilldownLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [focusClient, weeks, departmentId, includeChildren]);

  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] ${className || ''}`}>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">
              {focusClient ? `Client: ${focusClient} — By Project` : 'Assigned Hours by Client'}
            </h3>
            <div className="text-[10px] text-[var(--muted)]">
              Includes current week; {focusClient ? 'projects within client' : 'grouped by client'}
            </div>
          </div>
          {focusClient && (
            <button
              onClick={() => setFocusClient(null)}
              className="text-[11px] px-2 py-0.5 rounded border bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
              aria-label="Back to clients"
            >
              Back
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 mb-2">
          {[4, 8, 12, 16].map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w as ClientHorizonWeeks)}
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
          <div className="relative overflow-hidden">
            <div
              className="flex transition-transform duration-300"
              style={{ transform: focusClient ? 'translateX(-100%)' : 'translateX(0%)' }}
            >
              {/* Panel 1: By Client */}
              <div className="w-full flex-shrink-0 flex items-center gap-3">
                <div className="shrink-0">
                  <PieChart slices={slices} size={size} onSliceClick={(s) => setFocusClient(s.label)} />
                </div>

                <div className="flex flex-col gap-2 w-full">
                  {slices.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setFocusClient(s.label)}
                      className="flex items-center gap-2 w-full text-left hover:bg-[var(--surfaceHover)] px-1 py-0.5 rounded"
                    >
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <div className="text-xs text-[var(--text)] flex items-center justify-between gap-2 w-full whitespace-nowrap">
                        <span className="truncate" title={s.label}>{s.label}</span>
                        <span className="text-[var(--muted)] flex-shrink-0">{Math.round(s.value)}h · {pct(s.value)}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Panel 2: By Project within selected Client */}
              <div className="w-full flex-shrink-0 flex items-center gap-3">
                <div className="shrink-0">
                  <PieChart slices={drilldown} size={size} />
                </div>
                <div className="flex flex-col gap-2 w-full">
                  {drilldownLoading && (
                    <div className="text-[var(--muted)] text-xs">Loading projects…</div>
                  )}
                  {drilldownError && (
                    <div className="text-red-400 text-xs">{drilldownError}</div>
                  )}
                  {!drilldownLoading && !drilldownError && drilldown.map((s) => (
                    <div key={s.key} className="flex items-center gap-2 w-full">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <div className="text-xs text-[var(--text)] flex items-center justify-between gap-2 w-full whitespace-nowrap">
                        <span className="truncate" title={s.label}>{s.label}</span>
                        <span className="text-[var(--muted)] flex-shrink-0">{Math.round(s.value)}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default AssignedHoursByClientCard;
