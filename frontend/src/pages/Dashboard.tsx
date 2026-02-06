/**
 * Dashboard page - Team utilization overview
 * Chunk 4: Real dashboard with team metrics and VSCode dark theme
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '../components/layout/Layout';
import Card from '../components/ui/Card';
import Modal from '@/components/ui/Modal';
import UtilizationBadge from '../components/ui/UtilizationBadge';
import { utilizationLevelToClasses, getUtilizationPill, defaultUtilizationScheme, utilizationLevelToTokens } from '@/util/utilization';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { dashboardApi, departmentsApi, projectsApi, peopleApi, rolesApi } from '../services/api';
import { useAuth } from '@/hooks/useAuth';
import { formatUtcToLocal } from '@/utils/dates';
import QuickActionsInline from '../components/quick-actions/QuickActionsInline';
import { DashboardData, Department, Role } from '../types/models';
import { useCapacityHeatmap } from '../hooks/useCapacityHeatmap';
import { useDepartmentFilter } from '../hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import AssignedHoursBreakdownCard from '@/components/analytics/AssignedHoursBreakdownCard';
import AssignedHoursByClientCard from '@/components/analytics/AssignedHoursByClientCard';
import AssignedHoursTimelineCard from '@/components/analytics/AssignedHoursTimelineCard';
import RoleCapacityCard from '@/components/analytics/RoleCapacityCard';
import { useMobileUiFlag } from '@/mobile/mobileFlags';
import {
  useDashboardHeatmapView,
  getDashboardSummaryTiles,
  DASHBOARD_ANALYTICS_CARD_SPECS,
  type DashboardAnalyticsCardSpec,
  type DashboardSummaryTile,
  type DashboardHeatmapRow,
} from '@/mobile/dashboardAdapters';
import TeamMembersCard from '@/components/dashboard/TeamMembersCard';
import { FullCalendarWrapper, mapCapacityHeatmapToEvents, mapDeliverableCalendarToEvents, formatDeliverableInlineLabel } from '@/features/fullcalendar';
import { useDeliverablesCalendar, buildCalendarRange, subtractOneDay, toIsoDate } from '@/hooks/useDeliverablesCalendar';
import type { CalendarRange } from '@/hooks/useDeliverablesCalendar';
import type { DeliverableCalendarUnion } from '@/features/fullcalendar/eventAdapters';
import type { EventContentArg, DatesSetArg } from '@fullcalendar/core';

const PRIMARY_ANALYTICS_CARDS = DASHBOARD_ANALYTICS_CARD_SPECS.filter(
  (card) => (card.section ?? 'primary') === 'primary'
);
const ANALYTICS_BEFORE_AVAILABILITY = PRIMARY_ANALYTICS_CARDS.filter((card) => card.key !== 'role-capacity');
const ANALYTICS_AFTER_AVAILABILITY = PRIMARY_ANALYTICS_CARDS.filter((card) => card.key === 'role-capacity');
const SECONDARY_ANALYTICS_CARDS = DASHBOARD_ANALYTICS_CARD_SPECS.filter(
  (card) => card.section === 'secondary'
);

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
  const [heatWeeks, setHeatWeeks] = useState<number>(20);
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [projectsTotal, setProjectsTotal] = useState<number>(0);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  // People metadata (hire date, active) for availability filtering
  const [peopleMeta, setPeopleMeta] = useState<Map<number, { isActive?: boolean; hireDate?: string; roleId?: number | null; roleName?: string | null }>>(new Map());
  // Roles (ordered by settings sort_order)
  const [roles, setRoles] = useState<Role[]>([]);
  const mobileDashboardEnabled = useMobileUiFlag('dashboard');
  const [toolbarOffset, setToolbarOffset] = useState(0);
  const [heatmapDetailPerson, setHeatmapDetailPerson] = useState<DashboardHeatmapRow | null>(null);
  const [teamCalendarRange, setTeamCalendarRange] = useState<CalendarRange>(() => buildCalendarRange(Math.min(heatWeeks, 12)));

  // Display helper to format project status labels nicely
  const formatStatusLabel = (raw: string | undefined | null): string => {
    const s = (raw || 'Unknown').toString();
    const words = s.replace(/_/g, ' ').split(' ').filter(Boolean);
    return words
      .map((w) => {
        const lower = w.toLowerCase();
        if (lower === 'ca') return 'CA';
        if (lower.length <= 2) return lower.toUpperCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  };

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

  // Load ordered roles for grouping
  useAuthenticatedEffect(() => {
    if (!auth.accessToken) return;
    (async () => {
      try {
        const list = await rolesApi.listAll();
        setRoles(Array.isArray(list) ? list : []);
      } catch (err) {
        console.warn('Failed to load roles for availability grouping:', err);
        setRoles([]);
      }
    })();
  }, [auth.accessToken]);

  useEffect(() => {
    setTeamCalendarRange((prev) => buildCalendarRange(Math.min(heatWeeks, 12), new Date(prev.start)));
  }, [heatWeeks]);

  useEffect(() => {
    if (!mobileDashboardEnabled) return;
    if (typeof window === 'undefined') return;
    const topbar = document.getElementById('app-topbar');
    if (!topbar) return;
    const updateOffset = () => setToolbarOffset(topbar.getBoundingClientRect().height || 0);
    updateOffset();
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateOffset());
      resizeObserver.observe(topbar);
    }
    window.addEventListener('resize', updateOffset);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOffset);
    };
  }, [mobileDashboardEnabled]);

  const heatQuery = useCapacityHeatmap(
    {
      departmentId: deptState.selectedDepartmentId,
      includeChildren: deptState.includeChildren,
      vertical: verticalState.selectedVerticalId ?? null,
    },
    heatWeeks,
    !loading && !!auth.accessToken
  );
  const heatLoading = heatQuery.isLoading;
  const heatFetching = heatQuery.isFetching;
  const heatmapView = useDashboardHeatmapView(heatQuery.data ?? [], peopleMeta);
  const heatData = heatmapView.rows;
  const weekKeys = heatmapView.weekKeys;
  const currentWeekKey = heatmapView.currentWeekKey;
  const nextWeekKey = heatmapView.nextWeekKey;
  const teamDeliverablesQuery = useDeliverablesCalendar(teamCalendarRange, { mineOnly: false, vertical: verticalState.selectedVerticalId ?? undefined });
  const teamDeliverables = teamDeliverablesQuery.data ?? [];
  const teamDeliverablesLoading = teamDeliverablesQuery.isLoading;
  const { data: utilScheme } = useUtilizationScheme();
  const summaryTiles = useMemo(() => getDashboardSummaryTiles(data), [data]);
  const availabilityRows = useMemo(() => {
    if (!currentWeekKey) return [];
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const rows = heatData
      .map((row) => {
        const weeklyCapacity = Number(row.weeklyCapacity || 0);
        const currentHours = Number(row.weekTotals?.[currentWeekKey] || 0);
        const nextHours = nextWeekKey ? Number(row.weekTotals?.[nextWeekKey] || 0) : 0;
        const curAvail = Math.max(
          0,
          row.availableByWeek?.[currentWeekKey] ?? (weeklyCapacity - currentHours)
        );
        const nextAvail = nextWeekKey
          ? Math.max(0, row.availableByWeek?.[nextWeekKey] ?? (weeklyCapacity - nextHours))
          : 0;
        const roleId = row.personMeta?.roleId ?? null;
        return { row, curAvail, nextAvail, roleId };
      })
      .filter(({ row, curAvail, nextAvail }) => {
        const meta = row.personMeta;
        if (meta?.isActive === false) return false;
        if (meta?.hireDate) {
          const hireDate = new Date(`${meta.hireDate}T00:00:00`);
          if (hireDate > todayMidnight) return false;
        }
        return curAvail > 0 || nextAvail > 0;
      })
      .sort((a, b) => b.curAvail - a.curAvail || b.nextAvail - a.nextAvail);

    return rows;
  }, [heatData, currentWeekKey, nextWeekKey]);
  const toolbarClassName = mobileDashboardEnabled
    ? 'sticky z-20 -mx-4 px-4 py-3 bg-[var(--surface)]/95 backdrop-blur-lg border-b border-[var(--border)] shadow-sm lg:static lg:mx-0 lg:px-0 lg:py-0 lg:border-none lg:bg-transparent lg:shadow-none'
    : '';
  const toolbarStyle = mobileDashboardEnabled ? { top: (toolbarOffset || 0) + 8 } : undefined;
  
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
      setProjectsError(null);
      const list = await projectsApi.listAll({ vertical: verticalState.selectedVerticalId ?? undefined });
      setProjectsTotal(list.length);
      const counts: Record<string, number> = {};
      for (const p of list) {
        const key = (p.status || 'Unknown');
        counts[key] = (counts[key] || 0) + 1;
      }
      setProjectCounts(counts);
    } catch (err: any) {
      setProjectsError(err.message || 'Failed to load projects');
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

  return (
    <Layout>
      <div className="space-y-6" data-mobile-ui={mobileDashboardEnabled ? 'true' : 'false'}>
        {/* Quick Actions moved inline into header */}

        {/* Header */}
        <div
          className={`${toolbarClassName} flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between`}
          style={toolbarStyle}
          role="region"
          aria-label="Dashboard overview and filters"
        >
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-[var(--text)]">
              Team Dashboard
            </h1>
            <p className="text-[var(--muted)] mt-2">
              Overview of team utilization and workload allocation
              {weeksPeriod === 1 ? ' (current week)' : ` (${weeksPeriod} week average)`}
              {deptState.selectedDepartmentId != null && (
                <span className="block mt-1">
                  Filtered by:{' '}
                  {departments.find((d) => d.id === deptState.selectedDepartmentId)?.name || 'Unknown Department'}
                </span>
              )}
            </p>
          </div>

          {/* Department and Time Selectors + Quick Actions */}
          <div className="flex flex-col gap-3 lg:min-w-[360px]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <label className="text-sm text-[var(--muted)]" htmlFor="dashboard-dept-select">
                Department:
              </label>
              <select
                id="dashboard-dept-select"
                value={deptState.selectedDepartmentId != null ? String(deptState.selectedDepartmentId) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setDepartment(val ? Number(val) : null);
                }}
                className="px-3 py-1.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[#007acc] focus:outline-none min-w-[140px] w-full sm:w-[220px]"
              >
                <option value="">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm text-[var(--muted)]" htmlFor="dashboard-weeks-input">
                  Time Period:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="dashboard-weeks-input"
                    type="number"
                    min="1"
                    max="12"
                    value={weeksPeriod}
                    onChange={(e) => handleWeeksPeriodChange(parseInt(e.target.value) || 1)}
                    className="w-20 px-2 py-1 text-sm bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] focus:border-[#007acc] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                  />
                  <span className="text-sm text-[var(--muted)]">
                    {weeksPeriod === 1 ? 'week' : 'weeks'}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2" aria-label="Quick weeks selection">
                {[1, 2, 4, 8, 12].map((weeks) => (
                  <button
                    key={weeks}
                    onClick={() => handleWeeksPeriodChange(weeks)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      weeksPeriod === weeks
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                    }`}
                    type="button"
                  >
                    {weeks}w
                  </button>
                ))}
                <div className="flex-1 min-w-[120px] sm:min-w-[160px]">
                  <QuickActionsInline />
                </div>
              </div>
            </div>
          </div>
        </div>

        {mobileDashboardEnabled ? renderAnalyticsCarousel(PRIMARY_ANALYTICS_CARDS, 'Analytics overview') : null}

        {/* Summary Stats + Analytics */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Consolidated summary card (narrow, vertical list) */}
            <Card className="bg-[var(--card)] border-[var(--border)] w-full h-full col-span-12 sm:col-span-6 lg:col-span-2 min-w-[14rem]">
              <div className="flex flex-col gap-6">
                {summaryTiles.map((tile) => (
                  <div key={tile.key}>
                    <div className="text-[var(--muted)] text-sm">{tile.label}</div>
                    <div className={`text-2xl font-bold ${getSummaryValueClass(tile.accent)}`}>{tile.value}</div>
                    {tile.description ? (
                      <div className="text-xs text-[var(--muted)] mt-1">{tile.description}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
            {/* Project Summary */}
            <Card className="bg-[var(--card)] border-[var(--border)] h-full col-span-12 sm:col-span-6 lg:col-span-2 min-w-[14rem]">
              <h3 className="text-lg font-semibold text-[var(--text)] mb-3">Project Summary</h3>
              {projectsError ? (
                <div className="text-red-400 text-sm">{projectsError}</div>
              ) : (
                <div className="text-sm">
                  {(() => {
                    const items = Object.entries(projectCounts).sort((a, b) => b[1] - a[1]);
                    if (!items.length) return <div className="text-[var(--muted)]">No data</div>;
                    return (
                      <div className="space-y-1">
                        {items.slice(0, 6).map(([status, count]) => (
                          <div key={status} className="flex justify-between">
                            <span className="text-[var(--text)]">{formatStatusLabel(status)}</span>
                            <span className="text-[var(--muted)]">{count}</span>
                          </div>
                        ))}
                        <div className="mt-3 border-t border-[var(--border)] pt-2 flex justify-between font-medium">
                          <span className="text-[var(--text)]">Total</span>
                          <span className="text-[var(--text)]">{projectsTotal}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </Card>

            {/* Utilization Distribution */}
            <Card className="bg-[var(--card)] border-[var(--border)] w-full h-full col-span-12 sm:col-span-6 lg:col-span-3 min-w-[16rem]">
              <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Utilization Distribution</h3>
              <div className="flex flex-col gap-6">
                <div>
                  <div className="text-[var(--muted)] text-sm">Underutilized (&lt;70%)</div>
                  <div className="text-2xl font-bold text-emerald-400">{data.utilization_distribution.underutilized}</div>
                </div>
                <div>
                  <div className="text-[var(--muted)] text-sm">Optimal (70-85%)</div>
                  <div className="text-2xl font-bold text-blue-400">{data.utilization_distribution.optimal}</div>
                </div>
                <div>
                  <div className="text-[var(--muted)] text-sm">High (85-100%)</div>
                  <div className="text-2xl font-bold text-amber-400">{data.utilization_distribution.high}</div>
                </div>
                <div>
                  <div className="text-[var(--muted)] text-sm">Overallocated (&gt;100%)</div>
                  <div className="text-2xl font-bold text-red-400">{data.utilization_distribution.overallocated}</div>
                </div>
              </div>
            </Card>
            {ANALYTICS_BEFORE_AVAILABILITY.map((card) => (
              <div
                key={card.key}
                className={`${card.gridClass ?? 'col-span-12'} ${
                  mobileDashboardEnabled ? 'hidden lg:block' : ''
                }`}
              >
                {renderAnalyticsCard(card)}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-12 gap-6">
            {/* Availability, Role Capacity, and Heat Map row */}
            <div className="col-span-12 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,48rem)_minmax(0,1fr)] lg:items-start">
            <Card className="bg-[var(--card)] border-[var(--border)] flex-1 min-w-[16rem] lg:flex-none lg:max-w-[40rem]">
              <h3 className="text-lg font-semibold text-[var(--text)] mb-3">Availability</h3>
              {heatData && heatData.length > 0 && currentWeekKey ? (
                <>
                  <div className={mobileDashboardEnabled ? 'hidden lg:block' : ''}>
                    {availabilityRows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                        <thead>
                          <tr className="text-[var(--muted)]">
                            <th className="text-left py-1 pr-2">Name</th>
                            <th className="text-right py-1 px-2">Current Week</th>
                            <th className="text-right py-1 pl-2">Next Week</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const grouped = new Map<number | null, typeof availabilityRows>();
                            availabilityRows.forEach((entry) => {
                              const key = entry.roleId ?? null;
                              const arr = grouped.get(key) || [];
                              arr.push(entry);
                              grouped.set(key, arr);
                            });
                            const roleOrder: Array<number | null> = [...roles.map((role) => role.id ?? null), null];
                            const rows: React.ReactElement[] = [];
                            for (const rid of roleOrder) {
                              const group = grouped.get(rid) || [];
                              if (!group.length) continue;
                              const roleName =
                                rid == null ? 'Unassigned' : (roles.find((role) => role.id === rid)?.name || 'Unknown');
                              rows.push(
                                <tr key={`availability-role-${rid ?? 'none'}`}>
                                  <td colSpan={3} className="pt-2 font-semibold text-[var(--text)]">
                                    {roleName}
                                  </td>
                                </tr>
                              );
                              group
                                .sort((a, b) => b.curAvail - a.curAvail || b.nextAvail - a.nextAvail)
                                .forEach(({ row, curAvail, nextAvail }) => {
                                  rows.push(
                                    <tr
                                      key={`availability-${rid ?? 'none'}-${row.id}`}
                                      className="border-t border-[var(--border)] hover:bg-[var(--surface)]/30"
                                    >
                                      <td className="py-1 pr-2 text-[var(--text)] max-w-[12rem] truncate" title={row.name}>
                                        {row.name}
                                      </td>
                                      <td className="py-1 px-2 text-right text-emerald-400">{curAvail.toFixed(0)}h</td>
                                      <td className="py-1 pl-2 text-right text-emerald-400">{nextAvail.toFixed(0)}h</td>
                                    </tr>
                                  );
                                });
                            }
                            return rows;
                          })()}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-[var(--muted)] text-sm">{heatLoading ? 'Loading…' : 'No data'}</div>
                  )}
                </div>
                {mobileDashboardEnabled ? (
                  availabilityRows.length > 0 ? (
                    <div className="lg:hidden max-h-[420px] overflow-y-auto space-y-3 pr-1" role="list" aria-label="Team availability cards">
                      {availabilityRows.map(({ row, curAvail, nextAvail }) => (
                        <div key={`availability-card-${row.id}`} className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface)]/40" role="listitem">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[var(--text)] font-semibold truncate">{row.name}</div>
                              {row.personMeta?.roleName ? (
                                <div className="text-xs text-[var(--muted)] truncate">{row.personMeta.roleName}</div>
                              ) : null}
                            </div>
                            <div className="text-right text-xs text-[var(--muted)]">
                              <div><span className="text-[var(--text)] font-semibold">{curAvail.toFixed(0)}h</span> now</div>
                              {nextWeekKey ? (
                                <div><span className="text-[var(--text)] font-semibold">{nextAvail.toFixed(0)}h</span> next</div>
                              ) : null}
                            </div>
                          </div>
                          <HeatmapSparkline row={row} weekKeys={weekKeys} />
                          <div className="mt-2 flex items-center justify-between text-xs text-[var(--muted)]">
                            <span>Tap for full schedule</span>
                            <button
                              type="button"
                              className="text-[var(--primary)] hover:underline font-semibold"
                              onClick={() => setHeatmapDetailPerson(row)}
                            >
                              View details
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="lg:hidden text-[var(--muted)] text-sm">{heatLoading ? 'Loading…' : 'No data'}</div>
                  )
                ) : null}
              </>
              ) : (
                <div className="text-[var(--muted)] text-sm">{heatLoading ? 'Loading…' : 'No data'}</div>
              )}
            </Card>
            <div className="space-y-6 lg:max-w-[48rem]">
              {ANALYTICS_AFTER_AVAILABILITY.map((card) => (
                <div
                  key={card.key}
                  className={`${card.gridClass ?? 'col-span-12'} ${
                    mobileDashboardEnabled ? 'hidden lg:block' : ''
                  }`}
                >
                  {renderAnalyticsCard(card)}
                </div>
              ))}
              <div className="hidden lg:block">
                <TeamMembersCard rows={heatData} loading={heatLoading} />
              </div>
              <Card className="hidden lg:block bg-[var(--card)] border-[var(--border)]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-[var(--text)]">Team Overview</h3>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--muted)]">Heat:</span>
                    {[4, 8, 12, 20].map((w) => (
                      <button
                        key={w}
                        onClick={() => setHeatWeeks(w)}
                        className={`px-2 py-0.5 rounded ${heatWeeks === w ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'}`}
                        aria-pressed={heatWeeks === w}
                      >
                        {w}w
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                  {data.team_overview.map((person) => (
                    <div key={person.id} className="flex items-center justify-between p-3 bg-[var(--surface)]/50 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-[var(--text)]">{person.name}</div>
                        <div className="text-sm text-[var(--muted)]">
                          {person.role} - {person.allocated_hours}h / {person.capacity}h
                        </div>
                        {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (
                          <div className="text-xs text-amber-400 mt-1">
                            Peak: {person.peak_utilization_percent}%
                            {person.is_peak_overallocated && ' over'}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <UtilizationBadge percentage={person.utilization_percent} />
                        {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (() => {
                          const pct = person.peak_utilization_percent || 0;
                          const level = pct <= 70 ? 'blue' : pct <= 85 ? 'green' : pct <= 100 ? 'orange' : 'red';
                          const classes = utilizationLevelToClasses(level as any);
                          return (
                            <div className={`text-xs px-2 py-1 rounded border ${classes}`}>
                              Peak: {pct}%
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
            <div className="col-span-12">
              <TeamCapacityCalendarCard
                rows={heatData}
                loading={heatLoading}
                deliverables={teamDeliverables}
                deliverablesLoading={teamDeliverablesLoading}
                onRangeChange={setTeamCalendarRange}
              />
            </div>
          </div>
        </div>

        <div className="lg:hidden">
          <TeamMembersCard rows={heatData} loading={heatLoading} />
        </div>

        {/* Team Overview (mobile) */}
        <Card className="bg-[var(--card)] border-[var(--border)] lg:hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text)]">Team Overview</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)]">Heat:</span>
              {[4, 8, 12, 20].map((w) => (
                <button
                  key={w}
                  onClick={() => setHeatWeeks(w)}
                  className={`px-2 py-0.5 rounded ${heatWeeks === w ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'}`}
                  aria-pressed={heatWeeks === w}
                >
                  {w}w
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto">
            {data.team_overview.map((person) => (
              <div key={person.id} className="flex items-center justify-between p-3 bg-[var(--surface)]/50 rounded-lg">
                <div className="flex-1">
                  <div className="font-medium text-[var(--text)]">{person.name}</div>
                  <div className="text-sm text-[var(--muted)]">
                    {person.role} - {person.allocated_hours}h / {person.capacity}h
                  </div>
                  {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (
                    <div className="text-xs text-amber-400 mt-1">
                      Peak: {person.peak_utilization_percent}%
                      {person.is_peak_overallocated && ' over'}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <UtilizationBadge percentage={person.utilization_percent} />
                  {weeksPeriod > 1 && person.peak_utilization_percent !== person.utilization_percent && (() => {
                    const pct = person.peak_utilization_percent || 0;
                    const level = pct <= 70 ? 'blue' : pct <= 85 ? 'green' : pct <= 100 ? 'orange' : 'red';
                    const classes = utilizationLevelToClasses(level as any);
                    return (
                      <div className={`text-xs px-2 py-1 rounded border ${classes}`}>
                        Peak: {pct}%
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {mobileDashboardEnabled ? renderAnalyticsCarousel(SECONDARY_ANALYTICS_CARDS, 'Timeline analytics') : null}
        {SECONDARY_ANALYTICS_CARDS.map((card) => (
          <div key={card.key} className={mobileDashboardEnabled ? 'hidden lg:block' : ''}>
            {renderAnalyticsCard(card)}
          </div>
        ))}

        {/* Utilization Distribution moved to top row */}

        {/* Recent Assignments */}
        {data.recent_assignments.length > 0 && (
          <Card className="bg-[var(--card)] border-[var(--border)]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-4">Recent Assignments</h3>
            <div className="space-y-2">
              {data.recent_assignments.map((assignment, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-[var(--surface)]/30 rounded">
                  <div>
                    <span className="text-[var(--text)] font-medium">{assignment.person}</span>
                    <span className="text-[var(--muted)]"> assigned to </span>
                    <span className="text-[var(--text)]">{assignment.project}</span>
                  </div>
                  <div className="text-[var(--muted)] text-sm">
                    {formatUtcToLocal(assignment.created)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {heatmapDetailPerson ? (
        <Modal
          isOpen={!!heatmapDetailPerson}
          title={`${heatmapDetailPerson.name} availability`}
          width={520}
          onClose={() => setHeatmapDetailPerson(null)}
          >
            <div className="space-y-4 text-[var(--text)]">
              <div className="text-sm text-[var(--muted)]">
                Weekly capacity: {heatmapDetailPerson.weeklyCapacity ?? 0}h
              </div>
              <HeatmapSparkline row={heatmapDetailPerson} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="text-[var(--muted)]">
                      <th className="text-left py-1 pr-2">Week</th>
                      <th className="text-right py-1 pr-2">Allocated</th>
                      <th className="text-right py-1 pr-2">Utilization</th>
                      <th className="text-right py-1">Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapDetailPerson.weekKeys.map((wk) => {
                      const hours = Number(heatmapDetailPerson.weekTotals?.[wk] || 0);
                      const capacity = Number(heatmapDetailPerson.weeklyCapacity || 0);
                      const pct = capacity ? Math.round((hours / capacity) * 100) : 0;
                      const available =
                        typeof heatmapDetailPerson.availableByWeek?.[wk] === 'number'
                          ? Number(heatmapDetailPerson.availableByWeek?.[wk])
                          : Math.max(0, capacity - hours);
                      return (
                        <tr key={`detail-${wk}`} className="border-t border-[var(--border)]">
                          <td className="py-1 pr-2">{wk}</td>
                          <td className="py-1 pr-2 text-right">{hours.toFixed(1)}h</td>
                          <td className="py-1 pr-2 text-right">{pct}%</td>
                          <td className="py-1 text-right">{available.toFixed(1)}h</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Modal>
        ) : null}
      </div>
    </Layout>
  );
};

export default Dashboard;

function getSummaryValueClass(accent?: DashboardSummaryTile['accent']): string {
  switch (accent) {
    case 'info':
      return 'text-blue-400';
    case 'warning':
      return 'text-amber-400';
    case 'danger':
      return 'text-red-400';
    default:
      return 'text-[var(--text)]';
  }
}

function renderAnalyticsCard(spec: DashboardAnalyticsCardSpec) {
  switch (spec.component) {
    case 'AssignedHoursBreakdownCard': {
      const breakdownProps = (spec.props ?? {}) as React.ComponentProps<typeof AssignedHoursBreakdownCard>;
      return (
        <AssignedHoursBreakdownCard {...breakdownProps} />
      );
    }
    case 'AssignedHoursByClientCard': {
      const clientProps = (spec.props ?? {}) as React.ComponentProps<typeof AssignedHoursByClientCard>;
      return (
        <AssignedHoursByClientCard {...clientProps} />
      );
    }
    case 'RoleCapacityCard': {
      const roleProps = (spec.props ?? {}) as React.ComponentProps<typeof RoleCapacityCard>;
      return (
        <RoleCapacityCard {...roleProps} />
      );
    }
    case 'AssignedHoursTimelineCard':
    default: {
      const timelineProps = (spec.props ?? {}) as React.ComponentProps<typeof AssignedHoursTimelineCard>;
      return (
        <AssignedHoursTimelineCard {...timelineProps} />
      );
    }
  }
}

function renderAnalyticsCarousel(cards: DashboardAnalyticsCardSpec[], ariaLabel: string) {
  if (!cards.length) return null;
  return (
    <div className="-mx-4 px-4 lg:hidden" role="region" aria-label={ariaLabel}>
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4">
        {cards.map((card) => (
          <div key={`carousel-${card.key}`} className="min-w-[16rem] flex-none snap-start">
            {renderAnalyticsCard(card)}
          </div>
        ))}
      </div>
    </div>
  );
}

export const TeamCapacityCalendarCard: React.FC<{
  rows: DashboardHeatmapRow[];
  loading: boolean;
  deliverables: DeliverableCalendarUnion[];
  deliverablesLoading: boolean;
  onRangeChange: (range: CalendarRange) => void;
}> = ({ rows, loading, deliverables, deliverablesLoading, onRangeChange }) => {
  const capacityEvents = React.useMemo(() => mapCapacityHeatmapToEvents(rows as any[], { clampWeeks: 12 }), [rows]);
  const deliverableEvents = React.useMemo(
    () => mapDeliverableCalendarToEvents(deliverables, { includePreDeliverables: true }),
    [deliverables]
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-[var(--text)]">Capacity & Deliverables Timeline</h3>
        <span className="text-xs text-[var(--muted)] hidden sm:inline">List view available on mobile</span>
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

const HeatmapSparkline: React.FC<{ row: DashboardHeatmapRow; weekKeys?: string[] }> = ({ row, weekKeys }) => {
  const keys = weekKeys && weekKeys.length > 0 ? weekKeys : row.weekKeys;
  if (!keys.length) return null;
  const width = Math.max(140, keys.length * 16);
  const height = 40;
  const padding = 4;
  const pathPoints = keys.map((wk, index) => {
    const hours = Number(row.weekTotals?.[wk] || 0);
    const pct = row.weeklyCapacity ? Math.min(1.2, hours / row.weeklyCapacity) : 0;
    const x =
      padding +
      (keys.length === 1 ? 0 : (index / (keys.length - 1)) * (width - padding * 2));
    const y = height - padding - Math.min(1, pct) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Utilization trend for ${row.name}`}
    >
      <polyline
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pathPoints.join(' ')}
      />
    </svg>
  );
};
