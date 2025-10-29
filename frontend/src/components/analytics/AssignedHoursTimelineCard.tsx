import React from 'react';
import Card from '@/components/ui/Card';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useAssignedHoursTimelineData, type TimelineWeeks } from '@/hooks/useAssignedHoursTimelineData';
import { useAssignedHoursDeliverableTimelineData } from '@/hooks/useAssignedHoursDeliverableTimelineData';
import { getAssignedHoursDeliverableTimeline } from '@/services/analyticsApi';

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
  const [mode, setMode] = React.useState<'status' | 'deliverable'>('status');
  const { state: deptState } = useDepartmentFilter();
  const departmentId = useGlobalDepartmentFilter ? (deptState.selectedDepartmentId ?? null) : (departmentIdOverride ?? null);
  const includeChildren = useGlobalDepartmentFilter ? deptState.includeChildren : !!includeChildrenOverride;
  const statusData = useAssignedHoursTimelineData({ weeks, departmentId, includeChildren });
  const deliverableData = useAssignedHoursDeliverableTimelineData({ weeks, departmentId, includeChildren, includeActiveCa: true });

  // Category expansion (SD/DD/IFP/Masterplan/Bulletins/CA)
  const [openCategory, setOpenCategory] = React.useState<null | 'sd' | 'dd' | 'ifp' | 'masterplan' | 'bulletins' | 'ca'>(null);
  const [categoryDetails, setCategoryDetails] = React.useState<Record<string, { loading: boolean; error: string | null; projects: Array<{ projectId: number; projectName: string; hours: number }> }>>({});

  const loadCategoryDetails = React.useCallback(async (cat: 'sd'|'dd'|'ifp'|'masterplan'|'bulletins'|'ca') => {
    setCategoryDetails(prev => ({ ...prev, [cat]: { loading: true, error: null, projects: prev[cat]?.projects || [] } }));
    try {
      const res = await getAssignedHoursDeliverableTimeline({
        weeks,
        department: departmentId != null ? Number(departmentId) : undefined,
        include_children: departmentId != null ? (includeChildren ? 1 : 0) : undefined,
        include_active_ca: 1,
        debug: 1,
      });
      const dbg: any[] = (res as any).categoriesDebug || [];
      const map = new Map<number, { projectId: number; projectName: string; hours: number }>();
      for (const row of dbg) {
        if (row.category !== cat) continue;
        const pid = Number(row.projectId);
        const name = String(row.projectName || pid);
        const hrs = Number(row.hours || 0);
        if (!map.has(pid)) map.set(pid, { projectId: pid, projectName: name, hours: 0 });
        map.get(pid)!.hours += hrs;
      }
      const list = Array.from(map.values()).sort((a, b) => b.hours - a.hours);
      setCategoryDetails(prev => ({ ...prev, [cat]: { loading: false, error: null, projects: list } }));
    } catch (e: any) {
      setCategoryDetails(prev => ({ ...prev, [cat]: { loading: false, error: e?.message || 'Failed to load details', projects: [] } }));
    }
  }, [weeks, departmentId, includeChildren]);

  // Extras expansion (additional breakdown labels including Other)
  const [openExtra, setOpenExtra] = React.useState<string | null>(null);
  const [extraDetails, setExtraDetails] = React.useState<Record<string, { loading: boolean; error: string | null; projects: Array<{ projectId: number; projectName: string; hours: number }> }>>({});

  const loadExtraDetails = React.useCallback(async (label: string) => {
    setExtraDetails(prev => ({ ...prev, [label]: { loading: true, error: null, projects: prev[label]?.projects || [] } }));
    try {
      const res = await getAssignedHoursDeliverableTimeline({
        weeks,
        department: departmentId != null ? Number(departmentId) : undefined,
        include_children: departmentId != null ? (includeChildren ? 1 : 0) : undefined,
        include_active_ca: 1,
        debug: 1,
      });
      const rows: any[] = (res as any).extrasDebug || [];
      const map = new Map<number, { projectId: number; projectName: string; hours: number }>();
      for (const row of rows) {
        if ((row.label || 'Unspecified') !== label) continue;
        const pid = Number(row.projectId);
        const name = String(row.projectName || pid);
        const hrs = Number(row.hours || 0);
        if (!map.has(pid)) map.set(pid, { projectId: pid, projectName: name, hours: 0 });
        map.get(pid)!.hours += hrs;
      }
      const list = Array.from(map.values()).sort((a, b) => b.hours - a.hours);
      setExtraDetails(prev => ({ ...prev, [label]: { loading: false, error: null, projects: list } }));
    } catch (e: any) {
      setExtraDetails(prev => ({ ...prev, [label]: { loading: false, error: e?.message || 'Failed to load details', projects: [] } }));
    }
  }, [weeks, departmentId, includeChildren]);

  // Legacy Unspecified expansion vars retained to satisfy type-checking for an old block we no longer render
  const [unspecOpen, setUnspecOpen] = React.useState(false);
  const [unspecLoading, setUnspecLoading] = React.useState(false);
  const [unspecError, setUnspecError] = React.useState<string | null>(null);
  const [unspecProjects, setUnspecProjects] = React.useState<Array<{ projectId: number; projectName: string; hours: number }>>([]);
  const loadUnspecifiedDetails = React.useCallback(async () => {
    setUnspecLoading(false);
    setUnspecError(null);
    setUnspecProjects([]);
  }, []);

  const loading = mode === 'status' ? statusData.loading : deliverableData.loading;
  const error = mode === 'status' ? statusData.error : deliverableData.error;
  const weekKeys = mode === 'status' ? statusData.weekKeys : deliverableData.weekKeys;
  const maxY = mode === 'status' ? statusData.maxY : deliverableData.maxY;

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

  // Build stacked areas depending on mode
  let yTopA: number[] = [];
  let yTopB: number[] = [];
  let yTopC: number[] = [];
  let yTopD: number[] = [];
  let yTopE: number[] = [];
  let yTopF: number[] = [];
  let yTopG: number[] = [];

  if (mode === 'status') {
    const s = statusData.series;
    const cum1 = s.active.map((v) => v);
    const cum2 = s.active.map((v, i) => v + (s.active_ca[i] || 0));
    const cum3 = s.active.map((v, i) => v + (s.active_ca[i] || 0) + (s.other[i] || 0));
    yTopA = cum1.map(scaleY); // active
    yTopB = cum2.map(scaleY); // active + active_ca
    yTopC = cum3.map(scaleY); // all
  } else {
    const s = deliverableData.series as any;
    const cum1 = s.sd.map((v: number) => v);
    const cum2 = s.sd.map((v: number, i: number) => v + (s.dd[i] || 0));
    const cum3 = s.sd.map((v: number, i: number) => v + (s.dd[i] || 0) + (s.ifp[i] || 0));
    const cum4 = s.sd.map((v: number, i: number) => v + (s.dd[i] || 0) + (s.ifp[i] || 0) + (s.masterplan?.[i] || 0));
    const cum5 = s.sd.map((v: number, i: number) => v + (s.dd[i] || 0) + (s.ifp[i] || 0) + (s.masterplan?.[i] || 0) + (s.bulletins[i] || 0));
    const cum6 = s.sd.map((v: number, i: number) => v + (s.dd[i] || 0) + (s.ifp[i] || 0) + (s.masterplan?.[i] || 0) + (s.bulletins[i] || 0) + (s.ca[i] || 0));
    const cum7 = s.sd.map((v: number, i: number) => v + (s.dd[i] || 0) + (s.ifp[i] || 0) + (s.masterplan?.[i] || 0) + (s.bulletins[i] || 0) + (s.ca[i] || 0) + ((s.other?.[i] || 0)));
    yTopA = cum1.map(scaleY); // sd
    yTopB = cum2.map(scaleY); // sd+dd
    yTopC = cum3.map(scaleY); // +ifp
    yTopD = cum4.map(scaleY); // +masterplan
    yTopE = cum5.map(scaleY); // +bulletins
    yTopF = cum6.map(scaleY); // +ca
    yTopG = cum7.map(scaleY); // +other
  }

  const baseLine = new Array(n).fill(PAD_TOP + innerH);

  // Colors
  const C_EMERALD = '#34d399'; // status Active
  const C_BLUE = '#60a5fa';    // status Active CA
  const C_SLATE = '#64748b';   // status Other
  const C_GRAY = '#9ca3af';    // Other swatch
  // Deliverables align with calendar.utils typeColors
  const D_SD = '#f59e0b';
  const D_DD = '#818cf8';
  const D_IFP = '#f472b6';
  const D_MASTERPLAN = '#a78bfa';
  const D_BULLETIN = '#3b82f6';
  const D_CA = '#06b6d4';

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
          <div className="flex items-center gap-1 ml-2">
            {(['status', 'deliverable'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${mode === m ? 'bg-[var(--primary)] border-[var(--primary)] text-white' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'}`}
                aria-pressed={mode === m}
                title={m === 'status' ? 'Stacked by status' : 'Stacked by deliverable phase'}
              >
                {m === 'status' ? 'By Status' : 'By Deliverable'}
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
              {mode === 'status' ? (
                <>
                  <path d={buildAreaPath(xs, yTopA, baseLine)} fill={C_EMERALD} fillOpacity={0.28} />
                  <path d={buildLinePath(xs, yTopA)} stroke={C_EMERALD} strokeWidth={2} fill="none" />
                  <path d={buildAreaPath(xs, yTopB, yTopA)} fill={C_BLUE} fillOpacity={0.28} />
                  <path d={buildLinePath(xs, yTopB)} stroke={C_BLUE} strokeWidth={2} fill="none" />
                  <path d={buildAreaPath(xs, yTopC, yTopB)} fill={C_SLATE} fillOpacity={0.22} />
                  <path d={buildLinePath(xs, yTopC)} stroke={C_SLATE} strokeWidth={2} fill="none" />
                </>
              ) : (
                <>
                  {/* SD */}
                  <path d={buildAreaPath(xs, yTopA, baseLine)} fill={D_SD} fillOpacity={0.28} />
                  <path d={buildLinePath(xs, yTopA)} stroke={D_SD} strokeWidth={2} fill="none" />
                  {/* DD */}
                  <path d={buildAreaPath(xs, yTopB, yTopA)} fill={D_DD} fillOpacity={0.28} />
                  <path d={buildLinePath(xs, yTopB)} stroke={D_DD} strokeWidth={2} fill="none" />
                  {/* IFP */}
                  <path d={buildAreaPath(xs, yTopC, yTopB)} fill={D_IFP} fillOpacity={0.28} />
                  <path d={buildLinePath(xs, yTopC)} stroke={D_IFP} strokeWidth={2} fill="none" />
                  {/* Masterplan */}
                  <path d={buildAreaPath(xs, yTopD, yTopC)} fill={D_MASTERPLAN} fillOpacity={0.28} />
                  <path d={buildLinePath(xs, yTopD)} stroke={D_MASTERPLAN} strokeWidth={2} fill="none" />
                  {/* Bulletins */}
                  <path d={buildAreaPath(xs, yTopE, yTopD)} fill={D_BULLETIN} fillOpacity={0.28} />
                  <path d={buildLinePath(xs, yTopE)} stroke={D_BULLETIN} strokeWidth={2} fill="none" />
                  {/* CA */}
                  <path d={buildAreaPath(xs, yTopF, yTopE)} fill={D_CA} fillOpacity={0.24} />
                  <path d={buildLinePath(xs, yTopF)} stroke={D_CA} strokeWidth={2} fill="none" />
                  {/* Other */}
                  <path d={buildAreaPath(xs, yTopG, yTopF)} fill={C_GRAY} fillOpacity={0.22} />
                  <path d={buildLinePath(xs, yTopG)} stroke={C_GRAY} strokeWidth={2} fill="none" />
                </>
              )}
            </svg>

            {/* Inline legend */}
            <div className={`mt-2 flex items-center gap-4 text-xs ${mode === 'deliverable' ? 'hidden' : ''}`}>
              {mode === 'status' ? (
                <>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: C_EMERALD }} /> <span className="text-[var(--text)]">Active</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: C_BLUE }} /> <span className="text-[var(--text)]">Active CA</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: C_SLATE }} /> <span className="text-[var(--text)]">Other</span></div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_SD }} /> <span className="text-[var(--text)]">SD (0ΓÇô39%)</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_DD }} /> <span className="text-[var(--text)]">DD (40ΓÇô80%)</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_IFP }} /> <span className="text-[var(--text)]">IFP (81ΓÇô100%)</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_MASTERPLAN }} /> <span className="text-[var(--text)]">Masterplan</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_BULLETIN }} /> <span className="text-[var(--text)]">Bulletins/Addendums</span></div>
                  <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_CA }} /> <span className="text-[var(--text)]">CA</span></div>
                </>
              )}
            </div>

            {mode === 'deliverable' && deliverableData.extras && deliverableData.extras.length > 0 && (
              <div className="mt-3 text-xs">
                {/* Clickable deliverable categories (expand to see per-project totals) */}
                <div className="mb-2 flex items-center gap-3 text-xs">
                  <button type="button" onClick={() => { const next = openCategory === 'sd' ? null : 'sd'; setOpenCategory(next); setOpenExtra(null); if (next && !categoryDetails['sd']) loadCategoryDetails('sd'); }} className="flex items-center gap-2 hover:opacity-80">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_SD }} /> <span className="text-[var(--text)]">SD (0-39%)</span>
                  </button>
                  <button type="button" onClick={() => { const next = openCategory === 'dd' ? null : 'dd'; setOpenCategory(next); setOpenExtra(null); if (next && !categoryDetails['dd']) loadCategoryDetails('dd'); }} className="flex items-center gap-2 hover:opacity-80">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_DD }} /> <span className="text-[var(--text)]">DD (40-80%)</span>
                  </button>
                  <button type="button" onClick={() => { const next = openCategory === 'ifp' ? null : 'ifp'; setOpenCategory(next); setOpenExtra(null); if (next && !categoryDetails['ifp']) loadCategoryDetails('ifp'); }} className="flex items-center gap-2 hover:opacity-80">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_IFP }} /> <span className="text-[var(--text)]">IFP (81-100%)</span>
                  </button>
                  <button type="button" onClick={() => { const next = openCategory === 'masterplan' ? null : 'masterplan'; setOpenCategory(next); setOpenExtra(null); if (next && !categoryDetails['masterplan']) loadCategoryDetails('masterplan'); }} className="flex items-center gap-2 hover:opacity-80">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_MASTERPLAN }} /> <span className="text-[var(--text)]">Masterplan</span>
                  </button>
                  <button type="button" onClick={() => { const next = openCategory === 'bulletins' ? null : 'bulletins'; setOpenCategory(next); setOpenExtra(null); if (next && !categoryDetails['bulletins']) loadCategoryDetails('bulletins'); }} className="flex items-center gap-2 hover:opacity-80">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_BULLETIN }} /> <span className="text-[var(--text)]">Bulletins/Addendums</span>
                  </button>
                  <button type="button" onClick={() => { const next = openCategory === 'ca' ? null : 'ca'; setOpenCategory(next); setOpenExtra(null); if (next && !categoryDetails['ca']) loadCategoryDetails('ca'); }} className="flex items-center gap-2 hover:opacity-80">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: D_CA }} /> <span className="text-[var(--text)]">CA</span>
                  </button>
                  <button type="button" onClick={() => { const next = openExtra === 'Unspecified' ? null : 'Unspecified'; setOpenExtra(next); setOpenCategory(null); if (next && !(extraDetails['Unspecified'] && extraDetails['Unspecified'].projects && extraDetails['Unspecified'].projects.length)) { loadExtraDetails('Unspecified'); } }} className="flex items-center gap-2 hover:opacity-80">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: C_GRAY }} /> <span className="text-[var(--text)]">Other</span>
                  </button>
                </div>

                {/* Clickable extras list (including Other -> gray) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  {deliverableData.extras.slice(0, 10).map((e) => {
                    const total = e.values.reduce((s, v) => s + (v || 0), 0);
                    const rawLabel = e.label || 'Unspecified';
                    const displayLabel = rawLabel === 'Unspecified' ? 'Other' : rawLabel;
                    const isOpen = openExtra === rawLabel;
                    const details = extraDetails[rawLabel] || { loading: false, error: null, projects: [] };
                    return (
                      <div key={rawLabel} className="bg-[var(--surface)]/40 border border-[var(--border)] rounded">
                        <button
                          type="button"
                          onClick={() => {
                            const next = isOpen ? null : rawLabel;
                            setOpenExtra(next);
                            if (next && !details.loading && details.projects.length === 0) {
                              loadExtraDetails(rawLabel);
                            }
                          }}
                          className="w-full flex items-center justify-between px-2 py-1 hover:bg-[var(--surfaceHover)]"
                          aria-expanded={isOpen}
                        >
                          <span className="flex items-center gap-2 text-[var(--text)]">
                            <span className={`inline-block transform transition-transform ${isOpen ? 'rotate-90' : ''}`}>Γû╢</span>
                            {rawLabel === 'Unspecified' && <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#9ca3af' }} />}
                            <span className="truncate" title={displayLabel}>{displayLabel}</span>
                          </span>
                          <span className="text-[var(--muted)]">{Math.round(total)}h</span>
                        </button>
                        {isOpen && (
                          <div className="px-2 pb-2">
                            {details.loading && <div className="text-[var(--muted)]">Loading...</div>}
                            {details.error && <div className="text-red-400">{details.error}</div>}
                            {!details.loading && !details.error && (
                              <div className="mt-1 space-y-1 max-h-48 overflow-auto pr-1">
                                {details.projects.length === 0 ? (
                                  <div className="text-[var(--muted)]">No projects found.</div>
                                ) : (
                                  details.projects.map(p => (
                                    <div key={p.projectId} className="flex items-center justify-between border border-[var(--border)]/40 rounded px-2 py-1 bg-[var(--surface)]/30">
                                      <span className="truncate text-[var(--text)]" title={`${p.projectName} (#${p.projectId})`}>{p.projectName}</span>
                                      <span className="text-[var(--muted)]">{Math.round(p.hours)}h</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {openCategory && (
                  <div className="mt-1 text-xs border border-[var(--border)] rounded bg-[var(--surface)]/40">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="text-[var(--text)]">Projects in {openCategory.toUpperCase()}</div>
                      <button type="button" onClick={() => setOpenCategory(null)} className="text-[var(--muted)] hover:text-[var(--text)]">Close</button>
                    </div>
                    <div className="px-2 pb-2">
                      {categoryDetails[openCategory]?.loading && <div className="text-[var(--muted)]">Loading...</div>}
                      {categoryDetails[openCategory]?.error && <div className="text-red-400">{categoryDetails[openCategory]?.error}</div>}
                      {!categoryDetails[openCategory]?.loading && !categoryDetails[openCategory]?.error && (
                        <div className="mt-1 space-y-1 max-h-48 overflow-auto pr-1">
                          {(categoryDetails[openCategory]?.projects || []).length === 0 ? (
                            <div className="text-[var(--muted)]">No projects found.</div>
                          ) : (
                            (categoryDetails[openCategory]?.projects || []).map(p => (
                              <div key={p.projectId} className="flex items-center justify-between border border-[var(--border)]/40 rounded px-2 py-1 bg-[var(--surface)]/30">
                                <span className="truncate text-[var(--text)]" title={`${p.projectName} (#${p.projectId})`}>{p.projectName}</span>
                                <span className="text-[var(--muted)]">{Math.round(p.hours)}h</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {openExtra && (
                  <div className="mt-1 text-xs border border-[var(--border)] rounded bg-[var(--surface)]/40">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="text-[var(--text)]">Projects in {openExtra === 'Unspecified' ? 'OTHER' : openExtra}</div>
                      <button type="button" onClick={() => setOpenExtra(null)} className="text-[var(--muted)] hover:text-[var(--text)]">Close</button>
                    </div>
                    <div className="px-2 pb-2">
                      {extraDetails[openExtra]?.loading && <div className="text-[var(--muted)]">Loading...</div>}
                      {extraDetails[openExtra]?.error && <div className="text-red-400">{extraDetails[openExtra]?.error}</div>}
                      {!extraDetails[openExtra]?.loading && !extraDetails[openExtra]?.error && (
                        <div className="mt-1 space-y-1 max-h-48 overflow-auto pr-1">
                          {(extraDetails[openExtra]?.projects || []).length === 0 ? (
                            <div className="text-[var(--muted)]">No projects found.</div>
                          ) : (
                            (extraDetails[openExtra]?.projects || []).map(p => (
                              <div key={p.projectId} className="flex items-center justify-between border border-[var(--border)]/40 rounded px-2 py-1 bg-[var(--surface)]/30">
                                <span className="truncate text-[var(--text)]" title={`${p.projectName} (#${p.projectId})`}>{p.projectName}</span>
                                <span className="text-[var(--muted)]">{Math.round(p.hours)}h</span>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                      
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default AssignedHoursTimelineCard;


