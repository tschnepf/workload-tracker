import { useMemo } from 'react';
import type { DashboardData, PersonCapacityHeatmapItem } from '@/types/models';

type PersonMeta = {
  isActive?: boolean;
  hireDate?: string;
  roleId?: number | null;
  roleName?: string | null;
};

type RawHeatmapRow = PersonCapacityHeatmapItem & {
  availableByWeek?: Record<string, number>;
};

export interface DashboardHeatmapRow extends RawHeatmapRow {
  availableByWeek: Record<string, number>;
  personMeta: PersonMeta | null;
}

export interface DashboardHeatmapView {
  rows: DashboardHeatmapRow[];
  weekKeys: string[];
  currentWeekKey: string | null;
  nextWeekKey: string | null;
}

export function useDashboardHeatmapView(
  rows: RawHeatmapRow[],
  peopleMeta: Map<number, PersonMeta>
): DashboardHeatmapView {
  return useMemo<DashboardHeatmapView>(() => {
    const normalized = rows.map((row) => ({
      ...row,
      availableByWeek: row.availableByWeek ?? {},
      personMeta: peopleMeta.get(row.id) ?? null,
    }));
    const weekKeys = normalized[0]?.weekKeys ?? [];
    return {
      rows: normalized,
      weekKeys,
      currentWeekKey: weekKeys[0] ?? null,
      nextWeekKey: weekKeys[1] ?? null,
    };
  }, [rows, peopleMeta]);
}

export interface DashboardSummaryTile {
  key: string;
  label: string;
  value: string | number;
  accent?: 'default' | 'info' | 'warning' | 'danger';
  description?: string | null;
}

export function getDashboardSummaryTiles(data: DashboardData | null): DashboardSummaryTile[] {
  if (!data) return [];
  const summary = data.summary;
  return [
    {
      key: 'total-people',
      label: 'Total Team Members',
      value: summary.total_people,
    },
    {
      key: 'avg-utilization',
      label: 'Average Utilization',
      value: `${summary.avg_utilization}%`,
      accent: 'info',
    },
    {
      key: 'peak-utilization',
      label: 'Peak Utilization',
      value: `${summary.peak_utilization}%`,
      accent: 'warning',
      description: summary.peak_person || null,
    },
    {
      key: 'total-assignments',
      label: 'Active Assignments',
      value: summary.total_assignments,
    },
    {
      key: 'overallocated',
      label: 'Overallocated',
      value: summary.overallocated_count,
      accent: 'danger',
    },
  ];
}

export type DashboardAnalyticsComponent =
  | 'AssignedHoursBreakdownCard'
  | 'AssignedHoursByClientCard'
  | 'AssignedHoursTimelineCard'
  | 'RoleCapacityCard';

export interface DashboardAnalyticsCardSpec {
  key: string;
  component: DashboardAnalyticsComponent;
  gridClass?: string;
  props?: Record<string, unknown>;
  section?: 'primary' | 'secondary';
}

export const DASHBOARD_ANALYTICS_CARD_SPECS: DashboardAnalyticsCardSpec[] = [
  {
    key: 'hours-by-status',
    component: 'AssignedHoursBreakdownCard',
    gridClass: 'col-span-12 sm:col-span-6 lg:col-span-2 min-w-[14rem]',
    props: { className: 'w-full h-full max-w-none', size: 96, responsive: true },
    section: 'primary',
  },
  {
    key: 'hours-by-client',
    component: 'AssignedHoursByClientCard',
    gridClass: 'col-span-12 sm:col-span-6 lg:col-span-3 min-w-[16rem]',
    props: { className: 'w-full', size: 96, responsive: true },
    section: 'primary',
  },
  {
    key: 'role-capacity',
    component: 'RoleCapacityCard',
    gridClass: 'w-full',
    props: {
      hideControls: { timeframe: true },
      className: 'bg-[var(--card)] border-[var(--border)] w-full',
    },
    section: 'primary',
  },
];
