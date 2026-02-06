/**
 * Dashboard page - Team utilization overview
 * Chunk 4: Real dashboard with team metrics and VSCode dark theme
 */

import React, { useState, useMemo, useLayoutEffect } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import { dashboardApi, departmentsApi, projectsApi, peopleApi } from '../services/api';
import { useAuth } from '@/hooks/useAuth';
import { DashboardData, Department } from '../types/models';
import { useCapacityHeatmap } from '../hooks/useCapacityHeatmap';
import { useDepartmentFilter } from '../hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useDashboardHeatmapView, type DashboardHeatmapRow } from '@/mobile/dashboardAdapters';
import { FullCalendarWrapper, mapCapacityHeatmapToEvents, mapDeliverableCalendarToEvents, formatDeliverableInlineLabel } from '@/features/fullcalendar';
import { useDeliverablesCalendar, subtractOneDay, toIsoDate } from '@/hooks/useDeliverablesCalendar';
import type { CalendarRange } from '@/hooks/useDeliverablesCalendar';
import type { DeliverableCalendarUnion } from '@/features/fullcalendar/eventAdapters';
import type { EventContentArg, DatesSetArg } from '@fullcalendar/core';
import SearchTokenBar from '@/components/filters/SearchTokenBar';
import { useSearchTokens } from '@/hooks/useSearchTokens';
import { useDeliverablesSearchIndex } from '@/hooks/useDeliverablesSearchIndex';
import StatusStrip from '@/components/dashboard/StatusStrip';
import KpiCard from '@/components/dashboard/KpiCard';
import StackedDistributionBar from '@/components/dashboard/StackedDistributionBar';
import PersonAlertList, { type PersonAlertItem, type PersonAlertFilter } from '@/components/dashboard/PersonAlertList';
import RoleCapacitySummary from '@/components/dashboard/RoleCapacitySummary';
import RecentAssignmentsCard from '@/components/dashboard/RecentAssignmentsCard';
import AssignedHoursByClientCard from '@/components/analytics/AssignedHoursByClientCard';
import { useProjectDetailsDrawer } from '@/components/projects/detailsDrawer';

const Dashboard: React.FC = () => {
  const auth = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weeksPeriod, setWeeksPeriod] = useState<number>(1);
  
  // Department filtering state (global)
  const [departments, setDepartments] = useState<Department[]>([]);
  const { state: deptState, setDepartment } = useDepartmentFilter();
  const { state: verticalState } = useVerticalFilter();
  
  // Heatmap + project summary state
  const heatWeeks = 12;
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [projectsTotal, setProjectsTotal] = useState<number>(0);
  const deliverablesListRef = React.useRef<HTMLDivElement | null>(null);
  const [showDeliverablesScrollHint, setShowDeliverablesScrollHint] = useState(false);
  // People metadata (hire date, active) for availability filtering
  const [peopleMeta, setPeopleMeta] = useState<Map<number, { isActive?: boolean; hireDate?: string; roleId?: number | null; roleName?: string | null }>>(new Map());

  // Load dashboard when weeks or global department changes
  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadDashboard();
  }, [auth.accessToken, weeksPeriod, deptState.selectedDepartmentId, verticalState.selectedVerticalId]);

  // Load static data once
  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.accessToken, verticalState.selectedVerticalId]);

  // Load project summary once authenticated
  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.accessToken, verticalState.selectedVerticalId]);

  // Load people metadata for availability filters (respect department scope)
  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    (async () => {
      try {
        const list = await peopleApi.listAll({
          department: deptState.selectedDepartmentId ?? undefined,
          include_children: deptState.includeChildren ? 1 : 0,
          vertical: verticalState.selectedVerticalId ?? undefined,
        });
        const m = new Map<number, { isActive?: boolean; hireDate?: string; roleId?: number | null; roleName?: string | null }>();
        for (const p of list) {
          if (p.id != null) m.set(p.id, { isActive: p.isActive, hireDate: p.hireDate || undefined, roleId: (p as any).role ?? null, roleName: (p as any).roleName ?? null });
        }
        setPeopleMeta(m);
      } catch (err) {
        // Non-fatal; fall back to backend heatmap filtering
        console.warn('Failed to load people metadata for availability filtering:', err);
        setPeopleMeta(new Map());
      }
    })();
  }, [auth.accessToken, deptState.selectedDepartmentId, deptState.includeChildren, verticalState.selectedVerticalId]);


  const heatQuery = useCapacityHeatmap(
    {
      departmentId: deptState.selectedDepartmentId,
      includeChildren: deptState.includeChildren,
      vertical: verticalState.selectedVerticalId ?? null,
    },
    heatWeeks,
    !loading && !!auth.accessToken
  );
  const heatLoading = heatQuery.isLoading || heatQuery.isFetching || loading;
  const heatmapView = useDashboardHeatmapView(heatQuery.data ?? [], peopleMeta);
  const heatData = heatmapView.rows;
  const currentWeekKey = heatmapView.currentWeekKey;


  const upcomingRange = useMemo((): CalendarRange => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }, []);

  const upcomingDeliverablesQuery = useDeliverablesCalendar(upcomingRange, {
    mineOnly: false,
    vertical: verticalState.selectedVerticalId ?? undefined,
  });
  const upcomingDeliverables = useMemo(() => {
    const items = upcomingDeliverablesQuery.data ?? [];
    const start = new Date(`${upcomingRange.start}T00:00:00`);
    const end = new Date(`${upcomingRange.end}T23:59:59`);
    return items
      .filter((item) => {
        const raw = item as any;
        const itemType = raw.itemType ?? raw.kind;
        if (itemType && itemType !== 'deliverable') return false;
        if (raw.preDeliverableType != null || raw.preDeliverableTypeId != null) return false;
        const title = typeof raw.title === 'string' ? raw.title.trim() : '';
        if (!itemType && title.toLowerCase().startsWith('pre:')) return false;
        const date = (item as any).date;
        if (!date) return false;
        const d = new Date(`${date}T00:00:00`);
        return d >= start && d <= end;
      })
      .sort((a, b) => {
        const da = new Date(`${(a as any).date}T00:00:00`).getTime();
        const db = new Date(`${(b as any).date}T00:00:00`).getTime();
        return da - db;
      });
  }, [upcomingDeliverablesQuery.data, upcomingRange.end, upcomingRange.start]);

  const updateDeliverablesScrollHint = React.useCallback(() => {
    const node = deliverablesListRef.current;
    if (!node) return;
    const canScroll = node.scrollHeight > node.clientHeight + 4;
    const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 4;
    setShowDeliverablesScrollHint(canScroll && !atBottom);
  }, []);

  useLayoutEffect(() => {
    updateDeliverablesScrollHint();
    const node = deliverablesListRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateDeliverablesScrollHint());
    observer.observe(node);
    return () => observer.disconnect();
  }, [updateDeliverablesScrollHint, upcomingDeliverables.length, upcomingDeliverablesQuery.isLoading]);

  const totalMembers = useMemo(() => {
    if (!data) return 0;
    const dist = data.utilization_distribution;
    const sum = dist.underutilized + dist.optimal + dist.high + dist.overallocated;
    return data.summary.total_people || sum;
  }, [data]);

  const activeProjects = useMemo(() => {
    const entries = Object.entries(projectCounts);
    if (!entries.length) return projectsTotal;
    const activeCount = entries
      .filter(([status]) => status.toLowerCase().startsWith('active'))
      .reduce((sum, [, count]) => sum + count, 0);
    return activeCount || projectsTotal;
  }, [projectCounts, projectsTotal]);

  const overallocatedItems = useMemo<PersonAlertItem[]>(() => {
    if (!data) return [];
    return data.team_overview
      .filter((person) => person.is_overallocated || person.utilization_percent > 100)
      .sort((a, b) => b.utilization_percent - a.utilization_percent)
      .slice(0, 8)
      .map((person) => ({
        id: person.id,
        name: person.name,
        role: person.role,
        statusLabel: `${person.utilization_percent}%`,
        tone: 'danger',
        assigned: person.allocated_hours,
        capacity: person.capacity,
      }));
  }, [data]);

  const availabilityItems = useMemo<PersonAlertItem[]>(() => {
    if (!currentWeekKey) return [];
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return heatData
      .filter((row) => {
        const meta = row.personMeta;
        if (meta?.isActive === false) return false;
        if (meta?.hireDate) {
          const hireDate = new Date(`${meta.hireDate}T00:00:00`);
          if (hireDate > todayMidnight) return false;
        }
        return true;
      })
      .map((row) => {
        const meta = row.personMeta;
        const weeklyCapacity = Number(row.weeklyCapacity || 0);
        const currentHours = Number(row.weekTotals?.[currentWeekKey] || 0);
        const utilization = weeklyCapacity > 0 ? Math.round((currentHours / weeklyCapacity) * 100) : 0;
        const status =
          utilization > 100
            ? { label: 'Overallocated', tone: 'danger' as const }
            : utilization > 85
              ? { label: 'Tight', tone: 'warning' as const }
              : utilization >= 70
                ? { label: 'Optimal', tone: 'success' as const }
                : { label: 'Available', tone: 'info' as const };
        return {
          id: row.id,
          name: row.name,
          role: meta?.roleName ?? row.department ?? undefined,
          statusLabel: status.label,
          tone: status.tone,
          utilizationPercent: utilization,
          assigned: currentHours,
          capacity: weeklyCapacity,
        };
      })
      .sort((a, b) => (a.utilizationPercent ?? 0) - (b.utilizationPercent ?? 0));
  }, [heatData, currentWeekKey]);

  const availabilityFilters = useMemo<PersonAlertFilter[]>(() => {
    return [
      {
        key: 'under',
        label: 'Under threshold',
        predicate: (item) => (item.utilizationPercent ?? 0) < 70,
      },
      {
        key: 'over',
        label: 'Overallocated',
        predicate: (item) => (item.utilizationPercent ?? 0) > 100,
      },
      {
        key: 'tight',
        label: 'Tight',
        predicate: (item) => (item.utilizationPercent ?? 0) > 85 && (item.utilizationPercent ?? 0) <= 100,
      },
      {
        key: 'all',
        label: 'All',
        predicate: () => true,
      },
    ];
  }, []);

  const loadDepartments = async () => {
    try {
      const response = await departmentsApi.list({ vertical: verticalState.selectedVerticalId ?? undefined });
      setDepartments(response.results || []);
    } catch (err) {
      console.error('Error loading departments:', err);
    }
  };

  const loadProjects = async () => {
    try {
      const list = await projectsApi.listAll({ vertical: verticalState.selectedVerticalId ?? undefined });
      setProjectsTotal(list.length);
      const counts: Record<string, number> = {};
      for (const p of list) {
        const key = (p.status || 'Unknown');
        counts[key] = (counts[key] || 0) + 1;
      }
      setProjectCounts(counts);
    } catch (err: any) {
      console.warn('Failed to load projects:', err);
    }
  };

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await dashboardApi.getDashboard(
        weeksPeriod,
        deptState.selectedDepartmentId != null ? String(deptState.selectedDepartmentId) : undefined,
        verticalState.selectedVerticalId ?? undefined
      );
      setData(response);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleWeeksPeriodChange = (newWeeks: number) => {
    if (newWeeks >= 1 && newWeeks <= 12) {
      setWeeksPeriod(newWeeks);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-[var(--muted)]">Loading dashboard...</div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="space-y-4">
          <div className="text-red-400">Error: {error}</div>
          <button
            onClick={loadDashboard}
            className="bg-[var(--primary)] hover:bg-[#1e90ff] text-white px-4 py-2 rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="text-[var(--muted)]">No dashboard data available</div>
      </Layout>
    );
  }

  const distribution = data.utilization_distribution;
  const underCount = distribution.underutilized;
  const optimalCount = distribution.optimal;
  const highCount = distribution.high;
  const overCount = distribution.overallocated;
  const weekLabel = weeksPeriod === 1 ? 'this week' : `over the last ${weeksPeriod} weeks`;
  const statusTone: 'danger' | 'warning' | 'info' = overCount > 0 ? 'danger' : underCount > 0 ? 'warning' : 'info';
  const statusMessage =
    overCount > 0 || underCount > 0
      ? `${overCount} people are overallocated; ${underCount} are underutilized ${weekLabel}.`
      : `All team members are within healthy utilization ${weekLabel}.`;
  const avgUtil = data.summary.avg_utilization;
  const avgAccent = avgUtil <= 70 ? 'blue' : avgUtil <= 85 ? 'green' : avgUtil <= 100 ? 'amber' : 'red';
  const distributionSegments = [
    { key: 'under', label: 'Under', range: '<70%', value: underCount, color: '#60a5fa' },
    { key: 'optimal', label: 'Optimal', range: '70-85%', value: optimalCount, color: '#34d399' },
    { key: 'high', label: 'High', range: '85-100%', value: highCount, color: '#f59e0b' },
    { key: 'over', label: 'Over', range: '>100%', value: overCount, color: '#ef4444' },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between" role="region" aria-label="Dashboard overview and filters">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold text-[var(--text)]">Team Dashboard</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Overview of team utilization: workload allocation ({weeksPeriod === 1 ? 'current week' : `${weeksPeriod} week average`}).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Time Period</span>
              <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)]/60 p-1">
                {[1, 2, 4, 8, 12].map((weeks) => (
                  <button
                    key={weeks}
                    onClick={() => handleWeeksPeriodChange(weeks)}
                    className={`px-3 py-1 text-[11px] rounded-full transition-colors ${
                      weeksPeriod === weeks
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                    type="button"
                    aria-pressed={weeksPeriod === weeks}
                  >
                    {weeks}w
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-2 py-1">
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={weeksPeriod}
                  onChange={(e) => handleWeeksPeriodChange(parseInt(e.target.value, 10) || 1)}
                  className="w-12 bg-transparent text-[11px] text-[var(--text)] focus:outline-none"
                  aria-label="Custom weeks"
                />
                <span className="text-[11px] text-[var(--muted)]">w</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-wide text-[var(--muted)]" htmlFor="dashboard-dept-select">
                Department
              </label>
              <select
                id="dashboard-dept-select"
                value={deptState.selectedDepartmentId != null ? String(deptState.selectedDepartmentId) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setDepartment(val ? Number(val) : null);
                }}
                className="min-w-[180px] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <StatusStrip tone={statusTone}>{statusMessage}</StatusStrip>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="col-span-12 lg:col-span-4 lg:self-stretch flex flex-col gap-4 min-h-0">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <KpiCard
                label="Average Utilization"
                value={`${avgUtil}%`}
                accent={avgAccent}
                subtext={weeksPeriod === 1 ? 'This week' : `${weeksPeriod} week average`}
              />
              <KpiCard
                label="Active Projects"
                value={activeProjects}
                accent="green"
                subtext={projectsTotal ? `Total: ${projectsTotal}` : 'Current period'}
              />
            </div>
            <RecentAssignmentsCard
              assignments={data.recent_assignments ?? []}
              className="flex-1"
            />
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-5">
            <AssignedHoursByClientCard className="w-full h-full" responsive />
          </div>
          <UpcomingDeliverablesCard
            deliverables={upcomingDeliverables}
            isLoading={upcomingDeliverablesQuery.isLoading}
            listRef={deliverablesListRef}
            onScroll={updateDeliverablesScrollHint}
            showScrollHint={showDeliverablesScrollHint}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Card className="col-span-12 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.25)] lg:col-span-12">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">Utilization Distribution</h3>
                <p className="text-xs text-[var(--muted)]">Buckets for the current period</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
                <span>
                  Total Team Members: <span className="text-[var(--text)] font-semibold">{totalMembers}</span>
                </span>
              </div>
            </div>
            <div className="mt-5">
              <StackedDistributionBar
                segments={distributionSegments}
                total={totalMembers}
                leftValue={underCount}
                rightValue={overCount}
              />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <PersonAlertList
            className="col-span-12 lg:col-span-4"
            title="Overallocated Team Members"
            items={overallocatedItems}
            maxItems={overallocatedItems.length}
          />
          <RoleCapacitySummary className="col-span-12 lg:col-span-4" />
          <PersonAlertList
            className="col-span-12 lg:col-span-4"
            title="Availability & Alerting"
            items={availabilityItems}
            filters={availabilityFilters}
            defaultFilterKey="under"
            loading={heatLoading}
          />
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;

type UpcomingDeliverablesCardProps = {
  deliverables: DeliverableCalendarUnion[];
  isLoading: boolean;
  listRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
  showScrollHint: boolean;
};

const UpcomingDeliverablesCard: React.FC<UpcomingDeliverablesCardProps> = ({
  deliverables,
  isLoading,
  listRef,
  onScroll,
  showScrollHint,
}) => {
  const { open: openProjectDetails } = useProjectDetailsDrawer();
  return (
    <Card
      className="col-span-12 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.25)] lg:col-span-4 lg:col-start-9"
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--text)]">Upcoming Deliverables</h3>
          <p className="text-xs text-[var(--muted)]">Next 7 days</p>
        </div>
        <span className="text-xs text-[var(--muted)]">{deliverables.length}</span>
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_auto] items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        <div>Client</div>
        <div>Project</div>
        <div>Deliverable</div>
        <div className="text-right">Date</div>
      </div>
      <div ref={listRef} onScroll={onScroll} className="mt-3 h-[420px] space-y-3 overflow-y-auto pr-2">
        {isLoading ? (
          <div className="text-sm text-[var(--muted)]">Loading deliverables…</div>
        ) : deliverables.length === 0 ? (
          <div className="text-sm text-[var(--muted)]">No upcoming deliverables.</div>
        ) : (
          deliverables.map((item) => {
            const raw = item as any;
            const date = raw.date as string | null;
            const label = raw.title as string;
            const projectId = raw.project as number | null;
            const projectName = raw.projectName as string | null;
            const clientName = raw.projectClient as string | null;
            const displayDate = date
              ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : 'TBD';
            return (
              <div
                key={`${raw.itemType || 'deliverable'}-${raw.id}`}
                className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_auto] items-center gap-3 border-b border-white/10 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{clientName || '—'}</div>
                <div className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">
                  {projectId != null ? (
                    <button
                      type="button"
                      className="min-w-0 truncate text-left hover:underline focus-visible:underline"
                      onClick={() => openProjectDetails(projectId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openProjectDetails(projectId);
                        }
                      }}
                    >
                      {projectName || '—'}
                    </button>
                  ) : (
                    <span className="truncate">{projectName || '—'}</span>
                  )}
                </div>
                <div className="min-w-0 truncate text-sm text-[var(--text)]">{label}</div>
                <div className="text-xs text-[var(--muted)] whitespace-nowrap">{displayDate}</div>
              </div>
            );
          })
        )}
      </div>
      {showScrollHint ? (
        <div className="pointer-events-none mt-2 flex justify-center">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-sm">
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M12 16.5 5 9.5l1.4-1.4L12 13.7l5.6-5.6L19 9.5z" />
            </svg>
          </div>
        </div>
      ) : null}
    </Card>
  );
};

export const TeamCapacityCalendarCard: React.FC<{
  rows: DashboardHeatmapRow[];
  loading: boolean;
  deliverables: DeliverableCalendarUnion[];
  deliverablesLoading: boolean;
  onRangeChange: (range: CalendarRange) => void;
  verticalId?: number | null;
}> = ({ rows, loading, deliverables, deliverablesLoading, onRangeChange, verticalId }) => {
  const {
    searchInput,
    setSearchInput,
    searchTokens,
    searchOp,
    activeTokenId,
    setActiveTokenId,
    normalizedSearchTokens,
    removeSearchToken,
    handleSearchOpChange,
    handleSearchKeyDown,
    matchesTokensText,
  } = useSearchTokens();
  const searchTokensActive = normalizedSearchTokens.length > 0;
  const searchIndexQuery = useDeliverablesSearchIndex(deliverables, {
    enabled: searchTokensActive,
    vertical: verticalId ?? undefined,
  });
  const searchIndex = searchIndexQuery.data;

  const filteredRows = React.useMemo(() => {
    if (!searchTokensActive) return rows;
    return rows.filter((row) => {
      const haystack = [row.name, row.department].filter(Boolean).join(' ');
      return matchesTokensText(haystack);
    });
  }, [rows, searchTokensActive, matchesTokensText]);

  const filteredDeliverables = React.useMemo(() => {
    if (!searchTokensActive) return deliverables;
    return deliverables.filter((item) => {
      const projectId = (item as any)?.project as number | undefined;
      const people = projectId != null ? Array.from(searchIndex?.projectPeople.get(projectId) ?? []) : [];
      const departments = projectId != null ? Array.from(searchIndex?.projectDepartments.get(projectId) ?? []) : [];
      const haystack = [
        (item as any)?.title,
        (item as any)?.projectName,
        (item as any)?.projectClient,
        (item as any)?.preDeliverableType,
        ...people,
        ...departments,
      ]
        .filter(Boolean)
        .join(' ');
      return matchesTokensText(haystack);
    });
  }, [deliverables, searchTokensActive, searchIndex?.projectPeople, searchIndex?.projectDepartments, matchesTokensText]);

  const capacityEvents = React.useMemo(
    () => mapCapacityHeatmapToEvents(filteredRows as any[], { clampWeeks: 12 }),
    [filteredRows]
  );
  const deliverableEvents = React.useMemo(
    () => mapDeliverableCalendarToEvents(filteredDeliverables, { includePreDeliverables: true }),
    [filteredDeliverables]
  );
  const events = React.useMemo(() => [...capacityEvents, ...deliverableEvents], [capacityEvents, deliverableEvents]);
  const combinedLoading = loading || deliverablesLoading;
  const renderEventContent = React.useCallback((arg: EventContentArg) => {
    const meta = arg.event.extendedProps as any;
    if (meta?.kind === 'pre_deliverable_group') {
      const titles = meta.preDeliverableTitles ?? [];
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-semibold truncate">{meta.projectName || meta.projectClient || arg.event.title}</span>
          <ul className="list-disc pl-4 text-[var(--muted)] space-y-0.5">
            {titles.map((label: string, idx: number) => (
              <li key={`${arg.event.id}-group-${idx}`} className="truncate">
                {label}
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if (meta?.kind === 'pre_deliverable') {
      const subtitle = meta?.projectClient || meta?.projectName;
      return (
        <div className="flex flex-col text-xs leading-tight">
          <span className="font-semibold truncate">{arg.event.title}</span>
          {subtitle ? <span className="text-[var(--muted)] truncate">{subtitle}</span> : null}
        </div>
      );
    }
    if (meta?.kind === 'deliverable') {
      const label = formatDeliverableInlineLabel(meta, arg.event.title);
      return (
        <span className="fc-deliverable-line" title={label}>
          {label}
        </span>
      );
    }
    return (
      <div className="flex flex-col text-xs leading-tight">
        <span className="font-semibold truncate">{meta?.personName || arg.event.title}</span>
        <span className="text-[var(--muted)] truncate">
          {Math.round(meta?.allocatedHours ?? 0)}h / {meta?.weeklyCapacity ?? 0}h
        </span>
      </div>
    );
  }, []);
  const handleDatesSet = React.useCallback(
    (arg: DatesSetArg) => {
      onRangeChange({
        start: toIsoDate(arg.start),
        end: toIsoDate(subtractOneDay(arg.end)),
      });
    },
    [onRangeChange]
  );

  return (
    <Card className="bg-[var(--card)] border-[var(--border)]">
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text)]">Capacity & Deliverables Timeline</h3>
          <span className="text-xs text-[var(--muted)] hidden sm:inline">List view available on mobile</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[240px]">
            <SearchTokenBar
              id="dashboard-calendar-search"
              label="Search calendar"
              placeholder={searchTokens.length ? 'Add another filter...' : 'Search people, projects, clients, or departments (Enter)'}
              tokens={searchTokens}
              activeTokenId={activeTokenId}
              searchOp={searchOp}
              searchInput={searchInput}
              onInputChange={(value) => { setSearchInput(value); setActiveTokenId(null); }}
              onInputKeyDown={handleSearchKeyDown}
              onTokenSelect={setActiveTokenId}
              onTokenRemove={removeSearchToken}
              onSearchOpChange={handleSearchOpChange}
            />
            {searchTokensActive && searchIndexQuery.isLoading ? (
              <div className="text-[10px] text-[var(--muted)] mt-1">Loading search data…</div>
            ) : null}
          </div>
        </div>
      </div>
      <FullCalendarWrapper
        className="min-h-[520px]"
        events={events}
        loading={combinedLoading}
        emptyState={
          <div className="text-sm text-[var(--muted)]">
            {combinedLoading ? 'Loading…' : 'No capacity or deliverable data for this window.'}
          </div>
        }
        initialView="dayGridMonth"
        responsiveViews={{ mobile: 'listWeek', desktop: 'dayGridMonth' }}
        eventContent={renderEventContent}
        onDatesSet={handleDatesSet}
        height="auto"
        eventOrder={['extendedProps.sortPriority', 'start']}
      />
    </Card>
  );
};
