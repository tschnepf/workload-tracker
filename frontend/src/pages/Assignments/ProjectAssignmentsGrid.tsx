import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import Layout from '@/components/layout/Layout';
import GlobalDepartmentFilter from '@/components/filters/GlobalDepartmentFilter';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { getProjectGridSnapshot, getProjectTotals } from '@/services/projectAssignmentsApi';
import { toWeekHeader, WeekHeader } from '@/pages/Assignments/grid/utils';
import { useCellSelection } from '@/pages/Assignments/grid/useCellSelection';
import { useGridUrlState } from '@/pages/Assignments/grid/useGridUrlState';
import type { Project, Assignment, Person } from '@/types/models';
import { showToast } from '@/lib/toastBus';
import { useAbortManager } from '@/utils/useAbortManager';
import { assignmentsApi, peopleApi, projectsApi } from '@/services/api';
import { formatDateWithWeekday } from '@/utils/dates';
import StatusBadge from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
import { useProjectStatusSubscription } from '@/components/projects/useProjectStatusSubscription';
import { useCapabilities } from '@/hooks/useCapabilities';
import { subscribeGridRefresh } from '@/lib/gridRefreshBus';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { defaultUtilizationScheme, getUtilizationPill } from '@/util/utilization';
import RoleDropdown from '@/roles/components/RoleDropdown';
import { listProjectRoles, type ProjectRole } from '@/roles/api';
import { sortAssignmentsByProjectRole } from '@/roles/utils/sortByProjectRole';
import { getFlag } from '@/lib/flags';
import { useLayoutDensity } from '@/components/layout/useLayoutDensity';
import WeeksSelector from '@/components/compact/WeeksSelector';
import StatusFilterChips from '@/components/compact/StatusFilterChips';
import HeaderActions from '@/components/compact/HeaderActions';
import { buildAssignmentsLink } from '@/pages/Assignments/grid/linkUtils';
import TopBarPortal from '@/components/layout/TopBarPortal';
import { useProjectQuickViewPopover } from '@/components/projects/quickview';
import { useQueryClient } from '@tanstack/react-query';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  buildFutureDeliverableLookupFromSet,
  projectMatchesActiveWithDates,
  projectMatchesActiveWithoutDates,
} from '@/components/projects/statusFilterUtils';
import { WeekCell } from '@/pages/Assignments/grid/WeekCell';

type ProjectWithAssignments = Project & { assignments: Assignment[]; isExpanded: boolean };
export type DeliverableMarker = {
  type: string;
  percentage?: number;
  dates?: string[];
  description?: string | null;
  note?: string | null;
};

type AssignmentUpdateInfo = {
  prev: Record<string, number>;
  next: Record<string, number>;
  weeks: Set<string>;
  personId: number | null;
  projectId: number;
};

// Local helper component: use the quick view hook inside a descendant of Layout's provider
const ProjectNameQuickViewButton: React.FC<{ projectId: number; children: React.ReactNode }> = ({ projectId, children }) => {
  const { open } = useProjectQuickViewPopover();
  const queryClient = useQueryClient();
  const prefetchTimerRef = React.useRef<number | null>(null);
  return (
    <button
      type="button"
      className="truncate cursor-pointer hover:underline"
      onClick={(e) => { e.stopPropagation(); open(projectId, e.currentTarget as HTMLElement, { placement: 'center' }); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); open(projectId, e.currentTarget as HTMLElement, { placement: 'center' }); } }}
      onMouseEnter={() => {
        if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = window.setTimeout(() => {
          queryClient.ensureQueryData({ queryKey: ['projects', projectId], queryFn: () => projectsApi.get(projectId) });
        }, 150);
      }}
      onMouseLeave={() => { if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current); }}
      onFocus={() => {
        if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = window.setTimeout(() => {
          queryClient.ensureQueryData({ queryKey: ['projects', projectId], queryFn: () => projectsApi.get(projectId) });
        }, 150);
      }}
      onBlur={() => { if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current); }}
    >
      {children}
    </button>
  );
};

// Project Assignments Grid (scaffold)
// Prescriptive: lean, best-practice; no client-side week calculations.
// Week header placeholder only; wired to server weekKeys in Step 4.

const ProjectAssignmentsGrid: React.FC = () => {
  const { state: deptState } = useDepartmentFilter();
  const [weeks, setWeeks] = useState<WeekHeader[]>([]);
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');
  // Manual sorting state
  const [sortBy, setSortBy] = useState<'client' | 'project' | 'deliverable'>('client');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Projects state must be defined before any hook closures that read it
  type ProjectWithAssignments = Project & { assignments: Assignment[]; isExpanded: boolean };
  const [projects, setProjects] = useState<ProjectWithAssignments[]>([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileStatusProjectId, setMobileStatusProjectId] = useState<number | null>(null);
  const mobileStatusProject = useMemo(
    () => (mobileStatusProjectId ? projects.find(p => p.id === mobileStatusProjectId) ?? null : null),
    [projects, mobileStatusProjectId]
  );
  const [mobileRoleState, setMobileRoleState] = useState<{
    projectId: number;
    assignmentId: number | null;
    deptId: number | null;
    currentId: number | null;
    label: string | null;
  } | null>(null);
  const [mobileDeliverableDetail, setMobileDeliverableDetail] = useState<{
    projectName: string;
    client?: string;
    weekLabel: string;
    entries: DeliverableMarker[];
  } | null>(null);
  // Lookup map to avoid rescanning all projects/assignments during apply
  const assignmentById = React.useMemo(() => {
    const map = new Map<number, { projectId: number; assignment: Assignment; personId: number | null }>();
    for (const p of projects) {
      if (!p?.assignments?.length || !p.id) continue;
      for (const a of p.assignments) {
        if (!a?.id) continue;
        map.set(a.id, {
          projectId: p.id,
          assignment: a,
          personId: (a.person as any) ?? null,
        });
      }
    }
    return map;
  }, [projects]);
  // Build row order for rectangular selection (assignment IDs in render order)
  const rowOrder = React.useMemo(() => {
    const arr: string[] = [];
    for (const p of projects) {
      if (!p.isExpanded) continue;
      for (const a of p.assignments || []) {
        if (a?.id != null) arr.push(String(a.id));
      }
    }
    return arr;
  }, [projects]);
  const rowIndexByKey = React.useMemo(() => {
    const map = new Map<string, number>();
    rowOrder.forEach((rk, idx) => { map.set(rk, idx); });
    return map;
  }, [rowOrder]);
  const selection = useCellSelection(weeks.map(w => w.date), rowOrder);
  const aborts = useAbortManager();
  const caps = useCapabilities();
  const url = useGridUrlState();
  const location = useLocation();
  const statusDropdown = useDropdownManager<string>();
  const { emitStatusChange } = useProjectStatusSubscription({ debug: false });
  const projectStatus = useProjectStatus({
    onSuccess: (pid, newStatus) => {
      const p = projects.find(x => x.id === pid);
      const oldStatus = (p?.status as any) || 'active';
      emitStatusChange(pid, oldStatus, newStatus);
    },
    getCurrentStatus: (pid) => {
      const p = projects.find(x => x.id === pid);
      return (p?.status as any) || 'active';
    }
  });
  const { data: schemeData } = useUtilizationScheme();
  const scheme = schemeData ?? defaultUtilizationScheme;
  const legendLabels = React.useMemo(() => {
    const s = scheme;
    if (s.mode === 'absolute_hours') {
      return {
        green: `${s.green_min}-${s.green_max}h`,
        blue: `${s.blue_min}-${s.blue_max}h`,
        orange: `${s.orange_min}-${s.orange_max}h`,
        red: `${s.red_min}h+`,
      } as const;
    }
    return { green: '70-85%', blue: '=70%', orange: '85-100%', red: '>100%' } as const;
  }, [scheme]);

  const [hoursByProject, setHoursByProject] = useState<Record<number, Record<string, number>>>({});
  const [loadingTotals, setLoadingTotals] = useState<Set<number>>(new Set());
  const [deliverablesByProjectWeek, setDeliverablesByProjectWeek] = useState<Record<number, Record<string, number>>>({});
  // Deliverable types per project/week for vertical bar rendering
  const [deliverableTypesByProjectWeek, setDeliverableTypesByProjectWeek] = useState<Record<number, Record<string, DeliverableMarker[]>>>({});
  const [loadingAssignments, setLoadingAssignments] = useState<Set<number>>(new Set());
  const [weeksHorizon, setWeeksHorizon] = useState<number>(20);
  const [editingCell, setEditingCell] = useState<{ rowKey: string; weekKey: string } | null>(null);
  const [editingSeed, setEditingSeed] = useState<string | null>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const applyBatchInFlightRef = useRef(false);
  // Role dropdown state
  const [openRoleFor, setOpenRoleFor] = useState<number | null>(null);
  const roleAnchorRef = useRef<HTMLElement | null>(null);
  const [rolesByDept, setRolesByDept] = useState<Record<number, ProjectRole[]>>({});
  // Load any missing role catalogs for departments present in rows, then sort by role order
  const sortRowsByDeptRoles = React.useCallback(async (rows: Assignment[]) => {
    const deptIds = Array.from(new Set(rows.map(a => (a as any).personDepartmentId as number | null | undefined)))
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const missing = deptIds.filter(d => rolesByDept[d] == null);
    let merged = rolesByDept;
    if (missing.length > 0) {
      const fetched = await Promise.all(
        missing.map(async d => ({ id: d, roles: await listProjectRoles(d).catch(() => []) }))
      );
      const next: Record<number, ProjectRole[]> = { ...rolesByDept };
      for (const f of fetched) next[f.id] = f.roles;
      setRolesByDept(next);
      merged = next;
    }
    return sortAssignmentsByProjectRole(rows, merged);
  }, [rolesByDept]);

  useEffect(() => {
    const deptId = mobileRoleState?.deptId;
    if (!deptId || rolesByDept[deptId]) return;
    let cancelled = false;
    (async () => {
      try {
        const roles = await listProjectRoles(deptId);
        if (!cancelled) {
          setRolesByDept(prev => ({ ...prev, [deptId]: roles }));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [mobileRoleState, rolesByDept]);
  // Quick View popover trigger lives in a child component below Layout's provider
  const queryClient = useQueryClient();
  // Reload trigger for Refresh All
  const [reloadCounter, setReloadCounter] = useState<number>(0);
  const [pendingRefresh, setPendingRefresh] = useState<boolean>(false);
  const isSnapshotMode = true;
  // Column widths + resizing (parity with person grid)
  const [clientColumnWidth, setClientColumnWidth] = useState(210);
  const [projectColumnWidth, setProjectColumnWidth] = useState(340);
  const [isResizing, setIsResizing] = useState<null | 'client' | 'project'>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const gridTemplate = useMemo(() => {
    return `${clientColumnWidth}px ${projectColumnWidth}px 40px repeat(${weeks.length}, 70px)`;
  }, [clientColumnWidth, projectColumnWidth, weeks.length]);
  const totalMinWidth = useMemo(() => {
    return clientColumnWidth + projectColumnWidth + 40 + (weeks.length * 70) + 20;
  }, [clientColumnWidth, projectColumnWidth, weeks.length]);

  // Persist column widths across views (shared keys with person grid)
  useEffect(() => {
    try {
      const cw = localStorage.getItem('assignGrid:clientColumnWidth');
      const pw = localStorage.getItem('assignGrid:projectColumnWidth');
      if (cw) {
        const n = parseInt(cw, 10); if (!Number.isNaN(n)) setClientColumnWidth(Math.max(80, n));
      }
      if (pw) {
        const n = parseInt(pw, 10); if (!Number.isNaN(n)) setProjectColumnWidth(Math.max(80, n));
      }
    } catch {}
  }, []);
  // One-time width reduction to 0.75x per request; guards with a migration flag
  useEffect(() => {
    try {
      const mig = localStorage.getItem('projGrid:widthsScaled075');
      if (!mig) {
        setClientColumnWidth(w => Math.max(80, Math.round(w * 0.75)));
        setProjectColumnWidth(w => Math.max(80, Math.round(w * 0.75)));
        localStorage.setItem('projGrid:widthsScaled075', '1');
      }
    } catch {}
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Production width correction: ensure sensible minimums once
  useEffect(() => {
    try {
      const fix = localStorage.getItem('projGrid:widthsFix_v2025_10');
      if (!fix) {
        setClientColumnWidth(w => (w < 180 ? 210 : w));
        setProjectColumnWidth(w => (w < 260 ? 300 : w));
        localStorage.setItem('projGrid:widthsFix_v2025_10', '1');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Adjustments requested: width migrations
  useEffect(() => {
    try {
      const mig2 = localStorage.getItem('projGrid:widthsFix_projectReset_client06');
      if (!mig2) {
        // Revert project width to default 300px (legacy migration)
        setProjectColumnWidth(300);
        // Reduce client width by an additional 0.6x
        setClientColumnWidth(w => Math.max(80, Math.round(w * 0.6)));
        localStorage.setItem('projGrid:widthsFix_projectReset_client06', '1');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Increase project column default to 340px to avoid status button wrapping (one-time)
  useEffect(() => {
    try {
      const mig3 = localStorage.getItem('projGrid:widthsFix_increase_project_340');
      if (!mig3) {
        setProjectColumnWidth(w => (w < 340 ? 340 : w));
        localStorage.setItem('projGrid:widthsFix_increase_project_340', '1');
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('assignGrid:clientColumnWidth', String(clientColumnWidth)); } catch {}
  }, [clientColumnWidth]);
  useEffect(() => {
    try { localStorage.setItem('assignGrid:projectColumnWidth', String(projectColumnWidth)); } catch {}
  }, [projectColumnWidth]);

  const compact = getFlag('COMPACT_ASSIGNMENT_HEADERS', true);
  const { setMainPadding } = useLayoutDensity();
  // Snap the sticky week header directly under the app top bar and
  // flush with the sidebar by removing main padding in compact mode.
  useLayoutEffect(() => {
    if (compact) setMainPadding('compact');
    return () => setMainPadding('default');
  }, [compact, setMainPadding]);

  // Measure sticky header height (legacy); compact mode snaps under top bar
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(88);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (compact) return;
    function measure() {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.getBoundingClientRect().height);
      }
    }
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    if (ro && headerRef.current) ro.observe(headerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      if (ro && headerRef.current) ro.unobserve(headerRef.current);
    };
  }, [compact]);

  // Sync horizontal scroll between sticky week header and grid body
  useEffect(() => {
    const h = headerScrollRef.current;
    const b = bodyScrollRef.current;
    if (!h || !b) return;
    let syncing = false;
    const sync = (src: HTMLElement, dst: HTMLElement) => {
      if (syncing) return;
      syncing = true;
      if (dst.scrollLeft !== src.scrollLeft) dst.scrollLeft = src.scrollLeft;
      syncing = false;
    };
    const onHeaderScroll = () => sync(h, b);
    const onBodyScroll = () => sync(b, h);
    h.addEventListener('scroll', onHeaderScroll);
    b.addEventListener('scroll', onBodyScroll);
    return () => {
      h.removeEventListener('scroll', onHeaderScroll);
      b.removeEventListener('scroll', onBodyScroll);
    };
  }, [headerHeight, totalMinWidth]);
  // Add person combobox state
  const [isAddingForProject, setIsAddingForProject] = useState<number | null>(null);
  const [personQuery, setPersonQuery] = useState<string>('');
  const [personResults, setPersonResults] = useState<Array<{ id: number; name: string; department: number | null }>>([]);
  const [selectedPersonIndex, setSelectedPersonIndex] = useState<number>(-1);
  // Status filter chips
  const statusFilterOptions = [
    'active',
    'active_ca',
    'active_with_dates',
    'active_no_deliverables',
    'on_hold',
    'completed',
    'cancelled',
    'Show All',
  ] as const;
  type StatusFilter = typeof statusFilterOptions[number];
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<Set<StatusFilter>>(() => {
    try {
      const raw = localStorage.getItem('projGrid:statusFilters');
      if (!raw) return new Set<StatusFilter>(['active','active_ca']);
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : ['active','active_ca'];
      const set = new Set<StatusFilter>();
      arr.forEach((s: any) => { if (statusFilterOptions.includes(s)) set.add(s); });
      return set.size > 0 ? set : new Set<StatusFilter>(['active','active_ca']);
    } catch { return new Set<StatusFilter>(['active','active_ca']); }
  });

  // Consistent human-friendly labels for filter buttons
  const formatStatusLabel = (status: StatusFilter): string => {
    switch (status) {
      case 'active': return 'Active';
      case 'active_ca': return 'Active CA';
      case 'active_with_dates': return 'Active - With Dates';
      case 'on_hold': return 'On-Hold';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'active_no_deliverables': return 'Active - No Deliverables';
      case 'Show All': return 'Show All';
      default: return String(status);
    }
  };

  const toggleStatusFilter = (status: StatusFilter) => {
    setSelectedStatusFilters(prev => {
      const next = new Set<StatusFilter>(prev);
      if (status === 'Show All') {
        return new Set<StatusFilter>(['Show All']);
      }
      next.delete('Show All');
      if (next.has(status)) next.delete(status); else next.add(status);
      if (next.size === 0) return new Set<StatusFilter>(['Show All']);
      try { localStorage.setItem('projGrid:statusFilters', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  };

  const toggleProjectExpanded = React.useCallback(async (project: ProjectWithAssignments) => {
    if (!project.id) return;
    const willExpand = !project.isExpanded;
    setProjects(prev => prev.map(x => (x.id === project.id ? { ...x, isExpanded: !x.isExpanded } : x)));
    try {
      const expandedIds = new Set<number>(projects.filter(x => x.isExpanded).map(x => x.id!).filter(Boolean));
      if (willExpand) expandedIds.add(project.id); else expandedIds.delete(project.id);
      url.set('expanded', expandedIds.size > 0 ? Array.from(expandedIds).join(',') : null);
    } catch {}
    if (willExpand && project.assignments.length === 0 && !loadingAssignments.has(project.id)) {
      setLoadingAssignments(prev => new Set(prev).add(project.id));
      try {
        const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
        const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
        const resp = await assignmentsApi.list({ project: project.id, department: dept, include_children: inc } as any);
        const rows = ((resp as any).results || []) as Assignment[];
        const sorted = await sortRowsByDeptRoles(rows);
        setProjects(prev => prev.map(x => (x.id === project.id ? { ...x, assignments: sorted } : x)));
      } catch (error: any) {
        showToast('Failed to load assignments', 'error');
        setProjects(prev => prev.map(x => (x.id === project.id ? { ...x, isExpanded: false } : x)));
      } finally {
        setLoadingAssignments(prev => { const n = new Set(prev); n.delete(project.id); return n; });
      }
    }
  }, [projects, url, deptState.selectedDepartmentId, deptState.includeChildren, loadingAssignments, assignmentsApi, sortRowsByDeptRoles, showToast]);

  const handleMobileStatusChange = React.useCallback(async (projectId: number, newStatus: Project['status']) => {
    try {
      await projectStatus.updateStatus(projectId, newStatus);
      setProjects(prev => prev.map(p => (p.id === projectId ? { ...p, status: newStatus } : p)));
      showToast('Status updated', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to update status', 'error');
    }
  }, [projectStatus, showToast]);

  const handleMobileRoleChange = React.useCallback(async (params: {
    projectId: number;
    assignmentId: number;
    roleId: number | null;
    roleName: string | null;
    previousId: number | null;
    previousName: string | null;
  }) => {
    const { projectId, assignmentId, roleId, roleName, previousId, previousName } = params;
    setProjects(prev => prev.map(project => {
      if (project.id !== projectId) return project;
      const updated = project.assignments.map(a => (a.id === assignmentId ? { ...a, roleOnProjectId: roleId, roleName: roleName ?? undefined } : a));
      return { ...project, assignments: sortAssignmentsByProjectRole(updated, rolesByDept) };
    }));
    try {
      await assignmentsApi.update(assignmentId, { roleOnProjectId: roleId });
      showToast('Role updated', 'success');
    } catch (error: any) {
      setProjects(prev => prev.map(project => {
        if (project.id !== projectId) return project;
        const rolledBack = project.assignments.map(a => (a.id === assignmentId ? { ...a, roleOnProjectId: previousId, roleName: previousName ?? undefined } : a));
        return { ...project, assignments: sortAssignmentsByProjectRole(rolledBack, rolesByDept) };
      }));
      showToast(error?.message || 'Failed to update role', 'error');
    }
  }, [assignmentsApi, rolesByDept, showToast, sortAssignmentsByProjectRole]);

  // Compact header slot injection (after filter state is defined)
  const topBarHeader = (
    <div className="flex items-center gap-4 min-w-0">
      <div className="min-w-0">
        <div className="text-lg font-semibold text-[var(--text)] leading-tight">Project Assignments</div>
        <div className="text-[var(--muted)] text-xs">Manage team workload allocation across {weeks.length} weeks</div>
      </div>
      <WeeksSelector value={weeksHorizon} onChange={setWeeksHorizon} />
      <HeaderActions
        onExpandAll={async () => { try { setProjects(prev => prev.map(p => ({...p,isExpanded:true}))); await refreshAllAssignments(); } catch {} }}
        onCollapseAll={() => setProjects(prev => prev.map(p => ({...p,isExpanded:false})))}
        onRefreshAll={() => refreshAllAssignments()}
        disabled={loading || loadingAssignments.size > 0}
      />
      <StatusFilterChips
        options={statusFilterOptions}
        selected={selectedStatusFilters as unknown as Set<string>}
        format={(s) => formatStatusLabel(s as any)}
        onToggle={(s) => toggleStatusFilter(s as any)}
      />
      <a
        href={buildAssignmentsLink({ weeks: weeksHorizon, statuses: (Array.from(selectedStatusFilters) || []).filter(s => s !== 'Show All') })}
        className="px-2 py-0.5 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        People View
      </a>
    </div>
  );

  const getNextDeliverableIndex = (projectId?: number | null) => {
    if (!projectId) return Number.POSITIVE_INFINITY;
    for (let i = 0; i < weeks.length; i++) {
      const wk = weeks[i]?.date;
      const entries = (deliverableTypesByProjectWeek[projectId] || {})[wk] || [];
      if (entries && entries.length > 0) return i;
    }
    return Number.POSITIVE_INFINITY;
  };

  const sortedProjects = React.useMemo(() => {
    const list = [...projects];
    const factor = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortBy === 'client') {
        const ac = (a.client || '').toString().trim().toLowerCase();
        const bc = (b.client || '').toString().trim().toLowerCase();
        if (ac !== bc) {
          if (!ac && bc) return 1 * factor;
          if (ac && !bc) return -1 * factor;
          return ac.localeCompare(bc) * factor;
        }
        const an = (a.name || '').toString().trim().toLowerCase();
        const bn = (b.name || '').toString().trim().toLowerCase();
        return an.localeCompare(bn) * factor;
      }
      if (sortBy === 'project') {
        const an = (a.name || '').toString().trim().toLowerCase();
        const bn = (b.name || '').toString().trim().toLowerCase();
        if (an !== bn) return an.localeCompare(bn) * factor;
        const ac = (a.client || '').toString().trim().toLowerCase();
        const bc = (b.client || '').toString().trim().toLowerCase();
        return ac.localeCompare(bc) * factor;
      }
      const ai = getNextDeliverableIndex(a.id);
      const bi = getNextDeliverableIndex(b.id);
      if (ai !== bi) return (ai - bi) * factor;
      const ac = (a.client || '').toString().trim().toLowerCase();
      const bc = (b.client || '').toString().trim().toLowerCase();
      if (ac !== bc) return ac.localeCompare(bc) * factor;
      const an = (a.name || '').toString().trim().toLowerCase();
      const bn = (b.name || '').toString().trim().toLowerCase();
      return an.localeCompare(bn) * factor;
    });
    return list;
  }, [projects, sortBy, sortDir, weeks, deliverableTypesByProjectWeek]);

  const typeColors: Record<string, string> = {
    bulletin: '#3b82f6',
    cd: '#fb923c',
    dd: '#818cf8',
    ifc: '#06b6d4',
    ifp: '#f472b6',
    masterplan: '#a78bfa',
    sd: '#f59e0b',
    milestone: '#64748b',
  };

  const sparkWeeks = React.useMemo(() => weeks.slice(0, Math.min(6, weeks.length)), [weeks]);

  const mobileView = (
    <>
      <div className="flex-1 flex flex-col gap-4 px-3 py-4">
        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--muted)] uppercase tracking-wide">Project Assignments</div>
            <div className="text-lg font-semibold text-[var(--text)]">{weeks.length} weeks</div>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--text)] text-sm"
            onClick={() => setMobileFilterOpen(true)}
          >
            Open Filters
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {sortedProjects.map((project) => {
            const weeklyHours = weeks.map((week) => (project.id ? (hoursByProject[project.id] || {})[week.date] : 0) || 0);
            const maxWeeklyHours = Math.max(...weeklyHours, 1);
            return (
            <div key={project.id || project.name} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm">
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
                onClick={() => void toggleProjectExpanded(project)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void toggleProjectExpanded(project);
                  }
                }}
              >
                <div className="min-w-0">
                  <div className="text-[10px] uppercase text-[var(--muted)] truncate">{project.client || '—'}</div>
                  <div className="text-base font-semibold text-[var(--text)] truncate">
                    {project.id ? (
                      <ProjectNameQuickViewButton projectId={project.id}>{project.name}</ProjectNameQuickViewButton>
                    ) : (
                      project.name
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3" onClick={(e) => e.stopPropagation()}>
                  <StatusBadge
                    status={(project.status as any) || 'active'}
                    variant="editable"
                    onClick={() => {
                      if (project.id) setMobileStatusProjectId(project.id);
                    }}
                    isUpdating={project.id ? projectStatus.isUpdating(project.id) : false}
                  />
                  <svg className={`w-4 h-4 transition-transform ${project.isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M8 5l8 7-8 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <div className="px-4 pb-4 space-y-3">
                <div className="overflow-x-auto">
                  <div className="flex gap-1 min-w-full px-0.5">
                    {weeks.map((week, index) => {
                      const hours = weeklyHours[index];
                      const deliverables = project.id ? ((deliverableTypesByProjectWeek[project.id] || {})[week.date] || []) : [];
                      const barHeight = Math.max(6, Math.round((hours / maxWeeklyHours) * 48));
                      const deliverableTitle = deliverables.map((d) => `${d.percentage != null ? `${d.percentage}% ` : ''}${(d.type || '').toUpperCase()}`).join(', ');
                      const weekLabelFull = formatDateWithWeekday(week.date);
                      const handleDeliverableTap = () => {
                        if (!deliverables.length) return;
                        setMobileDeliverableDetail({
                          projectName: project.name,
                          client: project.client ?? undefined,
                          weekLabel: weekLabelFull,
                          entries: deliverables,
                        });
                      };
                      const hasDeliverables = deliverables.length > 0;
                      const ColumnTag: React.ElementType = hasDeliverables ? 'button' : 'div';
                      return (
                        <ColumnTag
                          key={week.date}
                          type={hasDeliverables ? 'button' : undefined}
                          className={`flex flex-col items-center min-w-[32px] ${hasDeliverables ? 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]' : ''}`}
                          aria-label={`${weekLabelFull} • ${hours} hours${hasDeliverables ? ` • ${deliverableTitle}` : ''}`}
                          onClick={hasDeliverables ? handleDeliverableTap : undefined}
                        >
                          <div className="text-[10px] text-[var(--muted)] truncate" title={formatDateWithWeekday(week.date)}>
                            {(() => {
                              const d = new Date(week.date);
                              const month = String(d.getMonth() + 1).padStart(2, '0');
                              const day = String(d.getDate()).padStart(2, '0');
                              return `${month}/${day}`;
                            })()}
                          </div>
                          <div className="h-16 flex items-end justify-center w-full mt-1">
                            <div
                              className="w-[10px] rounded-full bg-emerald-500 transition-all"
                              style={{ height: `${barHeight}px`, opacity: hours > 0 ? 1 : 0.25 }}
                              title={`${formatDateWithWeekday(week.date)} — ${hours}h`}
                            />
                          </div>
                          {hasDeliverables && (
                            <div className="w-full mt-2">
                              <div
                                className="h-[5px] rounded-full"
                                style={{ background: typeColors[deliverables[0].type] || 'var(--primary)' }}
                                title={deliverableTitle}
                              />
                            </div>
                          )}
                        </ColumnTag>
                      );
                    })}
                  </div>
                </div>
                {project.isExpanded && (
                  <div className="space-y-2">
                    {project.assignments.map((asn) => {
                      const deptId = (asn as any).personDepartmentId as number | null | undefined;
                      const label = (asn as any).roleName as string | null | undefined;
                      const currentId = (asn as any).roleOnProjectId as number | null | undefined;
                      const personCapacity = (asn as any).personWeeklyCapacity as number | undefined;
                      const assignmentSparkWeeks = sparkWeeks.length > 0 ? sparkWeeks : weeks;
                      const weekHours = assignmentSparkWeeks.map((week) => Number(((asn.weeklyHours as any) || {})[week.date] || 0));
                      const maxHour = Math.max(...weekHours, personCapacity || 0, 1);
                      return (
                        <div key={asn.id} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-[var(--text)]">{asn.personName || `Person #${asn.person}`}</div>
                              <button
                                type="button"
                                className={`text-xs text-[var(--muted)] bg-transparent border-none p-0 ${
                                  project.id && deptId
                                    ? 'hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--primary)]'
                                    : 'opacity-50 cursor-not-allowed'
                                }`}
                                onClick={() => {
                                  if (!project.id || !deptId) return;
                                  setMobileRoleState({
                                    projectId: project.id,
                                    assignmentId: asn.id!,
                                    deptId,
                                    currentId: currentId ?? null,
                                    label: label ?? null,
                                  });
                                }}
                                disabled={!project.id || !deptId}
                              >
                                {label || 'No role'}
                              </button>
                            </div>
                            <div className="flex items-end gap-1 min-w-[56px]" aria-hidden="true">
                              {assignmentSparkWeeks.map((week, idx) => {
                                const value = weekHours[idx] || 0;
                                const height = Math.max(4, Math.round((value / maxHour) * 32));
                                const pill = getUtilizationPill({
                                  hours: value,
                                  capacity: personCapacity ?? null,
                                  scheme,
                                  output: 'token',
                                });
                                const color = pill.tokens?.bg || 'var(--primary)';
                                return (
                                  <div
                                    key={`${asn.id}-spark-${week.date}`}
                                    className="w-1.5 rounded-full transition-all"
                                    style={{ height, background: color, opacity: value > 0 ? 1 : 0.2 }}
                                    title={`${week.display}: ${value}h`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-[var(--muted)]">{personCapacity ? `Capacity ${personCapacity}h/wk` : 'Capacity unavailable'}</div>
                        </div>
                      );
                    })}
                    {project.assignments.length === 0 && (
                      <div className="text-xs text-[var(--muted)] italic px-2">No assignments</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );})}
          {sortedProjects.length === 0 && !loading && (
            <div className="text-center text-[var(--muted)] text-sm py-6">No projects match the current filters.</div>
          )}
        </div>
      </div>
      <MobileSheet open={mobileFilterOpen} title="Project Filters" onClose={() => setMobileFilterOpen(false)}>
        <div className="space-y-4">
          <WeeksSelector value={weeksHorizon} onChange={setWeeksHorizon} />
          <StatusFilterChips
            options={statusFilterOptions}
            selected={selectedStatusFilters as unknown as Set<string>}
            format={(status) => formatStatusLabel(status as StatusFilter)}
            onToggle={(status) => toggleStatusFilter(status as StatusFilter)}
          />
          <HeaderActions
            onExpandAll={async () => { try { setProjects(prev => prev.map(p => ({ ...p, isExpanded: true }))); await refreshAllAssignments(); } catch {} }}
            onCollapseAll={() => { setProjects(prev => prev.map(p => ({ ...p, isExpanded: false }))); url.set('expanded', null); }}
            onRefreshAll={refreshAllAssignments}
            disabled={loading || loadingAssignments.size > 0}
          />
        </div>
      </MobileSheet>
      <MobileSheet open={!!mobileStatusProject} title="Update Status" onClose={() => setMobileStatusProjectId(null)}>
        <div className="space-y-2">
          {statusFilterOptions.filter((s) => s !== 'Show All').map((opt) => (
            <button
              key={opt}
              type="button"
              className={`w-full px-3 py-2 rounded border text-left ${mobileStatusProject?.status === opt ? 'border-[var(--primary)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
              onClick={async () => {
                if (!mobileStatusProject?.id) return;
                await handleMobileStatusChange(mobileStatusProject.id, opt as Project['status']);
                setMobileStatusProjectId(null);
              }}
            >
              {formatStatusLabel(opt as StatusFilter)}
            </button>
          ))}
        </div>
      </MobileSheet>
      <MobileSheet open={!!mobileRoleState} title="Select Role" onClose={() => setMobileRoleState(null)}>
        {mobileRoleState?.deptId ? (
          <div className="space-y-2">
            <button
              type="button"
              className={`w-full px-3 py-2 rounded border text-left text-sm ${mobileRoleState.currentId == null ? 'border-[var(--primary)] text-[var(--text)] bg-[var(--surfaceOverlay)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
              onClick={async () => {
                if (!mobileRoleState?.projectId || !mobileRoleState.assignmentId) return;
                await handleMobileRoleChange({
                  projectId: mobileRoleState.projectId,
                  assignmentId: mobileRoleState.assignmentId,
                  roleId: null,
                  roleName: null,
                  previousId: mobileRoleState.currentId ?? null,
                  previousName: mobileRoleState.label ?? null,
                });
                setMobileRoleState(null);
              }}
            >
              Clear role
            </button>
            {(rolesByDept[mobileRoleState.deptId] || []).map((role) => {
              const selected = role.id === (mobileRoleState.currentId ?? undefined);
              return (
                <button
                  key={role.id}
                  type="button"
                  className={`w-full px-3 py-2 rounded border text-left text-sm ${selected ? 'border-[var(--primary)] text-[var(--text)] bg-[var(--surfaceOverlay)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
                  onClick={async () => {
                    if (!mobileRoleState?.projectId || !mobileRoleState.assignmentId) return;
                    await handleMobileRoleChange({
                      projectId: mobileRoleState.projectId,
                      assignmentId: mobileRoleState.assignmentId,
                      roleId: role.id,
                      roleName: role.name,
                      previousId: mobileRoleState.currentId ?? null,
                      previousName: mobileRoleState.label ?? null,
                    });
                    setMobileRoleState(null);
                  }}
                >
                  {role.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-[var(--muted)]">No role catalog available.</div>
        )}
      </MobileSheet>
      <MobileSheet
        open={!!mobileDeliverableDetail}
        title={mobileDeliverableDetail ? 'Deliverables' : 'Deliverable Details'}
        onClose={() => setMobileDeliverableDetail(null)}
      >
        {mobileDeliverableDetail ? (
          <div className="space-y-3">
            <div className="text-sm text-[var(--muted)]">
              {mobileDeliverableDetail.projectName}
              {mobileDeliverableDetail.client ? ` • ${mobileDeliverableDetail.client}` : ''}
            </div>
            {mobileDeliverableDetail.entries.map((entry, idx) => (
              <div key={`${entry.type}-${idx}-${entry.description || ''}`} className="border border-[var(--border)] rounded-lg p-3 bg-[var(--card)]">
                <div className="text-sm font-semibold">{entry.description || entry.type.toUpperCase()}</div>
                {entry.percentage != null && (
                  <div className="text-xs text-[var(--muted)] mt-1">{entry.percentage}% milestone</div>
                )}
                {entry.dates?.length ? (
                  <div className="text-xs mt-1">
                    Dates: {entry.dates.map((dateStr) => formatDateWithWeekday(dateStr)).join(', ')}
                  </div>
                ) : null}
                {entry.note ? (
                  <div className="text-xs mt-2 text-[var(--muted)] whitespace-pre-wrap">{entry.note}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </MobileSheet>
    </>
  );

  // Helper: refresh totals for project from server
  const refreshTotalsForProject = async (projectId: number) => {
    try {
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const res = await getProjectTotals([projectId], { weeks: weeks.length, department: dept, include_children: inc });
      setHoursByProject(prev => ({ ...prev, [projectId]: res.hoursByProject[String(projectId)] || {} }));
    } catch (e:any) {
      showToast('Failed to refresh totals: ' + (e?.message || 'Unknown error'), 'error');
    }
  };

  // Refresh assignments for a specific project
  const refreshProjectAssignments = async (projectId: number) => {
    setLoadingAssignments(prev => new Set(prev).add(projectId));
    try {
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const resp = await assignmentsApi.list({ project: projectId, department: dept, include_children: inc } as any);
      const rows = ((resp as any).results || []) as Assignment[];
      // Ensure role catalogs for departments present
      const deptIds = Array.from(new Set(rows.map(a => (a as any).personDepartmentId as number | null | undefined)))
        .filter((v): v is number => typeof v === 'number' && v > 0);
      const missing = deptIds.filter(d => rolesByDept[d] == null);
      let merged = rolesByDept;
      if (missing.length > 0) {
        const fetched = await Promise.all(missing.map(async d => ({ id: d, roles: await listProjectRoles(d).catch(() => []) })));
        const next: Record<number, ProjectRole[]> = { ...rolesByDept };
        for (const f of fetched) next[f.id] = f.roles;
        setRolesByDept(next);
        merged = next;
      }
      const sorted = sortAssignmentsByProjectRole(rows, merged);
      setProjects(prev => prev.map(p => (p.id === projectId ? { ...p, assignments: sorted } : p)));
      showToast('Project assignments refreshed', 'success');
    } catch (e: any) {
      showToast('Failed to refresh project assignments: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      setLoadingAssignments(prev => { const n = new Set(prev); n.delete(projectId); return n; });
    }
  };

  // Refresh assignments for all projects (both expanded and collapsed)
  async function refreshAllAssignments() {
    if (projects.length === 0) {
      showToast('No projects available to refresh', 'warning');
      return;
    }

    try {
      const projectIds = projects.map(p => p.id!).filter((id): id is number => typeof id === 'number');
      if (projectIds.length === 0) {
        showToast('No projects available to refresh', 'warning');
        return;
      }

      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const bulk = await assignmentsApi.listAll({ department: dept, include_children: dept != null ? inc : undefined } as any);
      const allAssignments = Array.isArray(bulk) ? bulk : [];

      const byProject = new Map<number, Assignment[]>();
      for (const a of allAssignments) {
        const pid = (a.project as number | undefined) ?? ((a as any).projectId as number | undefined);
        if (!pid) continue;
        const current = byProject.get(pid) || [];
        current.push(a);
        byProject.set(pid, current);
      }

      const updates: Array<{ projectId: number; assignments: Assignment[] }> = [];
      for (const projectId of projectIds) {
        const rows = byProject.get(projectId) || [];
        const sorted = rows.length > 0 ? await sortRowsByDeptRoles(rows) : [];
        updates.push({ projectId, assignments: sorted });
      }

      setProjects(prev =>
        prev.map(p => {
          const update = updates.find(u => u.projectId === p.id);
          return update ? { ...p, assignments: update.assignments } : p;
        })
      );

      showToast(`Refreshed assignments for all ${projects.length} projects`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Failed to refresh some project assignments', 'error');
    }
  }

  // Initialize from URL params once
  React.useEffect(() => {
    try {
      // view param
      url.set('view', 'project');
      const w = url.get('weeks');
      if (w) {
        const n = parseInt(w, 10); if (!Number.isNaN(n) && n >= 1 && n <= 26) setWeeksHorizon(n);
      }
      const s = url.get('status');
      if (s && s.length > 0) {
        const toks = s.split(',');
        const set = new Set<StatusFilter>();
        for (const t of toks) {
          const tok = t as StatusFilter;
          if ((['active','active_ca','on_hold','completed','cancelled','active_no_deliverables','active_with_dates','Show All'] as const).includes(tok)) set.add(tok);
        }
        if (set.size > 0) setSelectedStatusFilters(set);
      } else {
        // Default filters in URL to reduce initial payload
        url.set('status', 'active,active_ca');
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
        const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
        // Build server filters
        const statuses = Array.from(selectedStatusFilters);
        const hasShowAll = statuses.includes('Show All');
        const hasNoDelivs = statuses.includes('active_no_deliverables');
        const hasFutureWithDates = statuses.includes('active_with_dates');
        const normalizedForApi = hasShowAll
          ? []
          : statuses
              .filter((s) => s !== 'Show All' && s !== 'active_no_deliverables')
              .map((s) => (s === 'active_with_dates' ? 'active' : s));
        const statusIn = hasShowAll
          ? undefined
          : (normalizedForApi.length > 0 ? Array.from(new Set(normalizedForApi)).join(',') : undefined);
        let hasFutureParam: 0 | 1 | undefined;
        if (!hasShowAll && statuses.length === 1) {
          if (hasNoDelivs) hasFutureParam = 0;
          else if (hasFutureWithDates) hasFutureParam = 1;
        }
        const snap = await getProjectGridSnapshot({
          weeks: weeksHorizon,
          department: dept,
          include_children: inc,
          status_in: statusIn,
          has_future_deliverables: hasFutureParam,
        });
        if (!mounted) return;
        setWeeks(toWeekHeader(snap.weekKeys || []));
        // Normalize projects from snapshot
        const fromSnapshot: ProjectWithAssignments[] = (snap.projects || [])
          .map(p => ({ id: p.id, name: p.name, client: p.client ?? undefined, status: p.status ?? undefined, assignments: [], isExpanded: false }));

        // Augment with projects that match filters even if they currently have no assignments in the snapshot
        // When the filter relies on deliverable metadata exclusively we rely on the snapshot (needs server data)
        let augmented: ProjectWithAssignments[] = fromSnapshot;
        try {
          const onlySpecialFilter =
            (!hasShowAll && hasNoDelivs && statuses.length === 1) ||
            (!hasShowAll && hasFutureWithDates && statuses.length === 1);
          if (!onlySpecialFilter) {
            const allProjects = await projectsApi.listAll();
            const allowAllStatuses = hasShowAll || statuses.length === 0;
            const allowed = new Set(
              (statuses || [])
                .filter((s) => s !== 'Show All' && s !== 'active_no_deliverables')
                .map((s) => (s === 'active_with_dates' ? 'active' : s))
                .map((s) => s.toLowerCase())
            );
            const seen = new Set(fromSnapshot.map(p => p.id));
            const extras = (allProjects || [])
              .filter(p => !seen.has(p.id!))
              .filter(p => allowAllStatuses ? true : allowed.has((p.status || '').toLowerCase()))
              .map(p => ({ id: p.id!, name: p.name, client: (p as any).client ?? undefined, status: (p.status as any) ?? undefined, assignments: [], isExpanded: false }));
            augmented = [...fromSnapshot, ...extras];
          }
        } catch {}

        // Default sort: client name, then project name
        const proj: ProjectWithAssignments[] = augmented.sort((a, b) => {
          const ac = (a.client || '').toString().trim().toLowerCase();
          const bc = (b.client || '').toString().trim().toLowerCase();
          if (ac !== bc) {
            if (!ac && bc) return 1;
            if (ac && !bc) return -1;
            return ac.localeCompare(bc);
          }
          const an = (a.name || '').toString().trim().toLowerCase();
          const bn = (b.name || '').toString().trim().toLowerCase();
          return an.localeCompare(bn);
        });
        const future = new Set<number>();
        Object.entries(snap.hasFutureDeliverablesByProject || {}).forEach(([pid, val]) => { if (val) future.add(Number(pid)); });
        const futureLookup = buildFutureDeliverableLookupFromSet(future);
        const showAllSelected = hasShowAll || statuses.length === 0;
        const allowedStatusSet = new Set(
          normalizedForApi.map((s) => s.toLowerCase())
        );
        const filteredProjects = showAllSelected
          ? proj
          : proj.filter((project) => {
              const status = (project.status || '').toLowerCase();
              const baseMatch = allowedStatusSet.has(status);
              const withDatesMatch = hasFutureWithDates && projectMatchesActiveWithDates(project, futureLookup);
              const noDatesMatch = hasNoDelivs && projectMatchesActiveWithoutDates(project, futureLookup);
              return baseMatch || withDatesMatch || noDatesMatch;
            });
        setProjects(filteredProjects);
        // Coerce hours map keys to numbers
        const hb: Record<number, Record<string, number>> = {};
        Object.entries(snap.hoursByProject || {}).forEach(([pid, wk]) => { hb[Number(pid)] = wk; });
        setHoursByProject(hb);
        // Deliverables maps (counts + typed markers from snapshot)
        const dbw: Record<number, Record<string, number>> = {};
        Object.entries(snap.deliverablesByProjectWeek || {}).forEach(([pid, wk]) => { dbw[Number(pid)] = wk; });
        setDeliverablesByProjectWeek(dbw);
        const markersByProject: Record<number, Record<string, DeliverableMarker[]>> = {};
        if (snap.deliverableMarkersByProjectWeek) {
          Object.entries(snap.deliverableMarkersByProjectWeek).forEach(([pid, weeksMap]) => {
            const projectId = Number(pid);
            if (!projectId || !weeksMap) return;
            const weekMarkers: Record<string, DeliverableMarker[]> = {};
            Object.entries(weeksMap || {}).forEach(([weekKey, markers]) => {
              const normalized = (markers || []).map((m: any) => ({
                type: String(m.type || '').toLowerCase(),
                percentage: m.percentage == null || Number.isNaN(Number(m.percentage)) ? undefined : Number(m.percentage),
                dates: Array.isArray(m.dates) && m.dates.length > 0 ? [...m.dates] : undefined,
                description: m.description ?? null,
                note: m.note ?? null,
              })) as DeliverableMarker[];
              if (normalized.length > 0) {
                weekMarkers[weekKey] = normalized;
              }
            });
            if (Object.keys(weekMarkers).length > 0) {
              markersByProject[projectId] = weekMarkers;
            }
          });
        }
        setDeliverableTypesByProjectWeek(markersByProject);
        // Expand projects from URL param and lazy-load their assignments
        try {
          const expandedParam = url.get('expanded');
          if (expandedParam) {
            const ids = expandedParam.split(',').map(x => parseInt(x, 10)).filter(n => !Number.isNaN(n));
            if (ids.length > 0) {
              setProjects(prev => prev.map(p => ids.includes(p.id!) ? { ...p, isExpanded: true } : p));
              for (const pid of ids) {
                if (!pid) continue;
                if (loadingAssignments.has(pid)) continue;
                setLoadingAssignments(prev => new Set(prev).add(pid));
                try {
                  const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
                  const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
                  const resp = await assignmentsApi.list({ project: pid, department: dept, include_children: inc } as any);
                  const rows = ((resp as any).results || []) as Assignment[];
                  const sorted = await sortRowsByDeptRoles(rows);
                  setProjects(prev => prev.map(x => x.id === pid ? { ...x, assignments: sorted, isExpanded: true } : x));
                } catch {}
                finally {
                  setLoadingAssignments(prev => { const n = new Set(prev); n.delete(pid); return n; });
                }
              }
            }
          }
        } catch {}
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load project grid snapshot');
      } finally {
        if (mounted) {
          setLoading(false);
          if (pendingRefresh) {
            try { showToast('Refresh complete', 'success'); } catch {}
            setPendingRefresh(false);
          }
        }
      }
    };
    load();
    return () => { mounted = false; };
  }, [deptState.selectedDepartmentId, deptState.includeChildren, weeksHorizon, selectedStatusFilters, reloadCounter]);

  // Listen for global grid refresh events and trigger reload
  useEffect(() => {
    const unsub = subscribeGridRefresh(() => {
      setPendingRefresh(true);
      setReloadCounter((c) => c + 1);
    });
    return unsub;
  }, []);


  // Global mouse events for column resizing
  useEffect(() => {
    const handleMouseUp = () => {
      if (isResizing) setIsResizing(null);
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = e.clientX - resizeStartX;
      const next = Math.max(80, resizeStartWidth + deltaX);
      if (isResizing === 'client') setClientColumnWidth(next);
      if (isResizing === 'project') setProjectColumnWidth(next);
    };
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isResizing, resizeStartX, resizeStartWidth]);

  const startColumnResize = (column: 'client' | 'project', e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(column === 'client' ? clientColumnWidth : projectColumnWidth);
  };

  // Global keyboard handler: start editing on numeric key when a cell is selected
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore if already editing or adding person
      if (editingCell || isAddingForProject !== null) return;
      // Ignore if typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (target as any).isContentEditable) return;
      }
      const active = selection.selectedCell || selection.selectionStart || null;
      if (!active) return;
      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        const seed = e.key === '.' ? '0.' : e.key;
        setEditingCell({ rowKey: String(active.rowKey), weekKey: active.weekKey });
        setEditingSeed(seed);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.selectedCell, selection.selectionStart, editingCell, isAddingForProject]);

  // Sync URL when weeks or status filters change
  useEffect(() => { url.set('weeks', String(weeksHorizon)); }, [weeksHorizon]);
  useEffect(() => {
    const s = Array.from(selectedStatusFilters);
    const val = s.includes('Show All') && s.length === 1 ? null : s.join(',');
    url.set('status', val || null);
  }, [selectedStatusFilters]);

  const runApplyBatch = React.useCallback(async (
    updatesMap: Map<number, AssignmentUpdateInfo>,
    touchedProjects: Set<number>,
    savingKeys: string[],
  ) => {
    applyBatchInFlightRef.current = true;
    // Fire conflict checks in background (grouped per person/week to avoid spam)
    try {
      const payloadMap = new Map<string, { personId: number; projectId: number; weekKey: string; proposedHours: number }>();
      updatesMap.forEach((info) => {
        if (!info.personId) return;
        info.weeks.forEach((weekKey) => {
          const prevVal = Number(info.prev[weekKey] ?? 0) || 0;
          const nextVal = Number(info.next[weekKey] ?? 0) || 0;
          const delta = nextVal - prevVal;
          if (delta === 0) return;
          const key = `${info.personId}:${weekKey}`;
          const existing = payloadMap.get(key);
          if (existing) {
            existing.proposedHours += delta;
          } else {
            payloadMap.set(key, {
              personId: info.personId!,
              projectId: info.projectId,
              weekKey,
              proposedHours: delta,
            });
          }
        });
      });
      const conflictPayloads = Array.from(payloadMap.values());
      if (conflictPayloads.length) {
        Promise.allSettled(
          conflictPayloads.map((payload) =>
            assignmentsApi
              .checkConflicts(payload.personId, payload.projectId, payload.weekKey, payload.proposedHours)
              .then((response) => ({ response }))
          )
        ).then((results) => {
          const warnings: string[] = [];
          results.forEach((result) => {
            if (result.status === 'fulfilled') {
              const resp = result.value?.response;
              if (resp && Array.isArray(resp.warnings) && resp.warnings.length) {
                warnings.push(...resp.warnings);
              }
            } else {
              console.warn('Conflict check failed', result.reason);
            }
          });
          if (warnings.length) showToast(warnings.join('\n'), 'warning');
        });
      }
    } catch (conflictErr) {
      console.warn('Unable to evaluate overallocation risk', conflictErr);
    }

    // Persist updates
    try {
      const updatesArray = Array.from(updatesMap.entries()).map(([aid, info]) => ({ assignmentId: aid, weeklyHours: info.next }));
      if (updatesArray.length > 1) {
        await assignmentsApi.bulkUpdateHours(updatesArray);
      } else if (updatesArray.length === 1) {
        await assignmentsApi.update(updatesArray[0].assignmentId, { weeklyHours: updatesArray[0].weeklyHours });
      }
      // Refresh totals
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const pidList = Array.from(touchedProjects);
      if (pidList.length > 0) {
        const res = await getProjectTotals(pidList, { weeks: weeks.length, department: dept, include_children: inc });
        setHoursByProject(prev => {
          const next = { ...prev } as any;
          pidList.forEach(pid => { next[pid] = (res.hoursByProject[String(pid)] || {}); });
          return next;
        });
      }
    } catch (err:any) {
      // Rollback
      setProjects(prevState => prevState.map(x => {
        if (!touchedProjects.has(x.id!)) return x;
        return {
          ...x,
          assignments: x.assignments.map(a => {
            if (!a.id || !updatesMap.has(a.id)) return a;
            const info = updatesMap.get(a.id)!;
            return { ...a, weeklyHours: info.prev };
          }),
        };
      }));
      showToast(err?.message || 'Failed to update hours', 'error');
    } finally {
      setSavingCells(prevSet => {
        const s = new Set(prevSet);
        savingKeys.forEach(k => s.delete(k));
        return s;
      });
      applyBatchInFlightRef.current = false;
    }
  }, [assignmentsApi, deptState.selectedDepartmentId, deptState.includeChildren, weeks, getProjectTotals]);

  // Apply a numeric value to the current selection (or active cell)
  const applyValueToSelection = React.useCallback((anchorAssignmentId: number, anchorWeekKey: string, value: number) => {
    const v = value;
    if (Number.isNaN(v) || v < 0) { showToast('Enter a valid non-negative number', 'warning'); return; }

    // Avoid overlapping heavy batches; keep UX predictable
    if (applyBatchInFlightRef.current) {
      showToast('Updates are still being applied. Please wait a moment and try again.', 'warning');
      return;
    }

    // Determine target cells
    const selectedCells = selection.getSelectedCells();
    const selected = selectedCells.length > 0
      ? selectedCells
      : [{ rowKey: String(anchorAssignmentId), weekKey: anchorWeekKey }];

    // Prepare updates
    const updatesMap = new Map<number, AssignmentUpdateInfo>();
    const touchedProjects = new Set<number>();
    for (const c of selected) {
      const aid = parseInt(c.rowKey, 10);
      if (Number.isNaN(aid)) continue;
      const entry = assignmentById.get(aid);
      if (!entry) continue;
      touchedProjects.add(entry.projectId);
      const prev = updatesMap.get(aid)?.prev || { ...(entry.assignment.weeklyHours || {}) };
      const next = updatesMap.get(aid)?.next || { ...(entry.assignment.weeklyHours || {}) };
      next[c.weekKey] = v;
      const weeksSet = updatesMap.get(aid)?.weeks || new Set<string>();
      weeksSet.add(c.weekKey);
      updatesMap.set(aid, { prev, next, weeks: weeksSet, personId: entry.personId, projectId: entry.projectId });
    }

    // Optimistic UI + saving flags
    const savingKeys: string[] = [];
    updatesMap.forEach((info, aid) => { info.weeks.forEach(wk => savingKeys.push(`${aid}-${wk}`)); });
    setSavingCells(prevSet => { const s = new Set(prevSet); savingKeys.forEach(k => s.add(k)); return s; });
    setProjects(prevState => prevState.map(x => {
      if (!touchedProjects.has(x.id!)) return x;
      return { ...x, assignments: x.assignments.map(a => { if (!a.id || !updatesMap.has(a.id)) return a; const info = updatesMap.get(a.id)!; return { ...a, weeklyHours: info.next }; }) };
    }));
    setEditingCell(null);
    setEditingSeed(null);

    // Kick off heavy work asynchronously
    void runApplyBatch(updatesMap, touchedProjects, savingKeys);
  }, [selection.getSelectedCells, projects, runApplyBatch]);

  // Sorting helpers
  const toggleSort = (key: 'client' | 'project' | 'deliverable') => {
    setSortBy(prev => {
      if (prev === key) {
        setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return key;
    });
  };

  // React to URL-expanded changes (back/forward) and sync expansions
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const expandedParam = sp.get('expanded');
      const ids = expandedParam ? expandedParam.split(',').map(x => parseInt(x, 10)).filter(n => !Number.isNaN(n)) : [];
      const setIds = new Set(ids);
      setProjects(prev => prev.map(p => ({ ...p, isExpanded: p.id ? setIds.has(p.id) : false })));
      // Lazy-load any newly expanded projects without assignments
      for (const pid of ids) {
        if (!pid) continue;
        const pr = projects.find(pp => pp.id === pid);
        if (pr && pr.assignments.length === 0 && !loadingAssignments.has(pid)) {
          setLoadingAssignments(prev => new Set(prev).add(pid));
          (async () => {
            try {
              const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
              const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
              const resp = await assignmentsApi.list({ project: pid, department: dept, include_children: inc } as any);
              const rows = ((resp as any).results || []) as Assignment[];
              const sorted = await sortRowsByDeptRoles(rows);
              setProjects(prev2 => prev2.map(x => x.id === pid ? { ...x, assignments: sorted, isExpanded: true } : x));
            } catch {}
            finally {
              setLoadingAssignments(prev2 => { const n = new Set(prev2); n.delete(pid); return n; });
            }
          })();
        }
      }
    } catch {}
  }, [location.search]);
  const desktopView = (
    <>
      {compact && (<TopBarPortal side="right">{topBarHeader}</TopBarPortal>)}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Header */}
        {!compact && (
        <div ref={headerRef} className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] z-30 px-6 py-4">
          {/* Top row: title + subtitle (left), snapshot chip (right) */}
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">Project Assignments</h1>
              <p className="text-[var(--muted)] text-sm mt-1">Manage team workload allocation across {weeks.length} weeks</p>
              {/* Weeks selector + People View link (left, under subtitle) */}
              <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>Weeks</span>
                {[8,12,16,20].map(n => (
                  <button
                    key={n}
                    onClick={() => setWeeksHorizon(n)}
                    className={`px-2 py-0.5 rounded border text-xs transition-colors ${
                      weeksHorizon===n
                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                        : 'bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {(() => {
                  const s = Array.from(selectedStatusFilters);
                  const statusStr = s.includes('Show All') && s.length === 1 ? '' : `&status=${encodeURIComponent(s.join(','))}`;
                  const href = `/assignments?view=people&weeks=${weeksHorizon}${statusStr}`;
                  return (
                    <a
                      href={href}
                      className="ml-2 px-2 py-0.5 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
                    >
                      People View
                    </a>
                  );
                })()}
              </div>
            </div>
            <div className="pt-1">
              <span
                title={isSnapshotMode ? 'Rendering from server grid snapshot' : 'Server snapshot unavailable; using legacy client aggregation'}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${
                  isSnapshotMode
                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-[var(--card)] text-[var(--muted)] border-[var(--border)]'
                }`}
              >
                {isSnapshotMode ? 'Snapshot Mode' : 'Legacy Mode'}
              </span>
            </div>
          </div>
          {/* Second row: Department filter + project status filters */}
          <div className="mt-3 flex items-center justify-between gap-6">
            <div className="flex-1 min-w-[320px]">
              <GlobalDepartmentFilter
                showCopyLink={false}
                rightActions={(
                  <>
                    <button
                      className={`px-2 py-0.5 rounded border border-[var(--border)] text-xs transition-colors ${
                        loadingAssignments.size > 0
                          ? 'text-[var(--muted)] cursor-wait'
                          : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                      }`}
                      title="Expand all projects and refresh their assignments"
                      onClick={async () => {
                        try {
                          // Expand all projects first
                          setProjects(prev => prev.map(p => ({ ...p, isExpanded: true })));
                          // Update URL expanded list
                          const ids = projects.map(p => p.id!).filter(Boolean);
                          if (ids.length > 0) url.set('expanded', ids.join(','));
                          // Refresh assignments for all projects to ensure up-to-date data
                          await refreshAllAssignments();
                        } catch {}
                      }}
                      disabled={loadingAssignments.size > 0}
                    >
                      {loadingAssignments.size > 0 ? 'Expanding…' : 'Expand All'}
                    </button>
                    <button
                      className="px-2 py-0.5 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                      title="Collapse all projects"
                      onClick={() => {
                        setProjects(prev => prev.map(p => ({ ...p, isExpanded: false })));
                        url.set('expanded', null);
                      }}
                    >
                      Collapse All
                    </button>
                    <button
                      className={`px-2 py-0.5 rounded border text-xs transition-colors ${
                        loading || loadingAssignments.size > 0
                          ? 'bg-[var(--card)] border-[var(--border)] text-[var(--muted)] cursor-wait'
                          : 'bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]'
                      }`}
                      title="Refresh assignments for all projects"
                      onClick={refreshAllAssignments}
                      disabled={loading || loadingAssignments.size > 0}
                    >
                      {loadingAssignments.size > 0 ? 'Refreshing…' : 'Refresh All'}
                    </button>
                  </>
                )}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {statusFilterOptions.map((opt) => {
                const isActive = selectedStatusFilters.has(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggleStatusFilter(opt)}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      isActive
                        ? 'bg-[var(--primary)] border-[var(--primary)] text-white'
                        : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--cardHover)]'
                    }`}
                    aria-pressed={isActive}
                    aria-label={`Filter: ${formatStatusLabel(opt)}`}
                    title={formatStatusLabel(opt)}
                  >
                    {formatStatusLabel(opt)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        )}

        {/* Sticky week header aligned to measured header height */}
        <div ref={headerScrollRef} className="sticky left-0 right-0 bg-[var(--card)] border-b border-[var(--border)] z-20 overflow-x-auto" style={{ top: compact ? 0 : headerHeight }}>
          <div style={{ minWidth: totalMinWidth }}>
            <div className="grid gap-px p-2" style={{ gridTemplateColumns: gridTemplate }}>
              <div
                className="font-medium text-[var(--text)] text-sm px-2 py-1 relative group cursor-pointer hover:text-[var(--text)]"
                onClick={() => toggleSort('client')}
                role="button"
                aria-label="Sort by client"
                aria-pressed={sortBy === 'client'}
              >
                Client
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[var(--primaryHover)] transition-colors"
                  onMouseDown={(e) => startColumnResize('client', e)}
                  title="Drag to resize client column"
                />
              </div>
              <div
                className="font-medium text-[var(--text)] text-sm px-2 py-1 relative group cursor-pointer hover:text-[var(--text)]"
                onClick={() => toggleSort('project')}
                role="button"
                aria-label="Sort by project"
                aria-pressed={sortBy === 'project'}
              >
                Project
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[var(--primaryHover)] transition-colors"
                  onMouseDown={(e) => startColumnResize('project', e)}
                  title="Drag to resize project column"
                />
              </div>
              <div className="text-center text-xs text-[var(--muted)] px-1">+/-</div>
              {weeks.map((week, index) => (
                <div
                  key={week.date}
                  className="text-center px-1 select-none cursor-pointer hover:text-[var(--text)]"
                  role="columnheader"
                  aria-label={`Week starting ${week.display}`}
                  onClick={() => toggleSort('deliverable')}
                  title="Sort by next deliverable date"
                >
                  <div className="text-xs font-medium text-[var(--text)]">{week.display}</div>
                  <div className="text-[10px] text-[var(--muted)]">W{index + 1}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Projects grid (totals by week, server authoritative) */}
        <div ref={bodyScrollRef} className="px-6 py-4 overflow-x-auto">
          {!loading && !error && projects.length === 0 && (
            <div className="text-[var(--muted)]">No projects found in scope.</div>
          )}

          {!loading && !error && projects.length > 0 && (
            <div className="space-y-1" style={{ minWidth: totalMinWidth }}>
              {sortedProjects.map((p) => (
                <div key={p.id} className="border-b border-[var(--border)] last:border-b-0">
                  {/* Project summary row */}
                  <div
                    className="grid items-stretch gap-px p-2 hover:bg-[var(--surfaceHover)] transition-colors cursor-pointer"
                    style={{ gridTemplateColumns: gridTemplate }}
                    onClick={(e) => {
                      e.preventDefault();
                      void toggleProjectExpanded(p);
                    }}
                    role="button"
                    aria-expanded={p.isExpanded}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
                        e.preventDefault();
                        void toggleProjectExpanded(p);
                      }
                    }}
                  >
                    {/* Client with chevron on left */}
                    <div className="pl-4 pr-2 py-2 text-[var(--text)] text-sm flex items-center gap-2 truncate" title={p.client || ''}>
                      <svg
                        className={`w-3 h-3 transition-transform ${p.isExpanded ? 'rotate-90' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"
                      >
                        <path d="M8 5l8 7-8 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="truncate">{p.client || ''}</span>
                    </div>
                    {/* Project name (no chevron) with status aligned to right */}
                    <div className="pr-2 py-2 text-[var(--text)] text-sm flex items-center" title={p.name}>
                      <div className="min-w-0 truncate">
                        {p.id ? (
                          <ProjectNameQuickViewButton projectId={p.id!}>{p.name}</ProjectNameQuickViewButton>
                        ) : (
                          <span className="truncate">{p.name}</span>
                        )}
                      </div>
                      <div className="relative ml-auto" data-dropdown onClick={(e) => e.stopPropagation()}>
                        <StatusBadge
                          status={(p.status as any) || 'active'}
                          // Always render the editable button variant for parity with Assignments
                          variant="editable"
                          onClick={() => p.id && statusDropdown.toggle(String(p.id))}
                          isUpdating={p.id ? projectStatus.isUpdating(p.id) : false}
                        />
                        {p.id && (
                          <StatusDropdown
                            currentStatus={(p.status as any) || 'active'}
                            isOpen={statusDropdown.isOpen(String(p.id))}
                            onSelect={async (newStatus) => {
                              if (!p.id) return;
                              try {
                                await projectStatus.updateStatus(p.id, newStatus);
                                setProjects(prev => prev.map(x => x.id === p.id ? { ...x, status: newStatus } : x));
                                statusDropdown.close();
                              } catch (e:any) {
                                showToast(e?.message || 'Failed to update status', 'error');
                              }
                            }}
                            onClose={statusDropdown.close}
                            projectId={p.id}
                            disabled={projectStatus.isUpdating(p.id)}
                            closeOnSelect={false}
                          />
                        )}
                      </div>
                    </div>
                    {/* Actions: add person (left) + refresh (right) to match Assignments */}
                    <div className="py-2 flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {/* Add person */}
                      <button
                        className="w-7 h-7 flex items-center justify-center text-[var(--text)] hover:text-[var(--text)] hover:bg-[var(--cardHover)] rounded"
                        onClick={() => { setIsAddingForProject(prev => prev === p.id ? null : p.id!); setPersonQuery(''); setPersonResults([]); setSelectedPersonIndex(-1); }}
                        title="Add person"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path d="M12 5v14M5 12h14" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                    {/* Week totals */}
                    {weeks.map((w) => {
                      const v = (hoursByProject[p.id!] || {})[w.date] || 0;
                      const entries = (deliverableTypesByProjectWeek[p.id!] || {})[w.date] || [];
                      return (
                    <div key={w.date} className="relative py-2 flex items-center justify-center text-[var(--text)] text-xs font-medium border-l border-[var(--border)]" title={(() => { const dtHeader = formatDateWithWeekday(w.date); const lines = entries.length ? entries.flatMap(e => { const ds = (e as any).dates as string[] | undefined; const base = `${e.percentage != null ? e.percentage + '% ' : ''}${e.type.toUpperCase()}`; if (ds && ds.length) { return ds.map(d => `${formatDateWithWeekday(d)} — ${base}`); } return [`${dtHeader} — ${base}`]; }).join('\n') : undefined; return lines; })()}>
                          {v > 0 ? v : ''}
                          {entries.length > 0 && (
                            <div className="absolute right-0 top-1 bottom-1 flex items-stretch gap-0.5 pr-[2px]">
                              {entries.slice(0,3).map((e, idx) => (
                                <div key={idx} className="w-[3px] rounded" style={{ background: typeColors[e.type] || 'var(--primary)' }} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Expanded assignment rows */}
                  {p.isExpanded && (
                    <div className="p-2">
                      {/* Add person row */}
                      {isAddingForProject === p.id && (
                        <>
                          <div className="pl-8 pr-2 py-1">
                            <input
                              type="text"
                              value={personQuery}
                              onChange={async (e) => {
                                const q = e.target.value;
                                setPersonQuery(q);
                                if (q.trim().length === 0) { setPersonResults([]); setSelectedPersonIndex(-1); return; }
                                try {
                                  const res = await peopleApi.autocomplete(q, 20);
                                  setPersonResults(res || []);
                                  setSelectedPersonIndex(res && res.length > 0 ? 0 : -1);
                                } catch {}
                              }}
                              onKeyDown={async (e) => {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedPersonIndex(i => Math.min(i+1, personResults.length-1)); }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedPersonIndex(i => Math.max(i-1, 0)); }
                                else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const sel = selectedPersonIndex >= 0 ? personResults[selectedPersonIndex] : null;
                                  if (sel && p.id) {
                                    try {
                                      const created = await assignmentsApi.create({ person: sel.id, project: p.id, weeklyHours: {} });
                                      setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: sortAssignmentsByProjectRole([...(x.assignments || []), created], rolesByDept) } : x));
                                      await refreshTotalsForProject(p.id);
                                      showToast('Person added to project', 'success');
                                      setIsAddingForProject(null); setPersonQuery(''); setPersonResults([]); setSelectedPersonIndex(-1);
                                    } catch (err:any) {
                                      showToast(err?.message || 'Failed to add person', 'error');
                                    }
                                  }
                                } else if (e.key === 'Escape') {
                                  setIsAddingForProject(null); setPersonQuery(''); setPersonResults([]); setSelectedPersonIndex(-1);
                                }
                              }}
                              placeholder="Search people by name..."
                              className="w-full h-7 bg-[var(--card)] border border-[var(--border)] rounded px-2 text-[var(--text)] text-xs"
                            />
                            {/* Dropdown */}
                            {personResults.length > 0 && (
                              <div className="mt-1 max-h-48 overflow-auto bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg">
                                {personResults.map((r, idx) => (
                                  <div
                                    key={r.id}
                                    className={`px-2 py-1 text-xs cursor-pointer ${idx===selectedPersonIndex ? 'bg-[var(--surfaceOverlay)] text-[var(--text)]' : 'text-[var(--text)] hover:bg-[var(--cardHover)]'}`}
                                    onMouseDown={async () => {
                                      if (!p.id) return;
                                      try {
                                        const created = await assignmentsApi.create({ person: r.id, project: p.id, weeklyHours: {} });
                                        setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: sortAssignmentsByProjectRole([...(x.assignments || []), created], rolesByDept) } : x));
                                        await refreshTotalsForProject(p.id);
                                        showToast('Person added to project', 'success');
                                      } catch (err:any) {
                                        showToast(err?.message || 'Failed to add person', 'error');
                                      } finally {
                                        setIsAddingForProject(null); setPersonQuery(''); setPersonResults([]); setSelectedPersonIndex(-1);
                                      }
                                    }}
                                  >
                                    {r.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="py-1"></div>
                          {weeks.map(w => (<div key={w.date}></div>))}
                        </>
                      )}
                      {/* Loading skeleton for assignments */}
                      {loadingAssignments.has(p.id!) && (
                        <>
                          <div className="pl-8 pr-2 py-2 text-[var(--muted)] text-xs italic col-span-3">Loading assignments…</div>
                          {weeks.map((w) => (
                            <div key={w.date} className="py-2 border-l border-[var(--border)]">
                              <div className="mx-auto w-10 h-4 bg-[var(--card)] animate-pulse rounded" />
                            </div>
                          ))}
                        </>
                      )}
                      {/* Render rows */}
                      {!loadingAssignments.has(p.id!) && p.assignments.map(asn => {
                        const rowKey = String(asn.id);
                        const rowIdx = rowIndexByKey.get(rowKey) ?? null;
                        return (
                        <div key={asn.id} className="grid gap-px py-1 bg-[var(--surface)] hover:bg-[var(--cardHover)] transition-colors" style={{ gridTemplateColumns: gridTemplate }}>
                          <div className="pl-8 pr-2 py-2 text-[var(--text)] text-xs truncate" title={asn.personName || String(asn.person)}>
                            {asn.personName || `Person #${asn.person}`}
                          </div>
                          <div className="pl-8 pr-2 py-2 text-[var(--muted)] text-xs truncate relative">
                            {(() => {
                              const deptId = (asn as any).personDepartmentId as number | null | undefined;
                              const label = (asn as any).roleName as string | null | undefined;
                              const currentId = (asn as any).roleOnProjectId as number | null | undefined;
                              return (
                                <>
                                  <button
                                    type="button"
                                    disabled={!deptId}
                                    className={`underline decoration-dotted underline-offset-2 ${deptId ? '' : 'text-[var(--muted)] cursor-not-allowed'}`}
                                    onClick={async (e) => {
                                      if (!deptId) return;
                                      roleAnchorRef.current = e.currentTarget as HTMLElement;
                                      setOpenRoleFor(openRoleFor === asn.id ? null : (asn.id || null));
                                      if (!rolesByDept[deptId]) {
                                        try {
                                          const roles = await listProjectRoles(deptId);
                                          setRolesByDept(prev => ({ ...prev, [deptId]: roles }));
                                        } catch {}
                                      }
                                    }}
                                  >
                                    {label || 'Set role'}
                                  </button>
                                  {openRoleFor === asn.id && deptId && (
                                    <div className="absolute mt-1">
                                      <RoleDropdown
                                        roles={rolesByDept[deptId] || []}
                                        currentId={currentId ?? null}
                                        onSelect={async (roleId, roleName) => {
                                          if (!asn.id || !p.id) return;
                                          // optimistic update + resort
                                          setProjects(prev => prev.map(x => {
                                            if (x.id !== p.id) return x;
                                            const updated = x.assignments.map(a => a.id === asn.id ? { ...a, roleOnProjectId: roleId, roleName } : a);
                                            return { ...x, assignments: sortAssignmentsByProjectRole(updated, rolesByDept) };
                                          }));
                                          try {
                                            await assignmentsApi.update(asn.id, { roleOnProjectId: roleId });
                                            showToast('Role updated', 'success');
                                          } catch (e:any) {
                                            // revert + resort
                                            setProjects(prev => prev.map(x => {
                                              if (x.id !== p.id) return x;
                                              const rolled = x.assignments.map(a => a.id === asn.id ? { ...a, roleOnProjectId: (currentId ?? null), roleName: (label ?? null) } : a);
                                              return { ...x, assignments: sortAssignmentsByProjectRole(rolled, rolesByDept) };
                                            }));
                                            showToast(e?.message || 'Failed to update role', 'error');
                                          } finally {
                                            setOpenRoleFor(null);
                                          }
                                        }}
                                        onClose={() => setOpenRoleFor(null)}
                                        anchorRef={roleAnchorRef as any}
                                      />
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <div className="py-2 flex items-center justify-center">
                            <button
                              className="w-5 h-5 flex items-center justify-center text-[var(--muted)] hover:text-red-400 hover:bg-red-500/20 rounded"
                              title="Remove assignment"
                              onClick={async () => {
                                if (!asn.id || !p.id) return;
                                try {
                                  await assignmentsApi.delete(asn.id);
                                  setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: x.assignments.filter(a => a.id !== asn.id) } : x));
                                  const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
                                  const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
                                  const res = await getProjectTotals([p.id!], { weeks: weeks.length, department: dept, include_children: inc });
                                  setHoursByProject(prev => ({ ...prev, [p.id!]: res.hoursByProject[String(p.id!)] || {} }));
                                  showToast('Assignment removed', 'success');
                                } catch (e:any) {
                                  showToast('Failed to remove assignment', 'error');
                                }
                              }}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {weeks.map((w, weekIndex) => {
                            const hours = Number((asn.weeklyHours || {})[w.date] || 0) || 0;
                            const key = `${asn.id}-${w.date}`;
                            const isEditing = !!editingCell && editingCell.rowKey === String(asn.id) && editingCell.weekKey === w.date;
                            const isSaving = savingCells.has(key);
                            const markers = (deliverableTypesByProjectWeek[p.id!] || {})[w.date] || [];
                            return (
                              <WeekCell
                                key={key}
                                projectId={p.id!}
                                assignmentId={asn.id!}
                                weekKey={w.date}
                                rowIndex={rowIdx}
                                weekIndex={weekIndex}
                                hours={hours}
                                isSelected={selection.isIndexSelected(rowIdx, weekIndex)}
                                isSaving={isSaving}
                                deliverableMarkers={markers}
                                typeColors={typeColors}
                                isEditing={isEditing}
                                editingSeed={isEditing ? editingSeed : null}
                                onBeginEditing={(assignmentId, weekKey, seed) => {
                                  setEditingCell({ rowKey: String(assignmentId), weekKey });
                                  setEditingSeed(seed ?? null);
                                }}
                                onCommitEditing={(assignmentId, weekKey, value) => {
                                  applyValueToSelection(assignmentId, weekKey, value);
                                }}
                                onCancelEditing={() => {
                                  setEditingCell(null);
                                  setEditingSeed(null);
                                }}
                                onMouseDown={(assignmentId, weekKey, e) => {
                                  selection.onCellMouseDown(String(assignmentId), weekKey, e as any);
                                }}
                                onMouseEnter={(assignmentId, weekKey) => {
                                  selection.onCellMouseEnter(String(assignmentId), weekKey);
                                }}
                                onSelect={(assignmentId, weekKey, isShiftClick) => {
                                  selection.onCellSelect(String(assignmentId), weekKey, isShiftClick);
                                }}
                              />
                            );
                          })}
                        </div>
                      ); })}
                      {/* Empty state */}
                      {!loadingAssignments.has(p.id!) && p.assignments.length === 0 && (
                        <div className="grid gap-px py-1 bg-[var(--surface)]" style={{ gridTemplateColumns: gridTemplate }}>
                          <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2">
                            <div className="text-[var(--muted)] text-xs italic">No assignments</div>
                          </div>
                          <div></div>
                          {weeks.map((week) => (
                            <div key={week.date} className="flex items-center justify-center">
                              <div className="w-12 h-6 flex items-center justify-center text-[var(--muted)] text-xs">-</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Status Bar (Utilization Legend) */}
          {false && (
          <div className="flex justify-between items-center text-xs text-[var(--muted)] px-1 mt-2">
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span>{`Available (${legendLabels.green})`}</span>
                <span>Available (â‰¤70%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span>{`Busy (${legendLabels.blue})`}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <span>{`Full (${legendLabels.orange})`}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span>{`Overallocated (${legendLabels.red})`}</span>
              </div>
            </div>
          </div>
          )}

          {/* Selection live region for a11y */}
          <div aria-live="polite" className="sr-only">{selection.selectionSummary}</div>
        </div>
      </div>
    </>
  );

  let content: React.ReactNode;
  if (error) {
    content = (
      <div className="flex-1 flex items-center justify-center px-6 py-8 text-[var(--muted)]">
        <div>
          <p className="text-center text-sm mb-4">{error}</p>
          <div className="flex justify-center">
            <button
              type="button"
              className="px-4 py-2 rounded bg-[var(--primary)] text-white text-sm"
              onClick={() => setReloadCounter(c => c + 1)}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  } else if (loading && projects.length === 0) {
    content = (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)] text-sm">
        Loading project assignments…
      </div>
    );
  } else {
    content = isMobileLayout ? mobileView : desktopView;
  }

  return (
    <Layout>
      <div className="flex flex-col flex-1 min-h-0">
        {content}
      </div>
    </Layout>
  );
};

export default ProjectAssignmentsGrid;

const MobileSheet: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({ open, title, onClose, children }) => {
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const [supportsSVH, setSupportsSVH] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.CSS === 'undefined') return false;
    return window.CSS.supports('height: 100svh');
  });
  useEffect(() => {
    if (supportsSVH || typeof window === 'undefined' || typeof window.CSS === 'undefined') return;
    setSupportsSVH(window.CSS.supports('height: 100svh'));
  }, [supportsSVH]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => dialogRef.current?.focus(), 0);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const overlayStyle: React.CSSProperties = supportsSVH ? { minHeight: '100svh' } : undefined;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[1000] bg-black/60 flex items-end justify-center"
      style={overlayStyle}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-2xl max-h-[85vh] overflow-auto px-4"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="font-semibold">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close sheet" className="text-lg leading-none text-[var(--muted)]">×</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};
