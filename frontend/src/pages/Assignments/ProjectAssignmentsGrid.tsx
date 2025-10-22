import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
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
import { assignmentsApi, peopleApi, deliverablesApi, projectsApi } from '@/services/api';
import StatusBadge from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
import { useProjectStatusSubscription } from '@/components/projects/useProjectStatusSubscription';
import { useCapabilities } from '@/hooks/useCapabilities';
import { subscribeGridRefresh } from '@/lib/gridRefreshBus';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { defaultUtilizationScheme } from '@/util/utilization';
import RoleDropdown from '@/roles/components/RoleDropdown';
import { listProjectRoles, type ProjectRole } from '@/roles/api';
import { getFlag } from '@/lib/flags';
import { useTopBarSlots } from '@/components/layout/TopBarSlots';
import { useLayoutDensity } from '@/components/layout/useLayoutDensity';
import WeeksSelector from '@/components/compact/WeeksSelector';
import StatusFilterChips from '@/components/compact/StatusFilterChips';
import HeaderActions from '@/components/compact/HeaderActions';
import { buildAssignmentsLink } from '@/pages/Assignments/grid/linkUtils';
import TopBarPortal from '@/components/layout/TopBarPortal';

// Project Assignments Grid (scaffold)
// Prescriptive: lean, best-practice; no client-side week calculations.
// Week header placeholder only; wired to server weekKeys in Step 4.

const ProjectAssignmentsGrid: React.FC = () => {
  const { state: deptState } = useDepartmentFilter();
  const [weeks, setWeeks] = useState<WeekHeader[]>([]);
  // Manual sorting state
  const [sortBy, setSortBy] = useState<'client' | 'project' | 'deliverable'>('client');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Projects state must be defined before any hook closures that read it
  type ProjectWithAssignments = Project & { assignments: Assignment[]; isExpanded: boolean };
  const [projects, setProjects] = useState<ProjectWithAssignments[]>([]);
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
  const legendLabels = React.useMemo(() => {
    const s = schemeData ?? defaultUtilizationScheme;
    if (s.mode === 'absolute_hours') {
      return {
        green: `${s.green_min}-${s.green_max}h`,
        blue: `${s.blue_min}-${s.blue_max}h`,
        orange: `${s.orange_min}-${s.orange_max}h`,
        red: `${s.red_min}h+`,
      } as const;
    }
    return { green: '70-85%', blue: '=70%', orange: '85-100%', red: '>100%' } as const;
  }, [schemeData]);

  const [hoursByProject, setHoursByProject] = useState<Record<number, Record<string, number>>>({});
  const [loadingTotals, setLoadingTotals] = useState<Set<number>>(new Set());
  const [deliverablesByProjectWeek, setDeliverablesByProjectWeek] = useState<Record<number, Record<string, number>>>({});
  const [hasFutureDeliverablesByProject, setHasFutureDeliverablesByProject] = useState<Set<number>>(new Set());
  // Deliverable types per project/week for vertical bar rendering
  const [deliverableTypesByProjectWeek, setDeliverableTypesByProjectWeek] = useState<Record<number, Record<string, { type: string; percentage?: number }[]>>>({});
  const [loadingAssignments, setLoadingAssignments] = useState<Set<number>>(new Set());
  const [weeksHorizon, setWeeksHorizon] = useState<number>(20);
  const [editingCell, setEditingCell] = useState<{ rowKey: string; weekKey: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  // Role dropdown state
  const [openRoleFor, setOpenRoleFor] = useState<number | null>(null);
  const roleAnchorRef = useRef<HTMLElement | null>(null);
  const [rolesByDept, setRolesByDept] = useState<Record<number, ProjectRole[]>>({});
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
  const { setLeft, setRight, clearLeft, clearRight } = useTopBarSlots();
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
  const statusFilterOptions = ['active', 'active_ca', 'on_hold', 'completed', 'cancelled', 'active_no_deliverables', 'Show All'] as const;
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
      const rows = (resp as any).results || [];
      setProjects(prev => prev.map(p => (p.id === projectId ? { ...p, assignments: rows } : p)));
      showToast('Project assignments refreshed', 'success');
    } catch (e: any) {
      showToast('Failed to refresh project assignments: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      setLoadingAssignments(prev => { const n = new Set(prev); n.delete(projectId); return n; });
    }
  };

  // Refresh assignments for all projects (both expanded and collapsed)
  const refreshAllAssignments = async () => {
    if (projects.length === 0) {
      showToast('No projects available to refresh', 'warning');
      return;
    }

    try {
      // Refresh assignments for all projects in parallel
      await Promise.all(
        projects.map(project => refreshProjectAssignments(project.id!))
      );
      showToast(`Refreshed assignments for all ${projects.length} projects`, 'success');
    } catch (error) {
      showToast('Failed to refresh some project assignments', 'error');
    }
  };

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
          if ((['active','active_ca','on_hold','completed','cancelled','active_no_deliverables','Show All'] as const).includes(tok)) set.add(tok);
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
        const statusIn = hasShowAll ? undefined : statuses.filter(s => s !== 'active_no_deliverables' && s !== 'Show All').join(',') || undefined;
        const hasFutureParam = (!hasShowAll && hasNoDelivs && statuses.length === 1) ? 0 : undefined;
        const snap = await getProjectGridSnapshot({ weeks: weeksHorizon, department: dept, include_children: inc, status_in: statusIn, has_future_deliverables: hasFutureParam });
        if (!mounted) return;
        setWeeks(toWeekHeader(snap.weekKeys || []));
        // Normalize projects from snapshot
        const fromSnapshot: ProjectWithAssignments[] = (snap.projects || [])
          .map(p => ({ id: p.id, name: p.name, client: p.client ?? undefined, status: p.status ?? undefined, assignments: [], isExpanded: false }));

        // Augment with projects that match filters even if they currently have no assignments in the snapshot
        // When status filter is only "active_no_deliverables" we rely solely on the snapshot (needs server data)
        let augmented: ProjectWithAssignments[] = fromSnapshot;
        try {
          const onlyNoDelivs = (!hasShowAll && hasNoDelivs && statuses.length === 1);
          if (!onlyNoDelivs) {
            const allProjects = await projectsApi.listAll();
            const allowAllStatuses = hasShowAll || statuses.length === 0;
            const allowed = new Set((statuses || []).filter(s => s !== 'active_no_deliverables' && s !== 'Show All').map(s => s.toLowerCase()));
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
        setProjects(proj);
        // Coerce hours map keys to numbers
        const hb: Record<number, Record<string, number>> = {};
        Object.entries(snap.hoursByProject || {}).forEach(([pid, wk]) => { hb[Number(pid)] = wk; });
        setHoursByProject(hb);
        // Deliverables maps
        const dbw: Record<number, Record<string, number>> = {};
        Object.entries(snap.deliverablesByProjectWeek || {}).forEach(([pid, wk]) => { dbw[Number(pid)] = wk; });
        setDeliverablesByProjectWeek(dbw);
        const future = new Set<number>();
        Object.entries(snap.hasFutureDeliverablesByProject || {}).forEach(([pid, val]) => { if (val) future.add(Number(pid)); });
        setHasFutureDeliverablesByProject(future);

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
                  const rows = (resp as any).results || [];
                  setProjects(prev => prev.map(x => x.id === pid ? { ...x, assignments: rows, isExpanded: true } : x));
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

  // --- Deliverable Coloring (reuse calendar colors) ---
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
  const classifyDeliverable = (title?: string | null): string => {
    const t = (title || '').toLowerCase();
    if (/(\b)bulletin(\b)/.test(t)) return 'bulletin';
    if (/(\b)cd(\b)/.test(t)) return 'cd';
    if (/(\b)dd(\b)/.test(t)) return 'dd';
    if (/(\b)ifc(\b)/.test(t)) return 'ifc';
    if (/(\b)ifp(\b)/.test(t)) return 'ifp';
    if (/(master ?plan)/.test(t)) return 'masterplan';
    if (/(\b)sd(\b)/.test(t)) return 'sd';
    return 'milestone';
  };

  // Load deliverables for visible window and map to week keys per project
  useEffect(() => {
    const run = async () => {
      try {
        if (!weeks || weeks.length === 0 || !projects || projects.length === 0) return;
        const last = weeks[weeks.length - 1].date;
        const endDate = new Date(last); endDate.setDate(endDate.getDate() + 6);
        const weekRanges = weeks.map(w => { const s = new Date(w.date); const e = new Date(w.date); e.setDate(e.getDate() + 6); return { key: w.date, s, e }; });

        const pidList = projects.map(p => p.id!).filter(Boolean) as number[];
        const map: Record<number, Record<string, { type: string; percentage?: number }[]>> = {};

        // Helper to add a bar entry once (dedupe by type+percentage)
        const addEntry = (pid: number, weekKey: string, type: string, percentage?: number) => {
          if (!map[pid]) map[pid] = {};
          if (!map[pid][weekKey]) map[pid][weekKey] = [];
          const arr = map[pid][weekKey];
          const numPct = (percentage == null || Number.isNaN(Number(percentage))) ? undefined : Number(percentage);
          // If an entry of this type exists, prefer the one that has a numeric percentage
          const existing = arr.find(e => e.type === type);
          if (existing) {
            // Upgrade undefined -> numeric if we now have a better value
            if ((existing.percentage == null) && (numPct != null)) {
              existing.percentage = numPct;
            }
            // If both numeric and equal, do nothing; if different numeric values, allow another bar
            else if (existing.percentage != null && numPct != null && existing.percentage !== numPct) {
              if (!arr.some(e => e.type === type && e.percentage === numPct)) {
                arr.push({ type, percentage: numPct });
              }
            }
            // If new has no percentage or equals existing, skip
            return;
          }
          // No existing of this type
          arr.push({ type, percentage: numPct });
        };

        // Try bulk API first; if it fails, continue with calendar fallback silently
        let bulk: Record<string, any[]> = {};
        try {
          bulk = await deliverablesApi.bulkList(pidList);
        } catch (e) {
          // swallow; backend may not support bulk endpoint in this environment
          bulk = {};
        }

        for (const [pidStr, list] of Object.entries(bulk || {})) {
          const pid = Number(pidStr);
          for (const d of (list || [])) {
            if (!d?.date) continue;
            const dt = new Date(d.date);
            const wr = weekRanges.find(r => dt >= r.s && dt <= r.e);
            if (!wr) continue;
            const type = classifyDeliverable((d.description || '').toString());
            addEntry(pid, wr.key, type, d.percentage == null ? undefined : Number(d.percentage));
          }
        }

        // If bulk returned nothing, try per-project listAll to obtain real percentages
        if (Object.keys(map).length === 0) {
          try {
            const lists = await Promise.all(pidList.map(async (pid) => {
              try { return [pid, await deliverablesApi.listAll(pid)] as const; } catch { return [pid, []] as const; }
            }));
            for (const [pid, list] of lists) {
              for (const d of (list || [])) {
                if (!d?.date) continue;
                const dt = new Date(d.date);
                const wr = weekRanges.find(r => dt >= r.s && dt <= r.e); if (!wr) continue;
                const type = classifyDeliverable((d.description || '').toString());
                addEntry(pid, wr.key, type, d.percentage == null ? undefined : Number(d.percentage));
              }
            }
          } catch {}
        }

        // Fallback to calendar to fill any missing weeks OR when still empty
        const needsCalendar = Object.keys(map).length === 0 || projects.some(p => weekRanges.some(wr => !(map[p.id!] && map[p.id!][wr.key])));
        if (needsCalendar) {
          const start = weeks[0].date; const end = endDate.toISOString().slice(0, 10);
          try {
            const items = await deliverablesApi.calendar(start, end);
            for (const it of (items || [])) {
              const pid = (it as any).project as number | undefined; const dtStr = (it as any).date as string | undefined;
              if (!pid || !dtStr) continue; const dt = new Date(dtStr);
              const wr = weekRanges.find(r => dt >= r.s && dt <= r.e); if (!wr) continue;
              const title = (it as any).title as string | undefined; const type = classifyDeliverable(title);
              let pct: number | undefined = undefined; if (title) { const m = title.match(/(\d{1,3})\s*%/); if (m) { const n = parseInt(m[1], 10); if (!Number.isNaN(n) && n >= 0 && n <= 100) pct = n; } }
              addEntry(pid, wr.key, type, pct);
            }
          } catch {}
        }

        setDeliverableTypesByProjectWeek(map);
      } catch { /* ignore */ }
    };
    run();
  }, [weeks, projects]);

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
        setEditingCell({ rowKey: String(active.rowKey), weekKey: active.weekKey });
        setEditingValue(e.key);
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

  // Apply a numeric value to the current selection (or active cell)
  const applyValueToSelection = React.useCallback(async (anchorAssignmentId: number, anchorWeekKey: string, value: number) => {
    const v = value;
    if (Number.isNaN(v) || v < 0) { showToast('Enter a valid non-negative number', 'warning'); return; }

    // Determine target cells
    const selected = selection.selectedCells.length > 0
      ? selection.selectedCells
      : [{ rowKey: String(anchorAssignmentId), weekKey: anchorWeekKey }];

    // Build assignments map
    const assignmentsById = new Map<number, { projectId: number, assignment: Assignment, personId: number | null }>();
    projects.forEach(pr => {
      pr.assignments.forEach(a => { if (a?.id != null) assignmentsById.set(a.id, { projectId: pr.id!, assignment: a, personId: (a.person as any) ?? null }); });
    });

    // Prepare updates
    const updatesMap = new Map<number, { prev: Record<string, number>, next: Record<string, number>, weeks: Set<string>, personId: number | null, projectId: number }>();
    const touchedProjects = new Set<number>();
    for (const c of selected) {
      const aid = parseInt(c.rowKey, 10);
      if (Number.isNaN(aid)) continue;
      const entry = assignmentsById.get(aid);
      if (!entry) continue;
      touchedProjects.add(entry.projectId);
      const prev = updatesMap.get(aid)?.prev || { ...(entry.assignment.weeklyHours || {}) };
      const next = updatesMap.get(aid)?.next || { ...(entry.assignment.weeklyHours || {}) };
      next[c.weekKey] = v;
      const weeksSet = updatesMap.get(aid)?.weeks || new Set<string>();
      weeksSet.add(c.weekKey);
      updatesMap.set(aid, { prev, next, weeks: weeksSet, personId: entry.personId, projectId: entry.projectId });
    }

    // Fire conflict checks in background (parallel)
    try {
      const tasks: Promise<any>[] = [];
      for (const [, info] of updatesMap.entries()) {
        const personId = info.personId ?? null;
        if (!personId) continue;
        for (const wk of info.weeks) {
          tasks.push(assignmentsApi.checkConflicts(personId, info.projectId, wk, v).catch(() => null));
        }
      }
      Promise.allSettled(tasks).then(results => {
        const warnings: string[] = [];
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value && Array.isArray(r.value.warnings) && r.value.warnings.length) {
            warnings.push(...r.value.warnings);
          }
        }
        if (warnings.length) showToast(warnings.join('\n'), 'warning');
      });
    } catch {}

    // Optimistic UI + saving flags
    const savingKeys: string[] = [];
    updatesMap.forEach((info, aid) => { info.weeks.forEach(wk => savingKeys.push(`${aid}-${wk}`)); });
    setSavingCells(prevSet => { const s = new Set(prevSet); savingKeys.forEach(k => s.add(k)); return s; });
    setProjects(prevState => prevState.map(x => {
      if (!touchedProjects.has(x.id!)) return x;
      return { ...x, assignments: x.assignments.map(a => { if (!a.id || !updatesMap.has(a.id)) return a; const info = updatesMap.get(a.id)!; return { ...a, weeklyHours: info.next }; }) };
    }));

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
        return { ...x, assignments: x.assignments.map(a => { if (!a.id || !updatesMap.has(a.id)) return a; const info = updatesMap.get(a.id)!; return { ...a, weeklyHours: info.prev }; }) };
      }));
      showToast(err?.message || 'Failed to update hours', 'error');
    } finally {
      setSavingCells(prevSet => { const s = new Set(prevSet); savingKeys.forEach(k => s.delete(k)); return s; });
      setEditingCell(null);
    }
  }, [selection.selectedCells, projects, deptState.selectedDepartmentId, deptState.includeChildren, weeks, assignmentsApi, getProjectTotals]);

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
          if (!ac && bc) return 1 * factor; // empty last in asc
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
      // deliverable: earliest next deliverable in visible window
      const ai = getNextDeliverableIndex(a.id);
      const bi = getNextDeliverableIndex(b.id);
      if (ai !== bi) return (ai - bi) * factor;
      // tie-breaker: client, then name
      const ac = (a.client || '').toString().trim().toLowerCase();
      const bc = (b.client || '').toString().trim().toLowerCase();
      if (ac !== bc) return ac.localeCompare(bc) * factor;
      const an = (a.name || '').toString().trim().toLowerCase();
      const bn = (b.name || '').toString().trim().toLowerCase();
      return an.localeCompare(bn) * factor;
    });
    return list;
  }, [projects, sortBy, sortDir, weeks, deliverableTypesByProjectWeek]);

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
              const rows = (resp as any).results || [];
              setProjects(prev2 => prev2.map(x => x.id === pid ? { ...x, assignments: rows, isExpanded: true } : x));
            } catch {}
            finally {
              setLoadingAssignments(prev2 => { const n = new Set(prev2); n.delete(pid); return n; });
            }
          })();
        }
      }
    } catch {}
  }, [location.search]);
  return (
    <Layout>
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
                    onClick={async () => {
                      const willExpand = !p.isExpanded;
                      setProjects(prev => prev.map(x => x.id === p.id ? { ...x, isExpanded: !x.isExpanded } : x));
                      // Sync expanded ids to URL
                      try {
                        const current = new Set<number>(projects.filter(x => x.isExpanded).map(x => x.id!));
                        if (p.id) {
                          if (willExpand) current.add(p.id); else current.delete(p.id);
                          url.set('expanded', Array.from(current).join(','));
                        }
                      } catch {}
                      // Lazy-load assignments on expand
                      if (willExpand && p.id && (p.assignments.length === 0) && !loadingAssignments.has(p.id)) {
                        setLoadingAssignments(prev => new Set(prev).add(p.id!));
                        try {
                          const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
                          const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
                          const resp = await assignmentsApi.list({ project: p.id, department: dept, include_children: inc } as any);
                          const rows = (resp as any).results || [];
                          setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: rows } : x));
                        } catch (e:any) {
                          showToast('Failed to load assignments', 'error');
                          setProjects(prev => prev.map(x => x.id === p.id ? { ...x, isExpanded: false } : x));
                        } finally {
                          setLoadingAssignments(prev => { const n = new Set(prev); n.delete(p.id!); return n; });
                        }
                      }
                    }}
                    role="button"
                    aria-expanded={p.isExpanded}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Spacebar') {
                        e.preventDefault();
                        setProjects(prev => prev.map(x => x.id === p.id ? { ...x, isExpanded: !x.isExpanded } : x));
                      } else if (e.key === 'Enter') {
                        setProjects(prev => prev.map(x => x.id === p.id ? { ...x, isExpanded: !x.isExpanded } : x));
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
                        <span className="truncate">{p.name}</span>
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
                        <div key={w.date} className="relative py-2 flex items-center justify-center text-[var(--text)] text-xs font-medium border-l border-[var(--border)]" title={entries.length ? entries.map(e => `${e.percentage != null ? e.percentage + '% ' : ''}${e.type.toUpperCase()}`).join('\n') : undefined}>
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
                                      setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: [...x.assignments, created] } : x));
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
                                        setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: [...x.assignments, created] } : x));
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
                      {!loadingAssignments.has(p.id!) && p.assignments.map(asn => (
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
                                          // optimistic update
                                          setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: x.assignments.map(a => a.id === asn.id ? { ...a, roleOnProjectId: roleId, roleName } : a) } : x));
                                          try {
                                            await assignmentsApi.update(asn.id, { roleOnProjectId: roleId });
                                            showToast('Role updated', 'success');
                                          } catch (e:any) {
                                            // revert
                                            setProjects(prev => prev.map(x => x.id === p.id ? { ...x, assignments: x.assignments.map(a => a.id === asn.id ? { ...a, roleOnProjectId: currentId ?? null, roleName: label ?? null } : a) } : x));
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
                          {weeks.map(w => {
                            const hours = Number((asn.weeklyHours || {})[w.date] || 0) || 0;
                            const key = `${asn.id}-${w.date}`;
                            const isEditing = editingCell && editingCell.rowKey === String(asn.id) && editingCell.weekKey === w.date;
                            const isSaving = savingCells.has(key);
                            return (
                              <div
                                key={key}
                                className={`relative cursor-pointer transition-colors border-l border-[var(--border)] ${selection.isCellSelected(String(asn.id), w.date) ? 'bg-[var(--surfaceOverlay)] border-[var(--primary)]' : 'hover:bg-[var(--surfaceHover)]'}`}
                                onMouseDown={(e) => { e.preventDefault(); selection.onCellMouseDown(String(asn.id), w.date, e as any); }}
                                onMouseEnter={() => selection.onCellMouseEnter(String(asn.id), w.date)}
                                onClick={(e) => selection.onCellSelect(String(asn.id), w.date, (e as any).shiftKey)}
                                onDoubleClick={() => { setEditingCell({ rowKey: String(asn.id), weekKey: w.date }); setEditingValue(hours ? String(hours) : ''); }}
                                aria-selected={selection.isCellSelected(String(asn.id), w.date)}
                                title={(() => { const entries = (deliverableTypesByProjectWeek[p.id!] || {})[w.date] || []; return entries.length ? entries.map(e => `${e.percentage != null ? e.percentage + '% ' : ''}${e.type.toUpperCase()}`).join('\n') : undefined; })()}
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (isEditing) return;
                                  // Start editing when user types a number
                                  if (/^[0-9]$/.test(e.key)) {
                                    e.preventDefault();
                                    setEditingCell({ rowKey: String(asn.id), weekKey: w.date });
                                    setEditingValue(e.key);
                                    return;
                                  }
                                  if (e.key === '.' || e.key === 'Decimal') {
                                    e.preventDefault();
                                    setEditingCell({ rowKey: String(asn.id), weekKey: w.date });
                                    setEditingValue('0.');
                                    return;
                                  }
                                  const idx = weeks.findIndex(xx => xx.date === w.date);
                                  if (e.key === 'ArrowLeft' && idx > 0) {
                                    selection.onCellSelect(String(asn.id), weeks[idx-1].date);
                                  } else if (e.key === 'ArrowRight' && idx < weeks.length - 1) {
                                    selection.onCellSelect(String(asn.id), weeks[idx+1].date);
                                  } else if (e.key === 'Enter') {
                                    setEditingCell({ rowKey: String(asn.id), weekKey: w.date }); setEditingValue(hours ? String(hours) : '');
                                  } else if (e.key === 'Escape') {
                                    selection.clearSelection();
                                  }
                                }}
                              >
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onKeyDown={async (e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const v = parseFloat(editingValue);
                                        await applyValueToSelection(asn.id!, w.date, v);
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setEditingCell(null);
                                      }
                                    }}
                                    className="w-full h-8 px-1 text-xs bg-[var(--bg)] text-[var(--text)] font-medium border border-[var(--primary)] rounded focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield] [appearance:textfield] text-center"
                                  />
                                ) : (
                                  <div className="h-8 flex items-center justify-center text-xs text-[var(--text)] font-medium">
                                    {hours > 0 ? hours : ''}
                                  </div>
                                )}
                                {((deliverableTypesByProjectWeek[p.id!] || {})[w.date] || []).length > 0 && (
                                  <div className="absolute right-0 top-1 bottom-1 flex items-stretch gap-0.5 pr-[2px] pointer-events-none">
                                    {((deliverableTypesByProjectWeek[p.id!] || {})[w.date] || []).slice(0,3).map((e, idx) => (
                                      <div key={idx} className="w-[3px] rounded" style={{ background: typeColors[e.type] || 'var(--primary)' }} />
                                    ))}
                                  </div>
                                )}
                                {isSaving && (
                                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="inline-block w-3 h-3 border-2 border-[var(--muted)] border-t-transparent rounded-full animate-spin" />
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
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
    </Layout>
  );
};

export default ProjectAssignmentsGrid;


