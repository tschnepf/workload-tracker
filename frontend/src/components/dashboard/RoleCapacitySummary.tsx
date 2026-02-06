import React from 'react';
import Card from '@/components/ui/Card';
import MultiRoleCapacityChart from '@/components/charts/MultiRoleCapacityChart';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { getRoleCapacityTimeline } from '@/services/analyticsApi';
import { subscribeAssignmentsRefresh } from '@/lib/assignmentsRefreshBus';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';
import { Link } from 'react-router';

const WEEK_OPTIONS: Array<4 | 8 | 12 | 16> = [4, 8, 12, 16];

const utilizationTone = (pct: number) => {
  if (pct <= 70) return { bar: '#60a5fa', text: 'text-blue-300' };
  if (pct <= 85) return { bar: '#34d399', text: 'text-emerald-300' };
  if (pct <= 100) return { bar: '#f59e0b', text: 'text-amber-300' };
  return { bar: '#ef4444', text: 'text-red-300' };
};

interface RoleCapacitySummaryProps {
  title?: string;
  className?: string;
  viewAllHref?: string;
}

const RoleCapacitySummary: React.FC<RoleCapacitySummaryProps> = ({
  title = 'Capacity by Role',
  className,
  viewAllHref = '/reports/role-capacity',
}) => {
  const { state: deptState } = useDepartmentFilter();
  const { state: verticalState } = useVerticalFilter();
  const [weeks, setWeeks] = React.useState<4 | 8 | 12 | 16>(12);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [weekKeys, setWeekKeys] = React.useState<string[]>([]);
  const [series, setSeries] = React.useState<Array<{ roleId: number; roleName: string; assigned: number[]; capacity: number[] }>>([]);
  const [showTrend, setShowTrend] = React.useState(false);
  const refreshTimerRef = React.useRef<number | null>(null);
  const summaryRef = React.useRef<HTMLDivElement | null>(null);
  const [summaryHeight, setSummaryHeight] = React.useState(0);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRoleCapacityTimeline({
        department: deptState.selectedDepartmentId ?? null,
        weeks,
        vertical: verticalState.selectedVerticalId ?? undefined,
      });
      setWeekKeys(res.weekKeys || []);
      setSeries(res.series || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load role capacity summary');
      setWeekKeys([]);
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [deptState.selectedDepartmentId, weeks, verticalState.selectedVerticalId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        refresh();
      }, 200);
    };
    const unsubscribeAssignments = subscribeAssignmentsRefresh(scheduleRefresh);
    const unsubscribeProjects = subscribeProjectsRefresh(scheduleRefresh);
    return () => {
      unsubscribeAssignments();
      unsubscribeProjects();
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [refresh]);

  const summaryRows = React.useMemo(() => {
    if (!series.length) return [];
    const idx = weekKeys.length > 0 ? weekKeys.length - 1 : series[0].assigned.length - 1;
    const prevIdx = Math.max(0, idx - 1);
    return series.map((role) => {
      const assigned = Number(role.assigned[idx] ?? 0);
      const capacity = Number(role.capacity[idx] ?? 0);
      const prevAssigned = Number(role.assigned[prevIdx] ?? 0);
      const prevCapacity = Number(role.capacity[prevIdx] ?? 0);
      const utilization = capacity > 0 ? Math.round((assigned / capacity) * 100) : 0;
      const prevUtilization = prevCapacity > 0 ? Math.round((prevAssigned / prevCapacity) * 100) : utilization;
      const delta = utilization - prevUtilization;
      return {
        roleName: role.roleName,
        assigned,
        capacity,
        utilization,
        delta,
      };
    });
  }, [series, weekKeys]);

  React.useLayoutEffect(() => {
    const node = summaryRef.current;
    if (!node) return;
    const update = () => {
      const next = node.getBoundingClientRect().height;
      if (next && Math.abs(next - summaryHeight) > 1) {
        setSummaryHeight(next);
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    return () => observer.disconnect();
  }, [summaryRows.length, summaryHeight]);

  const trendMinHeight = 420;
  const contentMinHeight = Math.max(summaryHeight, trendMinHeight);

  return (
    <Card className={`rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.25)] ${className ?? ''}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTrend((prev) => !prev)}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
            aria-pressed={showTrend}
            aria-expanded={showTrend}
            aria-controls="role-capacity-trend"
          >
            {showTrend ? 'Hide trend' : 'View trend'}
          </button>
          {viewAllHref ? (
            <Link to={viewAllHref} className="text-xs text-[var(--primary)] hover:underline">
              View all
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)]/60 p-1">
          {WEEK_OPTIONS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeeks(w)}
              className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                weeks === w
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
              aria-pressed={weeks === w}
            >
              {w}w
            </button>
          ))}
        </div>
        <div className="text-xs text-[var(--muted)]">Latest period</div>
      </div>

      <div className="mt-4" style={{ minHeight: contentMinHeight }}>
        {loading ? (
          <div className="text-sm text-[var(--muted)]">Loading role capacity…</div>
        ) : error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : showTrend ? (
          <div id="role-capacity-trend" role="region" aria-label="Capacity by role trend">
            {series.length > 0 ? (
              <MultiRoleCapacityChart
                weekKeys={weekKeys}
                series={series as any}
                mode="hours"
                tension={0.75}
                hideLegend={false}
                height={320}
              />
            ) : (
              <div className="text-sm text-[var(--muted)]">Trend view unavailable for this selection.</div>
            )}
          </div>
        ) : (
          <div ref={summaryRef} className={summaryRows.length > 0 ? 'space-y-3' : ''}>
            {summaryRows.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">No role capacity data.</div>
            ) : (
              summaryRows.map((row) => {
                const tone = utilizationTone(row.utilization);
                return (
                  <div key={row.roleName} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text)] font-medium">{row.roleName}</span>
                      <span className={`${tone.text}`}>{row.utilization}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                      <span>{Math.round(row.assigned)}h / {Math.round(row.capacity)}h</span>
                      <span>{row.delta >= 0 ? '+' : ''}{row.delta}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[var(--surface)]/70">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(120, row.utilization)}%`, backgroundColor: tone.bar }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default RoleCapacitySummary;
