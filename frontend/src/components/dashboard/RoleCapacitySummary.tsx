import React from 'react';
import Card from '@/components/ui/Card';
import MultiRoleCapacityChart from '@/components/charts/MultiRoleCapacityChart';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { getRoleCapacityTimeline } from '@/services/analyticsApi';
import { reportsApi } from '@/services/api';
import { subscribeAssignmentsRefresh } from '@/lib/assignmentsRefreshBus';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';
import { Link } from 'react-router';

const WEEK_OPTIONS: Array<4 | 8 | 12 | 16 | 26 | 52> = [4, 8, 12, 16, 26, 52];

const utilizationTone = (pct: number) => {
  if (pct <= 70) return { bar: '#60a5fa', text: 'text-blue-300' };
  if (pct <= 85) return { bar: '#34d399', text: 'text-emerald-300' };
  if (pct <= 100) return { bar: '#f59e0b', text: 'text-amber-300' };
  return { bar: '#ef4444', text: 'text-red-300' };
};

type RoleHeatmapCell = {
  weekKey: string;
  demand: number;
  assigned: number;
  capacity: number;
  available: number;
  people: number;
  utilization: number;
};

type RoleHeatmapRow = {
  roleName: string;
  latestUtilization: number;
  cells: RoleHeatmapCell[];
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
  const [weeks, setWeeks] = React.useState<4 | 8 | 12 | 16 | 26 | 52>(12);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [weekKeys, setWeekKeys] = React.useState<string[]>([]);
  const [series, setSeries] = React.useState<Array<{ roleId: number; roleName: string; assigned: number[]; projected?: number[]; demand?: number[]; capacity: number[]; people?: number[] }>>([]);
  const [summary, setSummary] = React.useState<{
    mappedProjectedHours?: number;
    unmappedProjectRoleHours?: number;
    mappedTemplateRolePairsUsed?: number;
  } | null>(null);
  const [filterOutLt5h, setFilterOutLt5h] = React.useState(true);
  const [showTrend, setShowTrend] = React.useState(false);
  const [hoveredCell, setHoveredCell] = React.useState<{
    roleName: string;
    weekLabel: string;
    utilization: number;
    assigned: number;
    available: number;
    capacity: number;
    people: number;
    demand: number;
    left: number;
    top: number;
  } | null>(null);
  const refreshTimerRef = React.useRef<number | null>(null);
  const heatmapScrollRef = React.useRef<HTMLDivElement | null>(null);
  const hasBootstrappedRef = React.useRef(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!hasBootstrappedRef.current) {
        try {
          const bootstrap = await reportsApi.getRoleCapacityBootstrap({
            department: deptState.selectedDepartmentId ?? undefined,
            weeks,
            vertical: verticalState.selectedVerticalId ?? undefined,
            filter_out_lt5h: filterOutLt5h ? 1 : 0,
          });
          hasBootstrappedRef.current = true;
          setWeekKeys(bootstrap.timeline?.weekKeys || []);
          setSeries(bootstrap.timeline?.series || []);
          setSummary(bootstrap.summary || null);
          return;
        } catch {
          // Fall through to existing timeline endpoint.
        }
      }

      const res = await getRoleCapacityTimeline({
        department: deptState.selectedDepartmentId ?? null,
        weeks,
        vertical: verticalState.selectedVerticalId ?? undefined,
        filterOutLt5h,
      });
      setWeekKeys(res.weekKeys || []);
      setSeries(res.series || []);
      setSummary(res.summary || null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load role capacity summary');
      setWeekKeys([]);
      setSeries([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [deptState.selectedDepartmentId, weeks, verticalState.selectedVerticalId, filterOutLt5h]);

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

  const formattedWeekLabel = React.useCallback((weekKey: string) => {
    const date = new Date(`${weekKey}T00:00:00`);
    if (Number.isNaN(date.getTime())) return weekKey;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, []);

  const roleRows = React.useMemo<RoleHeatmapRow[]>(() => {
    if (!series.length || !weekKeys.length) return [];
    return series.map((role) => {
      const cells = weekKeys.map((weekKey, idx) => {
        const demand = Number(((role.demand && role.demand.length > 0) ? role.demand[idx] : role.assigned[idx]) ?? 0);
        const assigned = Number(role.assigned[idx] ?? 0);
        const capacity = Number(role.capacity[idx] ?? 0);
        const people = Number(role.people?.[idx] ?? 0);
        const utilization = capacity > 0 ? Math.round((assigned / capacity) * 100) : 0;
        return {
          weekKey,
          demand,
          assigned,
          capacity,
          available: Math.max(0, capacity - assigned),
          people,
          utilization,
        };
      });
      return {
        roleName: role.roleName,
        latestUtilization: cells[cells.length - 1]?.utilization ?? 0,
        cells,
      };
    });
  }, [series, weekKeys]);

  React.useEffect(() => {
    if (showTrend) setHoveredCell(null);
  }, [showTrend]);

  React.useLayoutEffect(() => {
    const node = heatmapScrollRef.current;
    if (!node) return;
    const onScroll = () => setHoveredCell(null);
    node.addEventListener('scroll', onScroll);
    return () => node.removeEventListener('scroll', onScroll);
  }, []);

  const handleCellHover = React.useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement> | React.FocusEvent<HTMLButtonElement>,
      roleName: string,
      cell: RoleHeatmapCell,
    ) => {
      const scrollHost = heatmapScrollRef.current;
      if (!scrollHost) return;
      const hostRect = scrollHost.getBoundingClientRect();
      const targetRect = event.currentTarget.getBoundingClientRect();
      setHoveredCell({
        roleName,
        weekLabel: formattedWeekLabel(cell.weekKey),
        utilization: cell.utilization,
        assigned: cell.assigned,
        available: cell.available,
        capacity: cell.capacity,
        people: cell.people,
        demand: cell.demand,
        left: targetRect.left - hostRect.left + targetRect.width / 2,
        top: targetRect.top - hostRect.top - 12,
      });
    },
    [formattedWeekLabel],
  );

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
        <div className="text-xs text-[var(--muted)]">Weekly view</div>
      </div>

      <div className="mt-4 min-h-[420px]">
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
          <div className="space-y-3">
            {roleRows.length === 0 ? (
              <div className="text-sm text-[var(--muted)]">No role capacity data.</div>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] text-[var(--muted)]">
                  Weekly utilization heat map by role. Hover a square for role/week details.
                </div>
                <div ref={heatmapScrollRef} className="relative overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]/35 p-1">
                  <table className="w-max border-separate border-spacing-0 text-xs">
                    <tbody>
                      {roleRows.map((row) => {
                        const tone = utilizationTone(row.latestUtilization);
                        return (
                          <tr key={row.roleName}>
                            <td className="sticky left-0 z-10 bg-[var(--surface)]/95 px-1.5 py-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="whitespace-nowrap text-[var(--text)]">{row.roleName}</span>
                                <span className={`${tone.text} text-[10px]`}>{row.latestUtilization}%</span>
                              </div>
                            </td>
                            {row.cells.map((cell) => {
                              const cellTone = utilizationTone(cell.utilization);
                              const tooltipText = [
                                `${row.roleName} • ${formattedWeekLabel(cell.weekKey)}`,
                                `Utilization: ${cell.utilization}%`,
                                `Assigned / Available: ${Math.round(cell.assigned)}h / ${Math.round(cell.available)}h`,
                                `Capacity: ${Math.round(cell.capacity)}h`,
                                `Demand (incl. projected): ${Math.round(cell.demand)}h`,
                                `Active people: ${cell.people}`,
                              ].join('\n');
                              return (
                                <td key={`${row.roleName}-${cell.weekKey}`} className="p-0 text-center leading-none">
                                  <button
                                    type="button"
                                    className="block h-4 w-4 rounded-none border-0 transition-transform hover:scale-105 focus-visible:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                                    style={{ backgroundColor: cellTone.bar, opacity: 0.88 }}
                                    title={tooltipText}
                                    aria-label={tooltipText}
                                    onMouseEnter={(event) => handleCellHover(event, row.roleName, cell)}
                                    onMouseMove={(event) => handleCellHover(event, row.roleName, cell)}
                                    onMouseLeave={() => setHoveredCell(null)}
                                    onFocus={(event) => handleCellHover(event, row.roleName, cell)}
                                    onBlur={() => setHoveredCell(null)}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {hoveredCell ? (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute z-30 w-52 -translate-x-1/2 -translate-y-full rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-[11px] text-[var(--text)] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
                      style={{
                        left: hoveredCell.left,
                        top: hoveredCell.top,
                      }}
                    >
                      <div className="font-medium">{hoveredCell.roleName}</div>
                      <div className="text-[var(--muted)]">{hoveredCell.weekLabel}</div>
                      <div className="mt-1.5">Utilization: {hoveredCell.utilization}%</div>
                      <div>Assigned / Available: {Math.round(hoveredCell.assigned)}h / {Math.round(hoveredCell.available)}h</div>
                      <div>Capacity: {Math.round(hoveredCell.capacity)}h</div>
                      <div>Demand: {Math.round(hoveredCell.demand)}h</div>
                      <div>Active people: {hoveredCell.people}</div>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--muted)]">
                  <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: '#60a5fa' }} />0-70%</div>
                  <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: '#34d399' }} />71-85%</div>
                  <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: '#f59e0b' }} />86-100%</div>
                  <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: '#ef4444' }} />100%+</div>
                </div>
                <label className="inline-flex items-center gap-2 text-[11px] text-[var(--muted)]">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border border-[var(--border)] bg-[var(--surface)]"
                    checked={filterOutLt5h}
                    onChange={(event) => setFilterOutLt5h(event.target.checked)}
                  />
                  Filter Out &lt;5hr
                </label>
              </div>
            )}
            {(summary?.unmappedProjectRoleHours || 0) > 0 ? (
              <div className="mt-3 text-xs text-amber-300">
                {Math.round(summary?.unmappedProjectRoleHours || 0)}h forecast demand is unmapped from project-role to people-role.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
};

export default RoleCapacitySummary;
