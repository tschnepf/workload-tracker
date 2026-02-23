/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */

import React, { useMemo, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import UtilizationBadge from '@/components/ui/UtilizationBadge';
import AssignedHoursByClientCard from '@/components/analytics/AssignedHoursByClientCard';
import {
  assignmentsApi,
  dashboardApi,
  deliverableAssignmentsApi,
  departmentsApi,
  peopleApi,
} from '@/services/api';
import type {
  Assignment,
  DashboardData,
  DeliverableAssignment,
  Department,
  PersonUtilization,
} from '@/types/models';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { getDepartmentManagerSummary } from '@/utils/departmentManagers';
import { useCapacityHeatmap } from '@/hooks/useCapacityHeatmap';
import { useDeliverablesCalendar } from '@/hooks/useDeliverablesCalendar';

type LayoutOption = 'risk' | 'people' | 'predictive';
type RiskSortKey = 'name' | 'utilization' | 'overlapDeliverables' | 'deliverablesWithin3Days' | 'riskScore';
type SortDirection = 'asc' | 'desc';

type ScopedDeliverable = {
  id: number;
  date: string;
  title: string;
  projectName: string;
  projectClient: string | null;
  projectId: number | null;
};

type NormalizedAssignment = {
  id: number;
  personId: number;
  projectId: number | null;
  projectName: string;
  roleName: string;
  weeklyHours: Record<string, number>;
};

type ManagerRiskRow = {
  personId: number;
  name: string;
  role: string;
  utilization: number;
  allocated: number;
  capacity: number;
  projectedAssigned: number;
  availabilityPct: number;
  overlapDeliverables: number;
  deliverablesWithin3Days: number;
  overage: number;
  riskScore: number;
};

type DensityDay = {
  date: string;
  label: string;
  count: number;
  tone: 'low' | 'medium' | 'high';
};

type ProjectRiskCard = {
  projectId: number | null;
  project: string;
  avgUtilization: number;
  upcomingDeliverables: number;
  roleImbalance: number;
  assignedHours: number;
};

type ForecastPoint = {
  weekKey: string;
  label: string;
  allocated: number;
  capacity: number;
  utilization: number;
};

type PersonDeliverableStat = {
  overlapCount: number;
  within3Days: number;
  totalDeliverables: number;
  byDate: Map<string, number>;
  tokensByDate: Map<string, string[]>;
  deliverables: ScopedDeliverable[];
};

type PersonProjectLoad = {
  projectName: string;
  hours: number;
};

type ReallocationSuggestion = {
  id: string;
  sourceId: number;
  targetId: number;
  text: string;
  impact: number;
};

type RiskCellTone = 'critical' | 'warning' | 'watch' | 'stable';

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map((value) => Number(value));
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatShortDate(dateStr: string): string {
  return parseIsoDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekLabel(dateStr: string): string {
  return parseIsoDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function extractPhaseToken(title: string): string {
  const tokenMatch = title.toUpperCase().match(/\b(SD|DD|IFP|IFC|CD|BID|QA|CON)\b/);
  return tokenMatch ? tokenMatch[1] : 'DLV';
}

function normalizeCollection<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as any).results)) {
    return (value as any).results as T[];
  }
  return [];
}

function normalizeWeeklyHours(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const map = value as Record<string, unknown>;
  const normalized: Record<string, number> = {};
  Object.entries(map).forEach(([weekKey, hours]) => {
    const numeric = Number(hours || 0);
    if (Number.isFinite(numeric)) normalized[weekKey] = numeric;
  });
  return normalized;
}

function sumHoursForWeeks(weeklyHours: Record<string, number>, weekKeys: string[]): number {
  if (!weekKeys.length) return 0;
  return weekKeys.reduce((sum, weekKey) => sum + Number(weeklyHours[weekKey] || 0), 0);
}

const layoutLabels: Record<LayoutOption, string> = {
  risk: 'Option 1: Risk Command Center',
  people: 'Option 2: People-Centric',
  predictive: 'Option 3: Predictive View',
};

const toneClasses: Record<DensityDay['tone'], string> = {
  low: 'bg-blue-500/15 text-blue-200 border-blue-500/30',
  medium: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  high: 'bg-red-500/15 text-red-200 border-red-500/30',
};

const riskBadgeClasses = [
  { min: 14, className: 'border-red-500/40 bg-red-500/20 text-red-200' },
  { min: 8, className: 'border-amber-500/40 bg-amber-500/20 text-amber-200' },
  { min: 0, className: 'border-blue-500/35 bg-blue-500/15 text-blue-200' },
];

const riskCellToneClasses: Record<RiskCellTone, { base: string; selected: string }> = {
  critical: {
    base: 'border-red-500/35 bg-red-500/12 hover:border-red-400/45 hover:bg-red-500/18',
    selected: 'border-red-400/70 bg-red-500/24 shadow-[0_10px_22px_rgba(239,68,68,0.28)]',
  },
  warning: {
    base: 'border-amber-500/35 bg-amber-500/11 hover:border-amber-400/45 hover:bg-amber-500/16',
    selected: 'border-amber-400/70 bg-amber-500/23 shadow-[0_10px_22px_rgba(245,158,11,0.24)]',
  },
  watch: {
    base: 'border-blue-500/30 bg-blue-500/10 hover:border-blue-400/45 hover:bg-blue-500/16',
    selected: 'border-blue-400/70 bg-blue-500/22 shadow-[0_10px_22px_rgba(59,130,246,0.26)]',
  },
  stable: {
    base: 'border-emerald-500/28 bg-emerald-500/9 hover:border-emerald-400/42 hover:bg-emerald-500/14',
    selected: 'border-emerald-400/65 bg-emerald-500/20 shadow-[0_10px_22px_rgba(16,185,129,0.25)]',
  },
};

function getRiskCellTone(row: ManagerRiskRow): RiskCellTone {
  if (row.riskScore >= 14 || row.utilization >= 110) return 'critical';
  if (row.riskScore >= 9 || row.utilization >= 100) return 'warning';
  if (row.riskScore >= 5 || row.utilization >= 90) return 'watch';
  return 'stable';
}

const shellCardClass =
  'rounded-2xl border border-white/10 bg-[linear-gradient(150deg,rgba(23,26,41,0.95)_0%,rgba(13,15,26,0.93)_62%,rgba(9,11,18,0.95)_100%)] shadow-[0_24px_72px_rgba(0,0,0,0.5)] backdrop-blur';

const sectionCardClass =
  'rounded-xl border border-white/10 bg-[linear-gradient(160deg,rgba(30,33,49,0.86)_0%,rgba(16,18,30,0.94)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_38px_rgba(0,0,0,0.34)]';

const insetCardClass =
  'rounded-lg border border-white/10 bg-[linear-gradient(160deg,rgba(19,22,35,0.88)_0%,rgba(12,14,23,0.9)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';

const MetricTile: React.FC<{
  label: string;
  value: React.ReactNode;
  subtext?: string;
  tone?: 'neutral' | 'info' | 'warning' | 'danger';
}> = ({ label, value, subtext, tone = 'neutral' }) => {
  const toneClass =
    tone === 'danger'
      ? 'border-red-500/45'
      : tone === 'warning'
        ? 'border-amber-500/45'
        : tone === 'info'
          ? 'border-blue-500/45'
          : 'border-white/10';

  return (
    <Card className={`${sectionCardClass} ${toneClass} p-4`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold leading-none text-slate-100">{value}</div>
      {subtext ? <div className="mt-2 text-[11px] text-slate-400">{subtext}</div> : null}
    </Card>
  );
};

const TrendProjectionChart: React.FC<{ points: ForecastPoint[] }> = ({ points }) => {
  if (!points.length) {
    return <div className="text-sm text-slate-400">No trend data available for this scope.</div>;
  }

  const width = 520;
  const height = 180;
  const paddingX = 20;
  const paddingY = 24;
  const usableWidth = width - paddingX * 2;
  const usableHeight = height - paddingY * 2;
  const maxUtil = Math.max(110, ...points.map((point) => point.utilization + 6));
  const minUtil = Math.min(65, ...points.map((point) => point.utilization - 6));
  const domain = Math.max(10, maxUtil - minUtil);

  const chartPoints = points.map((point, index) => {
    const x =
      paddingX +
      (points.length <= 1 ? usableWidth / 2 : (index / (points.length - 1)) * usableWidth);
    const y = paddingY + ((maxUtil - point.utilization) / domain) * usableHeight;
    return { ...point, x, y };
  });

  const polyline = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="4-week utilization projection" className="h-48 w-full">
        <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} stroke="rgba(255,255,255,0.18)" />
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="rgba(255,255,255,0.18)" />
        <polyline fill="none" stroke="rgb(96, 165, 250)" strokeWidth="3" points={polyline} strokeLinecap="round" strokeLinejoin="round" />
        {chartPoints.map((point) => (
          <g key={point.weekKey}>
            <circle cx={point.x} cy={point.y} r="4" fill="rgb(96, 165, 250)" />
            <text x={point.x} y={point.y - 10} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {point.utilization}%
            </text>
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {points.map((point) => (
          <div key={`legend-${point.weekKey}`} className={`${insetCardClass} px-3 py-2`}>
            <div className="text-[11px] text-slate-400">{point.label}</div>
            <div className="text-sm font-semibold text-slate-100">{point.utilization}%</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ManagerDashboard: React.FC = () => {
  const { state: verticalState } = useVerticalFilter();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedSubDepartment, setSelectedSubDepartment] = useState<string>('all');

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [rawAssignments, setRawAssignments] = useState<Assignment[]>([]);
  const [rawDeliverableLinks, setRawDeliverableLinks] = useState<DeliverableAssignment[]>([]);

  const [loading, setLoading] = useState(true);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataWarning, setDataWarning] = useState<string | null>(null);

  const [weeksPeriod, setWeeksPeriod] = useState<number>(2);
  const [layoutOption, setLayoutOption] = useState<LayoutOption>('risk');

  const [riskSort, setRiskSort] = useState<{ key: RiskSortKey; direction: SortDirection }>({
    key: 'riskScore',
    direction: 'desc',
  });

  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [selectedPersonUtilization, setSelectedPersonUtilization] = useState<PersonUtilization | null>(null);
  const [selectedPersonLoading, setSelectedPersonLoading] = useState(false);
  const [selectedPersonError, setSelectedPersonError] = useState<string | null>(null);

  const selectedDepartmentId = selectedDepartment ? Number(selectedDepartment) : null;

  const selectedDepartmentInfo = useMemo(
    () => departments.find((department) => department.id?.toString() === selectedDepartment) ?? null,
    [departments, selectedDepartment],
  );

  const rootDepartments = useMemo(() => {
    const roots = departments.filter((department) => !department.parentDepartment);
    return roots.length ? roots : departments;
  }, [departments]);

  const subDepartments = useMemo(() => {
    if (!selectedDepartmentId) return [] as Department[];
    return departments
      .filter((department) => Number(department.parentDepartment || 0) === selectedDepartmentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, selectedDepartmentId]);

  const scopeDepartmentId = useMemo(() => {
    if (!selectedDepartmentId) return null;
    if (selectedSubDepartment !== 'all') return Number(selectedSubDepartment);
    return selectedDepartmentId;
  }, [selectedDepartmentId, selectedSubDepartment]);

  const scopeDepartmentInfo = useMemo(() => {
    if (!scopeDepartmentId) return null;
    return departments.find((department) => department.id === scopeDepartmentId) ?? null;
  }, [departments, scopeDepartmentId]);

  useAuthenticatedEffect(() => {
    (async () => {
      try {
        setError(null);

        let fetched: Department[] = [];
        try {
          const bulk = await departmentsApi.listAll({ vertical: verticalState.selectedVerticalId ?? undefined });
          fetched = normalizeCollection<Department>(bulk);
        } catch {
          const paged = await departmentsApi.list({
            page_size: 500,
            vertical: verticalState.selectedVerticalId ?? undefined,
          });
          fetched = normalizeCollection<Department>(paged);
        }

        const sorted = [...fetched].sort((a, b) => a.name.localeCompare(b.name));
        setDepartments(sorted);
        if (!selectedDepartment && sorted.length > 0 && sorted[0].id != null) {
          setSelectedDepartment(String(sorted[0].id));
        }
      } catch (err: any) {
        console.error('Error loading departments:', err);
        setError(`Failed to load departments${err?.message ? `: ${err.message}` : ''}`);
      }
    })();
  }, [verticalState.selectedVerticalId]);

  React.useEffect(() => {
    setSelectedSubDepartment('all');
  }, [selectedDepartment]);

  useAuthenticatedEffect(() => {
    if (!scopeDepartmentId) {
      setDashboardData(null);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await dashboardApi.getDashboard(
          weeksPeriod,
          String(scopeDepartmentId),
          verticalState.selectedVerticalId ?? undefined,
        );

        setDashboardData(response);
      } catch (err: any) {
        console.error('Error loading manager dashboard:', err);
        setError(err?.message || 'Failed to load manager dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, [scopeDepartmentId, weeksPeriod, verticalState.selectedVerticalId]);

  useAuthenticatedEffect(() => {
    if (!scopeDepartmentId) {
      setRawAssignments([]);
      setRawDeliverableLinks([]);
      return;
    }

    (async () => {
      try {
        setDatasetLoading(true);
        setDataWarning(null);

        const [assignmentsPayload, linksPayload] = await Promise.all([
          assignmentsApi.listAll(
            {
              department: scopeDepartmentId,
              include_children: 0,
              include_placeholders: 0,
              vertical: verticalState.selectedVerticalId ?? undefined,
            },
            { noCache: true },
          ),
          deliverableAssignmentsApi.list({ all: true }),
        ]);

        setRawAssignments(normalizeCollection<Assignment>(assignmentsPayload));
        setRawDeliverableLinks(normalizeCollection<DeliverableAssignment>(linksPayload));
      } catch (err: any) {
        console.error('Error loading manager datasets:', err);
        setRawAssignments([]);
        setRawDeliverableLinks([]);
        setDataWarning(`Some supporting datasets failed to load${err?.message ? `: ${err.message}` : ''}`);
      } finally {
        setDatasetLoading(false);
      }
    })();
  }, [scopeDepartmentId, verticalState.selectedVerticalId]);

  const heatmapQuery = useCapacityHeatmap(
    {
      departmentId: scopeDepartmentId,
      includeChildren: false,
      vertical: verticalState.selectedVerticalId ?? null,
    },
    Math.max(8, weeksPeriod),
    Boolean(scopeDepartmentId),
  );

  const heatRows = useMemo(() => heatmapQuery.data ?? [], [heatmapQuery.data]);
  const weekKeys = useMemo(() => heatRows[0]?.weekKeys ?? [], [heatRows]);
  const currentWeekKey = weekKeys[0] ?? null;
  const metricWeekKeys = useMemo(() => {
    const keys = weekKeys.slice(0, Math.max(1, weeksPeriod));
    return keys.length ? keys : weekKeys.slice(0, 1);
  }, [weekKeys, weeksPeriod]);

  const heatRowByPerson = useMemo(() => {
    return new Map<number, (typeof heatRows)[number]>(heatRows.map((row) => [row.id, row]));
  }, [heatRows]);

  const horizonRange = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + weeksPeriod * 7 - 1);
    return { start: toLocalIsoDate(start), end: toLocalIsoDate(end) };
  }, [weeksPeriod]);

  const deliverablesQuery = useDeliverablesCalendar(horizonRange, {
    mineOnly: false,
    vertical: verticalState.selectedVerticalId ?? undefined,
  });

  const normalizedAssignments = useMemo<NormalizedAssignment[]>(() => {
    return rawAssignments
      .map((assignment) => {
        const raw = assignment as any;
        const personId = Number(raw.person ?? 0);
        const projectRaw = raw.project;
        const projectId =
          projectRaw != null && Number.isFinite(Number(projectRaw)) ? Number(projectRaw) : null;

        if (!personId || !Number.isFinite(personId)) return null;

        return {
          id: Number(raw.id || 0),
          personId,
          projectId,
          projectName: String(raw.projectDisplayName || 'Unspecified Project'),
          roleName: String(raw.roleName || 'Unspecified role'),
          weeklyHours: normalizeWeeklyHours(raw.weeklyHours),
        };
      })
      .filter((assignment): assignment is NormalizedAssignment => assignment !== null);
  }, [rawAssignments]);

  const scopeProjectIds = useMemo(() => {
    const ids = new Set<number>();
    normalizedAssignments.forEach((assignment) => {
      if (assignment.projectId != null) ids.add(assignment.projectId);
    });
    return ids;
  }, [normalizedAssignments]);

  const allDeliverables = useMemo<ScopedDeliverable[]>(
    () =>
      (deliverablesQuery.data ?? [])
        .map((item) => {
          const raw = item as any;
          const itemType = raw.itemType ?? 'deliverable';
          if (itemType !== 'deliverable') return null;
          const date = typeof raw.date === 'string' ? raw.date : null;
          if (!date) return null;

          return {
            id: Number(raw.id ?? 0),
            date,
            title: String(raw.title || 'Deliverable'),
            projectName: String(raw.projectName || 'Unspecified Project'),
            projectClient: raw.projectClient ? String(raw.projectClient) : null,
            projectId: raw.project != null ? Number(raw.project) : null,
          };
        })
        .filter((item): item is ScopedDeliverable => item !== null),
    [deliverablesQuery.data],
  );

  const scopedDeliverables = useMemo(() => {
    if (!scopeProjectIds.size) return [] as ScopedDeliverable[];
    return allDeliverables.filter((deliverable) => deliverable.projectId != null && scopeProjectIds.has(deliverable.projectId));
  }, [allDeliverables, scopeProjectIds]);

  const dateKeysInRange = useMemo(() => {
    const output: string[] = [];
    const start = parseIsoDate(horizonRange.start);
    const end = parseIsoDate(horizonRange.end);
    const cursor = new Date(start);
    while (cursor <= end) {
      output.push(toLocalIsoDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return output;
  }, [horizonRange.start, horizonRange.end]);

  const deliverableCountsByDate = useMemo(() => {
    const map = new Map<string, number>();
    scopedDeliverables.forEach((deliverable) => {
      map.set(deliverable.date, (map.get(deliverable.date) || 0) + 1);
    });
    return map;
  }, [scopedDeliverables]);

  const densityDays = useMemo<DensityDay[]>(() => {
    return dateKeysInRange.map((date) => {
      const count = deliverableCountsByDate.get(date) || 0;
      const tone: DensityDay['tone'] = count >= 8 ? 'high' : count >= 4 ? 'medium' : 'low';
      return { date, label: formatShortDate(date), count, tone };
    });
  }, [dateKeysInRange, deliverableCountsByDate]);

  const densityDisplayDays = useMemo(() => {
    const active = densityDays.filter((day) => day.count > 0);
    if (active.length) return active.slice(0, 12);
    return densityDays.slice(0, 10);
  }, [densityDays]);

  const forecastPoints = useMemo<ForecastPoint[]>(() => {
    if (!heatRows.length || !weekKeys.length) return [];
    const teamCapacity = heatRows.reduce((sum, row) => sum + Number(row.weeklyCapacity || 0), 0);
    return weekKeys.slice(0, Math.max(4, weeksPeriod)).map((weekKey) => {
      const allocated = heatRows.reduce((sum, row) => sum + Number(row.weekTotals?.[weekKey] || 0), 0);
      const utilization = teamCapacity > 0 ? Math.round((allocated / teamCapacity) * 100) : 0;
      return {
        weekKey,
        label: formatWeekLabel(weekKey),
        allocated: Number(allocated.toFixed(1)),
        capacity: Number(teamCapacity.toFixed(1)),
        utilization,
      };
    });
  }, [heatRows, weekKeys, weeksPeriod]);

  const teamIds = useMemo(() => new Set<number>((dashboardData?.team_overview || []).map((person) => person.id)), [dashboardData?.team_overview]);

  const personDeliverableStats = useMemo(() => {
    const stats = new Map<number, PersonDeliverableStat>();
    if (!dashboardData) return stats;

    const deliverableById = new Map<number, ScopedDeliverable>(
      scopedDeliverables.map((deliverable) => [deliverable.id, deliverable]),
    );

    const rangeStart = parseIsoDate(horizonRange.start);
    const within3End = new Date(rangeStart);
    within3End.setDate(within3End.getDate() + 2);

    rawDeliverableLinks.forEach((link) => {
      const raw = link as any;
      const personId = Number(raw.person ?? 0);
      const deliverableId = Number(raw.deliverable ?? 0);
      const isActive = raw.isActive ?? raw.is_active;

      if (!teamIds.has(personId)) return;
      if (!deliverableId || !Number.isFinite(deliverableId)) return;
      if (isActive === false) return;

      const deliverable = deliverableById.get(deliverableId);
      if (!deliverable) return;

      const current =
        stats.get(personId) ||
        {
          overlapCount: 0,
          within3Days: 0,
          totalDeliverables: 0,
          byDate: new Map<string, number>(),
          tokensByDate: new Map<string, string[]>(),
          deliverables: [],
        };

      current.totalDeliverables += 1;
      current.byDate.set(deliverable.date, (current.byDate.get(deliverable.date) || 0) + 1);

      const token = extractPhaseToken(deliverable.title);
      const tokens = current.tokensByDate.get(deliverable.date) || [];
      if (!tokens.includes(token) && tokens.length < 2) {
        current.tokensByDate.set(deliverable.date, [...tokens, token]);
      }

      if (!current.deliverables.some((item) => item.id === deliverable.id)) {
        current.deliverables.push(deliverable);
      }

      const dueDate = parseIsoDate(deliverable.date);
      if (dueDate >= rangeStart && dueDate <= within3End) {
        current.within3Days += 1;
      }

      stats.set(personId, current);
    });

    stats.forEach((value) => {
      value.overlapCount = Array.from(value.byDate.values()).reduce(
        (sum, count) => sum + Math.max(0, count - 1),
        0,
      );
    });

    return stats;
  }, [dashboardData, scopedDeliverables, rawDeliverableLinks, horizonRange.start, teamIds]);

  const projectLoadsByPerson = useMemo(() => {
    const map = new Map<number, PersonProjectLoad[]>();

    normalizedAssignments.forEach((assignment) => {
      const keys = metricWeekKeys.length
        ? metricWeekKeys
        : Object.keys(assignment.weeklyHours).sort().slice(0, Math.max(1, weeksPeriod));
      const hours = sumHoursForWeeks(assignment.weeklyHours, keys);
      if (hours <= 0) return;

      const current = map.get(assignment.personId) || [];
      const existing = current.find((item) => item.projectName === assignment.projectName);
      if (existing) {
        existing.hours += hours;
      } else {
        current.push({ projectName: assignment.projectName, hours });
      }
      map.set(assignment.personId, current);
    });

    map.forEach((value) => {
      value.sort((a, b) => b.hours - a.hours);
    });

    return map;
  }, [normalizedAssignments, metricWeekKeys, weeksPeriod]);

  const riskRows = useMemo<ManagerRiskRow[]>(() => {
    if (!dashboardData) return [];

    return dashboardData.team_overview.map((person) => {
      const utilization = Number(person.utilization_percent || 0);
      const allocated = Number(person.allocated_hours || 0);
      const capacity = Number(person.capacity || 0);

      const heatRow = heatRowByPerson.get(person.id);
      const periodHours = metricWeekKeys.length
        ? metricWeekKeys.reduce((sum, key) => sum + Number(heatRow?.weekTotals?.[key] || 0), 0)
        : allocated;
      const projectedAssigned = metricWeekKeys.length
        ? Number((periodHours / metricWeekKeys.length).toFixed(1))
        : allocated;

      let availabilityPct = 0;
      if (currentWeekKey && heatRow && capacity > 0) {
        const available = Number(
          heatRow.availableByWeek?.[currentWeekKey] ??
            Math.max(0, capacity - Number(heatRow.weekTotals?.[currentWeekKey] || 0)),
        );
        availabilityPct = Math.max(0, Math.round((available / capacity) * 100));
      } else if (capacity > 0) {
        availabilityPct = Math.max(0, Math.round(((capacity - allocated) / capacity) * 100));
      }

      const deliverableStat = personDeliverableStats.get(person.id);
      const overlapDeliverables = deliverableStat?.overlapCount || 0;
      const deliverablesWithin3Days = deliverableStat?.within3Days || 0;

      const overage = Math.max(0, Math.round(utilization - 100));
      const riskScore = overlapDeliverables * 3 + overage + deliverablesWithin3Days * 2;

      return {
        personId: person.id,
        name: person.name,
        role: person.role,
        utilization,
        allocated,
        capacity,
        projectedAssigned,
        availabilityPct,
        overlapDeliverables,
        deliverablesWithin3Days,
        overage,
        riskScore,
      };
    });
  }, [dashboardData, heatRowByPerson, metricWeekKeys, currentWeekKey, personDeliverableStats]);

  const rankedRiskRows = useMemo(() => {
    return [...riskRows].sort((a, b) => b.riskScore - a.riskScore || b.utilization - a.utilization);
  }, [riskRows]);

  const riskTableRows = useMemo(() => {
    const rows = [...riskRows];
    rows.sort((left, right) => {
      const dir = riskSort.direction === 'asc' ? 1 : -1;
      const key = riskSort.key;

      if (key === 'name') {
        return left.name.localeCompare(right.name) * dir;
      }

      return ((left as any)[key] - (right as any)[key]) * dir;
    });
    return rows;
  }, [riskRows, riskSort]);

  const toggleRiskSort = (key: RiskSortKey) => {
    setRiskSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'name' ? 'asc' : 'desc' };
    });
  };

  const projectRiskCardsAll = useMemo<ProjectRiskCard[]>(() => {
    if (!dashboardData) return [];

    const utilByPerson = new Map<number, number>(
      dashboardData.team_overview.map((person) => [person.id, Number(person.utilization_percent || 0)]),
    );

    const upcomingByProject = new Map<number, number>();
    scopedDeliverables.forEach((deliverable) => {
      if (deliverable.projectId == null) return;
      upcomingByProject.set(deliverable.projectId, (upcomingByProject.get(deliverable.projectId) || 0) + 1);
    });

    const projectMap = new Map<
      string,
      {
        projectId: number | null;
        projectName: string;
        assignedHours: number;
        roleCounts: Map<string, number>;
        people: Set<number>;
      }
    >();

    normalizedAssignments.forEach((assignment) => {
      const key = assignment.projectId != null ? `id:${assignment.projectId}` : `name:${assignment.projectName}`;
      const current =
        projectMap.get(key) ||
        {
          projectId: assignment.projectId,
          projectName: assignment.projectName,
          assignedHours: 0,
          roleCounts: new Map<string, number>(),
          people: new Set<number>(),
        };

      const keys = metricWeekKeys.length
        ? metricWeekKeys
        : Object.keys(assignment.weeklyHours).sort().slice(0, Math.max(1, weeksPeriod));
      current.assignedHours += sumHoursForWeeks(assignment.weeklyHours, keys);
      current.roleCounts.set(assignment.roleName, (current.roleCounts.get(assignment.roleName) || 0) + 1);
      current.people.add(assignment.personId);
      projectMap.set(key, current);
    });

    return Array.from(projectMap.values())
      .map((project) => {
        const utilizationValues = Array.from(project.people)
          .map((personId) => utilByPerson.get(personId))
          .filter((value): value is number => typeof value === 'number');

        const avgUtilization = utilizationValues.length
          ? Math.round(utilizationValues.reduce((sum, value) => sum + value, 0) / utilizationValues.length)
          : 0;

        const roleTotals = Array.from(project.roleCounts.values()).reduce((sum, count) => sum + count, 0);
        const dominantRole = Array.from(project.roleCounts.values()).reduce(
          (maxCount, count) => Math.max(maxCount, count),
          0,
        );
        const roleImbalance = roleTotals > 0 ? Math.round((dominantRole / roleTotals) * 100) : 0;

        const upcomingDeliverables =
          project.projectId != null ? upcomingByProject.get(project.projectId) || 0 : 0;

        return {
          projectId: project.projectId,
          project: project.projectName,
          avgUtilization,
          upcomingDeliverables,
          roleImbalance,
          assignedHours: Number(project.assignedHours.toFixed(1)),
        };
      })
      .sort((a, b) => {
        const scoreA = a.avgUtilization + a.upcomingDeliverables * 8 + a.roleImbalance * 0.35;
        const scoreB = b.avgUtilization + b.upcomingDeliverables * 8 + b.roleImbalance * 0.35;
        return scoreB - scoreA;
      });
  }, [dashboardData, normalizedAssignments, metricWeekKeys, weeksPeriod, scopedDeliverables]);

  const projectRiskCards = useMemo(() => projectRiskCardsAll.slice(0, 4), [projectRiskCardsAll]);

  const avg2WeekUtilization = useMemo(() => {
    const firstTwo = forecastPoints.slice(0, 2);
    if (firstTwo.length) {
      return Math.round(firstTwo.reduce((sum, item) => sum + item.utilization, 0) / firstTwo.length);
    }
    return dashboardData?.summary.avg_utilization || 0;
  }, [forecastPoints, dashboardData?.summary.avg_utilization]);

  const overlapsMetric = useMemo(
    () => rankedRiskRows.reduce((sum, row) => sum + row.overlapDeliverables, 0),
    [rankedRiskRows],
  );

  const atRiskProjectsMetric = useMemo(
    () =>
      projectRiskCardsAll.filter(
        (project) => project.avgUtilization > 95 || project.upcomingDeliverables >= 3 || project.roleImbalance >= 70,
      ).length,
    [projectRiskCardsAll],
  );

  const slackPool = useMemo(
    () => [...rankedRiskRows].filter((row) => row.availabilityPct > 30).sort((a, b) => b.availabilityPct - a.availabilityPct),
    [rankedRiskRows],
  );

  const availableStaffMetric = useMemo(() => slackPool.length, [slackPool]);

  const roleImbalanceRows = useMemo(() => {
    if (!dashboardData) return [] as Array<{ role: string; avgUtilization: number; count: number }>;

    const map = new Map<string, { role: string; count: number; utilTotal: number }>();
    dashboardData.team_overview.forEach((person) => {
      const role = person.role || 'Unspecified role';
      const current = map.get(role) || { role, count: 0, utilTotal: 0 };
      current.count += 1;
      current.utilTotal += Number(person.utilization_percent || 0);
      map.set(role, current);
    });

    return Array.from(map.values())
      .map((item) => ({
        role: item.role,
        count: item.count,
        avgUtilization: Math.round(item.utilTotal / Math.max(1, item.count)),
      }))
      .sort((a, b) => b.avgUtilization - a.avgUtilization)
      .slice(0, 4);
  }, [dashboardData]);

  const roleSpread = useMemo(() => {
    if (roleImbalanceRows.length <= 1) return 0;
    return roleImbalanceRows[0].avgUtilization - roleImbalanceRows[roleImbalanceRows.length - 1].avgUtilization;
  }, [roleImbalanceRows]);

  const reallocationSuggestions = useMemo<ReallocationSuggestion[]>(() => {
    const overloaded = rankedRiskRows.filter((row) => row.utilization > 100);
    if (!overloaded.length || !slackPool.length) return [];

    const usedTargets = new Set<number>();
    const suggestions: ReallocationSuggestion[] = [];

    overloaded.forEach((source) => {
      const roleMatch = slackPool.find(
        (candidate) =>
          candidate.personId !== source.personId &&
          candidate.role === source.role &&
          !usedTargets.has(candidate.personId),
      );

      const fallbackMatch = slackPool.find(
        (candidate) => candidate.personId !== source.personId && !usedTargets.has(candidate.personId),
      );

      const target = roleMatch || fallbackMatch;
      if (!target) return;

      const sourceProject = projectLoadsByPerson.get(source.personId)?.[0]?.projectName || 'active assignment';
      const impact = Math.max(0, Math.min(source.overage, target.availabilityPct));
      if (impact <= 0) return;

      usedTargets.add(target.personId);
      suggestions.push({
        id: `${source.personId}-${target.personId}`,
        sourceId: source.personId,
        targetId: target.personId,
        text: `Move ${sourceProject} from ${source.name} to ${target.name} to reduce overload by ${impact}%.`,
        impact,
      });
    });

    return suggestions;
  }, [rankedRiskRows, slackPool, projectLoadsByPerson]);

  React.useEffect(() => {
    if (!rankedRiskRows.length) {
      setSelectedPersonId(null);
      return;
    }
    const exists = selectedPersonId != null && rankedRiskRows.some((row) => row.personId === selectedPersonId);
    if (!exists) {
      setSelectedPersonId(rankedRiskRows[0].personId);
    }
  }, [rankedRiskRows, selectedPersonId]);

  const selectedRiskPerson = useMemo(
    () => rankedRiskRows.find((row) => row.personId === selectedPersonId) || null,
    [rankedRiskRows, selectedPersonId],
  );

  useAuthenticatedEffect(() => {
    if (!selectedRiskPerson) {
      setSelectedPersonUtilization(null);
      setSelectedPersonError(null);
      setSelectedPersonLoading(false);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        setSelectedPersonLoading(true);
        setSelectedPersonError(null);
        const response = await peopleApi.getPersonUtilization(selectedRiskPerson.personId);
        if (!mounted) return;
        setSelectedPersonUtilization(response);
      } catch (err: any) {
        if (!mounted) return;
        setSelectedPersonUtilization(null);
        setSelectedPersonError(err?.message || 'Failed to load person utilization');
      } finally {
        if (mounted) setSelectedPersonLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedRiskPerson?.personId]);

  const selectedPersonProjects = useMemo(() => {
    if (selectedPersonUtilization?.utilization.assignments?.length) {
      return selectedPersonUtilization.utilization.assignments.map((item) => ({
        projectName: item.project_name,
        hours: Number(item.weekly_hours || 0),
      }));
    }

    if (!selectedRiskPerson) return [] as PersonProjectLoad[];
    return projectLoadsByPerson.get(selectedRiskPerson.personId) || [];
  }, [selectedPersonUtilization?.utilization.assignments, selectedRiskPerson, projectLoadsByPerson]);

  const selectedPersonDeliverables = useMemo(() => {
    if (!selectedRiskPerson) return [] as ScopedDeliverable[];
    const list = personDeliverableStats.get(selectedRiskPerson.personId)?.deliverables || [];
    return [...list].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);
  }, [selectedRiskPerson, personDeliverableStats]);

  const selectedPersonDailyUtilization = useMemo(() => {
    if (!selectedRiskPerson) return [] as Array<{ day: string; date: string; value: number; deliverables: number }>;

    const rangeStart = parseIsoDate(horizonRange.start);
    const byDate = personDeliverableStats.get(selectedRiskPerson.personId)?.byDate || new Map<string, number>();

    const heatRow = heatRowByPerson.get(selectedRiskPerson.personId);
    const currentWeekHours = currentWeekKey ? Number(heatRow?.weekTotals?.[currentWeekKey] || 0) : selectedRiskPerson.allocated;
    const capacity = Number(selectedRiskPerson.capacity || 0);
    const baseUtil = capacity > 0 ? (currentWeekHours / capacity) * 100 : Number(selectedRiskPerson.utilization || 0);

    const dayRows = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(rangeStart);
      date.setDate(rangeStart.getDate() + index);
      const key = toLocalIsoDate(date);
      const deliverables = byDate.get(key) || 0;
      return {
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        date: key,
        deliverables,
      };
    });

    const totalDeliverables = dayRows.reduce((sum, row) => sum + row.deliverables, 0);

    return dayRows.map((row) => {
      const weight = totalDeliverables > 0 ? (row.deliverables + 1) / (totalDeliverables + dayRows.length) : 1 / dayRows.length;
      const scaled = totalDeliverables > 0 ? baseUtil * weight * dayRows.length : baseUtil;
      return {
        ...row,
        value: Math.round(clamp(scaled, 0, 200)),
      };
    });
  }, [selectedRiskPerson, horizonRange.start, personDeliverableStats, heatRowByPerson, currentWeekKey]);

  const selectedSlackWindows = useMemo(
    () => selectedPersonDailyUtilization.filter((entry) => entry.value < 70),
    [selectedPersonDailyUtilization],
  );

  const selectedReassignmentSuggestion = useMemo(() => {
    if (!selectedRiskPerson) return null;
    return reallocationSuggestions.find((item) => item.sourceId === selectedRiskPerson.personId)?.text || null;
  }, [selectedRiskPerson, reallocationSuggestions]);

  const collisionDates = useMemo(() => {
    const dense = densityDays.filter((day) => day.count > 0).slice(0, 5);
    return dense.length ? dense : densityDays.slice(0, 5);
  }, [densityDays]);

  const collisionMatrix = useMemo(() => {
    return rankedRiskRows.slice(0, 6).map((person) => {
      const stats = personDeliverableStats.get(person.personId);
      const cells = collisionDates.map((day) => {
        const tokens = stats?.tokensByDate.get(day.date) || [];
        return {
          token: tokens.join('/'),
          tone: day.tone,
        };
      });

      return {
        personId: person.personId,
        name: person.name,
        cells,
      };
    });
  }, [rankedRiskRows, personDeliverableStats, collisionDates]);

  const busy =
    loading ||
    datasetLoading ||
    heatmapQuery.isLoading ||
    heatmapQuery.isFetching ||
    deliverablesQuery.isLoading;

  const clientWeeks = weeksPeriod >= 8 ? 8 : 4;

  if (loading && !dashboardData) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-slate-400">Loading manager dashboard...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_15%_-15%,rgba(72,92,150,0.26)_0%,rgba(16,19,30,0.96)_48%,rgba(8,10,16,0.99)_100%)] p-4 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-blue-500/12 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-10 h-60 w-60 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative space-y-6">
          <div className={`${shellCardClass} relative overflow-hidden p-5 md:p-6`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />
            <div className="relative">
              <div className="text-center">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-5xl">
                  Manager-Specific Dashboard Options
                </h1>
                <p className="mx-auto mt-3 max-w-4xl text-sm text-slate-300 md:text-xl">
                  Different manager layouts built from live department assignments, deliverables, capacity, and utilization.
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className={`${insetCardClass} space-y-1.5 p-3`}>
                  <label className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Department</label>
                  <select
                    value={selectedDepartment}
                    onChange={(event) => setSelectedDepartment(event.target.value)}
                    className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-blue-400"
                  >
                    <option value="">Select Department</option>
                    {rootDepartments.map((department) => {
                      const summary = getDepartmentManagerSummary(department);
                      return (
                        <option key={department.id} value={department.id}>
                          {department.name} {summary !== 'None' ? `(${summary})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className={`${insetCardClass} space-y-1.5 p-3`}>
                  <label className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Sub-department</label>
                  <select
                    value={selectedSubDepartment}
                    onChange={(event) => setSelectedSubDepartment(event.target.value)}
                    disabled={!selectedDepartmentId}
                    className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="all">All in {selectedDepartmentInfo?.name || 'Department'}</option>
                    {subDepartments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`${insetCardClass} space-y-1.5 p-3`}>
                  <label className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Time Horizon</label>
                  <div className="inline-flex w-full rounded-md border border-white/10 bg-black/35 p-1 shadow-inner shadow-black/40">
                    {[2, 4, 8].map((weeks) => (
                      <button
                        key={weeks}
                        type="button"
                        onClick={() => setWeeksPeriod(weeks)}
                        className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-all ${
                          weeksPeriod === weeks
                            ? 'bg-gradient-to-r from-blue-500 to-sky-400 text-white shadow-[0_4px_18px_rgba(59,130,246,0.35)]'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {weeks}W
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`${insetCardClass} space-y-1.5 p-3`}>
                  <label className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Layout</label>
                  <div className="inline-flex w-full rounded-md border border-white/10 bg-black/35 p-1 shadow-inner shadow-black/40">
                    {(Object.keys(layoutLabels) as LayoutOption[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setLayoutOption(option)}
                        className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold transition-all ${
                          layoutOption === option
                            ? 'bg-gradient-to-r from-blue-500 to-sky-400 text-white shadow-[0_4px_18px_rgba(59,130,246,0.35)]'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                        aria-pressed={layoutOption === option}
                      >
                        {option === 'risk' ? '1' : option === 'people' ? '2' : '3'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-blue-500/40 bg-blue-500/12 px-4 py-2.5 text-sm font-medium text-blue-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              {layoutLabels[layoutOption]} • {selectedDepartmentInfo?.name || 'No Department Selected'} •{' '}
              {scopeDepartmentInfo?.name || 'No Scope'}
              {busy ? ' • Refreshing live data…' : ''}
            </div>
          </div>

          {error ? (
            <Card className="rounded-xl border border-red-500/45 bg-red-500/12 p-4 text-red-200">{error}</Card>
          ) : null}

          {dataWarning ? (
            <Card className="rounded-xl border border-amber-500/45 bg-amber-500/12 p-4 text-amber-200">{dataWarning}</Card>
          ) : null}

          {!selectedDepartment ? (
            <Card className={`${sectionCardClass} p-10 text-center`}>
              <h3 className="text-xl font-semibold text-slate-100">Select a department to load manager analytics</h3>
              <p className="mt-2 text-sm text-slate-300">
                Layouts render from live assignment, deliverable, and capacity data.
              </p>
            </Card>
          ) : null}

        {selectedDepartment && dashboardData ? (
          <>
            {layoutOption === 'risk' ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricTile
                    label="Avg 2W Util"
                    value={`${avg2WeekUtilization}%`}
                    subtext={scopeDepartmentInfo?.name || 'Scope'}
                    tone={avg2WeekUtilization > 100 ? 'danger' : avg2WeekUtilization > 90 ? 'warning' : 'info'}
                  />
                  <MetricTile
                    label="Overlaps"
                    value={overlapsMetric}
                    subtext="Linked deliverable collisions"
                    tone={overlapsMetric > 8 ? 'danger' : overlapsMetric > 4 ? 'warning' : 'info'}
                  />
                  <MetricTile
                    label="At-Risk Projects"
                    value={atRiskProjectsMetric}
                    subtext="Util + deliverables + role skew"
                    tone={atRiskProjectsMetric > 2 ? 'warning' : 'info'}
                  />
                  <MetricTile
                    label="Available Staff"
                    value={availableStaffMetric}
                    subtext=">30% capacity available"
                    tone={availableStaffMetric <= 1 ? 'warning' : 'info'}
                  />
                </div>

                <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                  <Card className={`xl:col-span-8 ${sectionCardClass} p-4`}>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-base font-semibold text-slate-100">Overlapping Deliverables Panel</h3>
                      <span className="text-xs text-slate-400">Sortable by risk/utilization/overlaps</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                            <th className="pb-2">
                              <button type="button" onClick={() => toggleRiskSort('name')} className="hover:text-slate-100">
                                Person
                              </button>
                            </th>
                            <th className="pb-2">Role</th>
                            <th className="pb-2">
                              <button type="button" onClick={() => toggleRiskSort('utilization')} className="hover:text-slate-100">
                                Util
                              </button>
                            </th>
                            <th className="pb-2">
                              <button type="button" onClick={() => toggleRiskSort('overlapDeliverables')} className="hover:text-slate-100">
                                Overlap
                              </button>
                            </th>
                            <th className="pb-2">
                              <button type="button" onClick={() => toggleRiskSort('deliverablesWithin3Days')} className="hover:text-slate-100">
                                3-Day
                              </button>
                            </th>
                            <th className="pb-2">
                              <button type="button" onClick={() => toggleRiskSort('riskScore')} className="hover:text-slate-100">
                                Risk Score
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {riskTableRows.slice(0, 12).map((row) => {
                            const riskClass =
                              riskBadgeClasses.find((item) => row.riskScore >= item.min)?.className ||
                              riskBadgeClasses[2].className;
                            return (
                              <tr key={`risk-row-${row.personId}`} className="border-t border-white/10">
                                <td className="py-2 font-medium text-slate-100">{row.name}</td>
                                <td className="py-2 text-slate-400">{row.role}</td>
                                <td className="py-2">
                                  <UtilizationBadge percentage={row.utilization} />
                                </td>
                                <td className="py-2 text-slate-100">{row.overlapDeliverables}</td>
                                <td className="py-2 text-slate-100">{row.deliverablesWithin3Days}</td>
                                <td className="py-2">
                                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${riskClass}`}>
                                    {row.riskScore}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card className={`xl:col-span-4 ${sectionCardClass} p-4`}>
                    <div className="mb-3">
                      <h3 className="text-base font-semibold text-slate-100">Deliverable Density Heatmap</h3>
                      <p className="text-xs text-slate-400">Due-date density in selected scope.</p>
                    </div>
                    <div className="space-y-2">
                      {densityDisplayDays.map((day) => (
                        <div
                          key={`density-${day.date}`}
                          className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 ${insetCardClass} px-3 py-2`}
                        >
                          <div className="text-xs text-slate-400">{day.label}</div>
                          <div className="h-2 rounded-full bg-black/40">
                            <div
                              className={`h-2 rounded-full ${
                                day.tone === 'high'
                                  ? 'bg-red-400'
                                  : day.tone === 'medium'
                                    ? 'bg-amber-400'
                                    : 'bg-blue-400'
                              }`}
                              style={{ width: `${clamp(day.count * 10, 4, 100)}%` }}
                            />
                          </div>
                          <span className={`rounded-md border px-2 py-0.5 text-xs ${toneClasses[day.tone]}`}>
                            {day.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                <Card className={`${sectionCardClass} p-4`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-100">2 Week Capacity by Person</h3>
                    <span className="text-xs text-slate-400">Assigned / Buffer / Overallocated</span>
                  </div>
                  <div className="space-y-3">
                    {rankedRiskRows.slice(0, 10).map((row) => {
                      const assignedInCapacity = Math.min(row.projectedAssigned, row.capacity);
                      const buffer = Math.max(0, row.capacity - row.projectedAssigned);
                      const over = Math.max(0, row.projectedAssigned - row.capacity);
                      const total = Math.max(1, row.capacity + over);

                      const assignedPct = (assignedInCapacity / total) * 100;
                      const bufferPct = (buffer / total) * 100;
                      const overPct = (over / total) * 100;

                      return (
                        <div key={`capacity-${row.personId}`} className={`${insetCardClass} space-y-1 p-2.5`}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-100">{row.name}</span>
                            <span className="text-slate-400">
                              {row.projectedAssigned.toFixed(1)}h / {row.capacity}h
                            </span>
                          </div>
                          <div className="flex h-3 overflow-hidden rounded-full border border-white/10 bg-black/30">
                            <div className="bg-blue-400" style={{ width: `${assignedPct}%` }} />
                            <div className="bg-emerald-400" style={{ width: `${bufferPct}%` }} />
                            <div className="bg-red-400" style={{ width: `${overPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {projectRiskCards.map((projectCard) => (
                    <Card key={`project-risk-${projectCard.projectId ?? projectCard.project}`} className={`${sectionCardClass} p-4`}>
                      <div className="text-sm font-semibold text-slate-100">{projectCard.project}</div>
                      <div className="mt-2 text-xs text-slate-400">Utilization vs Capacity</div>
                      <div className="text-lg font-semibold text-slate-100">{projectCard.avgUtilization}%</div>
                      <div className="mt-2 text-xs text-slate-400">Upcoming Deliverables</div>
                      <div className="text-sm font-medium text-slate-100">{projectCard.upcomingDeliverables}</div>
                      <div className="mt-2 text-xs text-slate-400">Role Imbalance</div>
                      <div className="text-sm font-medium text-slate-100">{projectCard.roleImbalance}% concentrated</div>
                    </Card>
                  ))}

                  {projectRiskCards.length === 0 ? (
                    <Card className={`md:col-span-2 xl:col-span-4 ${sectionCardClass} p-6 text-sm text-slate-400`}>
                      No project risk data available for this scope.
                    </Card>
                  ) : null}
                </div>
              </div>
            ) : null}

            {layoutOption === 'people' ? (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <Card className={`xl:col-span-3 ${sectionCardClass} p-4`}>
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-slate-100">Team Members Ranked by Risk</h3>
                    <p className="text-xs text-slate-400">Person-first triage order.</p>
                  </div>
                  <div className="space-y-2">
                    {rankedRiskRows.slice(0, 12).map((row) => {
                      const tone = getRiskCellTone(row);
                      const toneClass = riskCellToneClasses[tone];
                      return (
                        <button
                          key={`person-rank-${row.personId}`}
                          type="button"
                          onClick={() => setSelectedPersonId(row.personId)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                            selectedPersonId === row.personId ? toneClass.selected : toneClass.base
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-100">{row.name}</span>
                            <span className="text-xs text-slate-200">{row.utilization}%</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-300">
                            {row.overlapDeliverables} overlaps • Risk {row.riskScore}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Card>

                <Card className={`xl:col-span-5 ${sectionCardClass} p-4`}>
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-slate-100">Individual Drill Panel</h3>
                    <p className="text-xs text-slate-400">
                      Assigned projects, deliverable timeline, utilization by day, and reassignment signal.
                    </p>
                  </div>

                  {!selectedRiskPerson ? (
                    <div className="text-sm text-slate-400">Select a person to inspect details.</div>
                  ) : (
                    <div className="space-y-4">
                      <div className={`${insetCardClass} p-3`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-100">{selectedRiskPerson.name}</div>
                            <div className="text-xs text-slate-400">{selectedRiskPerson.role}</div>
                          </div>
                          <UtilizationBadge percentage={selectedRiskPerson.utilization} />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className={`${insetCardClass} p-3`}>
                          <div className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Assigned Projects</div>
                          {selectedPersonLoading ? (
                            <div className="text-xs text-slate-400">Loading person utilization...</div>
                          ) : selectedPersonError ? (
                            <div className="text-xs text-red-300">{selectedPersonError}</div>
                          ) : selectedPersonProjects.length > 0 ? (
                            <div className="space-y-2">
                              {selectedPersonProjects.slice(0, 6).map((item) => (
                                <div key={`${item.projectName}-${item.hours}`} className="flex items-center justify-between text-xs">
                                  <span className="max-w-[12rem] truncate text-slate-100">{item.projectName}</span>
                                  <span className="text-slate-400">{Math.round(item.hours)}h</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400">No assignments found for this person.</div>
                          )}
                        </div>

                        <div className={`${insetCardClass} p-3`}>
                          <div className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Deliverable Timeline</div>
                          {selectedPersonDeliverables.length > 0 ? (
                            <div className="space-y-2">
                              {selectedPersonDeliverables.slice(0, 5).map((deliverable) => (
                                <div key={`person-deliverable-${deliverable.id}`} className="flex items-center justify-between text-xs">
                                  <span className="max-w-[12rem] truncate text-slate-100">{deliverable.projectName}</span>
                                  <span className="text-slate-400">{formatShortDate(deliverable.date)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400">No linked deliverables in current horizon.</div>
                          )}
                        </div>
                      </div>

                      <div className={`${insetCardClass} p-3`}>
                        <div className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Utilization by Day</div>
                        <div className="grid grid-cols-7 gap-2">
                          {selectedPersonDailyUtilization.map((entry) => (
                            <div key={`day-${entry.date}`} className="text-center">
                              <div className="text-[10px] text-slate-400">{entry.day}</div>
                              <div className="mt-1 h-16 rounded bg-black/35 p-1">
                                <div
                                  className={`mx-auto mt-auto w-full rounded ${
                                    entry.value > 100
                                      ? 'bg-red-400'
                                      : entry.value > 85
                                        ? 'bg-amber-400'
                                        : 'bg-blue-400'
                                  }`}
                                  style={{ height: `${clamp(entry.value, 8, 120) * 0.45}%` }}
                                />
                              </div>
                              <div className="mt-1 text-[10px] text-slate-200">{entry.value}%</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className={`${insetCardClass} p-3`}>
                          <div className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Slack Window Opportunities</div>
                          {selectedSlackWindows.length > 0 ? (
                            <div className="text-xs text-slate-100">
                              {selectedSlackWindows.map((item) => `${item.day} (${item.value}%)`).join(', ')}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400">No low-utilization windows in next 7 days.</div>
                          )}
                        </div>
                        <div className={`${insetCardClass} p-3`}>
                          <div className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">Reassignment Suggestion</div>
                          <div className="text-xs text-slate-100">
                            {selectedReassignmentSuggestion || 'No source-target reassignment pair for this person.'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>

                <Card className={`xl:col-span-4 ${sectionCardClass} p-4`}>
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-slate-100">Reallocation Suggestions</h3>
                    <p className="text-xs text-slate-400">Generated from over-utilized staff and available pool.</p>
                  </div>
                  {reallocationSuggestions.length > 0 ? (
                    <div className="space-y-2">
                      {reallocationSuggestions.map((item) => (
                        <div
                          key={`reallocation-${item.id}`}
                          className="rounded-lg border border-emerald-500/35 bg-emerald-500/12 p-3 text-sm text-emerald-100"
                        >
                          {item.text}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`${insetCardClass} p-3 text-sm text-slate-400`}>
                      No immediate reassignment recommendations for this scope.
                    </div>
                  )}
                </Card>
              </div>
            ) : null}

            {layoutOption === 'predictive' ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                  <Card className={`xl:col-span-7 ${sectionCardClass} p-4`}>
                    <div className="mb-3">
                      <h3 className="text-base font-semibold text-slate-100">4-Week Trend Projection</h3>
                      <p className="text-xs text-slate-400">Team utilization from live capacity and assigned hours.</p>
                    </div>
                    <TrendProjectionChart points={forecastPoints.slice(0, 4)} />
                  </Card>

                  <Card className={`xl:col-span-5 ${sectionCardClass} p-4`}>
                    <div className="mb-3">
                      <h3 className="text-base font-semibold text-slate-100">Storm Window Signal</h3>
                      <p className="text-xs text-slate-400">High deliverable-density dates inside selected horizon.</p>
                    </div>
                    <div className="space-y-2">
                      {densityDisplayDays.slice(0, 5).map((day) => (
                        <div key={`storm-${day.date}`} className={`flex items-center justify-between ${insetCardClass} px-3 py-2`}>
                          <div className="text-sm text-slate-100">{day.label}</div>
                          <span className={`rounded border px-2 py-0.5 text-xs ${toneClasses[day.tone]}`}>
                            {day.count} deliverables
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                <Card className={`${sectionCardClass} p-4`}>
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-slate-100">Deliverable Collision Matrix</h3>
                    <p className="text-xs text-slate-400">Phase clusters by person and high-pressure dates.</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-slate-400">
                          <th className="pb-2">Person</th>
                          {collisionDates.map((day) => (
                            <th key={`collision-${day.date}`} className="pb-2 text-center">
                              {day.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {collisionMatrix.map((row) => (
                          <tr key={`collision-row-${row.personId}`} className="border-t border-white/10">
                            <td className="py-2 font-medium text-slate-100">{row.name}</td>
                            {row.cells.map((cell, index) => (
                              <td key={`collision-cell-${row.personId}-${index}`} className="py-2 text-center">
                                <span
                                  className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-md border px-2 py-1 text-xs ${
                                    cell.token
                                      ? cell.tone === 'high'
                                        ? 'border-red-500/40 bg-red-500/20 text-red-100'
                                        : cell.tone === 'medium'
                                          ? 'border-amber-500/40 bg-amber-500/20 text-amber-100'
                                          : 'border-blue-500/40 bg-blue-500/20 text-blue-100'
                                      : 'border-white/10 bg-black/25 text-slate-400'
                                  }`}
                                >
                                  {cell.token || '—'}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            ) : null}

            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-100">Recommended Additions</h2>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <Card className={`xl:col-span-3 ${sectionCardClass} p-4`}>
                  <div className="mb-2 text-sm font-semibold text-slate-100">Slack Capacity Radar</div>
                  <p className="mb-3 text-xs text-slate-400">Who has more than 30% current-week availability.</p>
                  <div className="space-y-2">
                    {slackPool.slice(0, 5).map((person) => (
                      <div key={`slack-${person.personId}`} className={`flex items-center justify-between ${insetCardClass} px-3 py-2`}>
                        <span className="text-sm text-slate-100">{person.name}</span>
                        <span className="text-xs text-emerald-200">{person.availabilityPct}% available</span>
                      </div>
                    ))}
                    {slackPool.length === 0 ? (
                      <div className="text-xs text-slate-400">No staff currently above 30% availability.</div>
                    ) : null}
                  </div>
                </Card>

                <Card className={`xl:col-span-3 ${sectionCardClass} p-4`}>
                  <div className="mb-2 text-sm font-semibold text-slate-100">Role Imbalance Alert</div>
                  <p className="mb-3 text-xs text-slate-400">Role-level allocation imbalance in selected scope.</p>
                  <div className="space-y-2">
                    {roleImbalanceRows.map((role) => (
                      <div key={`role-${role.role}`} className={`flex items-center justify-between ${insetCardClass} px-3 py-2`}>
                        <span className="text-sm text-slate-100">{role.role}</span>
                        <span className="text-xs text-slate-400">{role.avgUtilization}%</span>
                      </div>
                    ))}
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                      Utilization spread: {roleSpread}% between top and bottom listed roles.
                    </div>
                  </div>
                </Card>

                <Card className={`xl:col-span-3 ${sectionCardClass} p-4`}>
                  <div className="mb-2 text-sm font-semibold text-slate-100">Risk Scoring Formula</div>
                  <p className="mb-3 text-xs text-slate-400">
                    Risk Score = (Overlapping Deliverables × 3) + (% Over 100) + (Deliverables within 3 days × 2)
                  </p>
                  <div className="space-y-2">
                    {rankedRiskRows.slice(0, 5).map((row) => (
                      <div key={`risk-formula-${row.personId}`} className={`${insetCardClass} px-3 py-2`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-100">{row.name}</span>
                          <span className="text-slate-400">{row.riskScore}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <div className="xl:col-span-3">
                  <AssignedHoursByClientCard
                    className={`h-full ${sectionCardClass}`}
                    initialWeeks={clientWeeks}
                    useGlobalDepartmentFilter={false}
                    departmentIdOverride={scopeDepartmentId}
                    includeChildrenOverride={false}
                    responsive
                  />
                </div>
              </div>
            </div>
          </>
        ) : null}
        </div>
      </div>
    </Layout>
  );
};

export default ManagerDashboard;
