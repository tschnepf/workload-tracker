/**
 * Assignment Grid - Real implementation of the spreadsheet-like assignment interface
 * Replaces the form-based AssignmentForm with a modern grid view
 */

import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { useQueryClient } from '@tanstack/react-query';
import { Assignment, Person, Deliverable, Project } from '@/types/models';
import { assignmentsApi, peopleApi, deliverablesApi, projectsApi, jobsApi } from '@/services/api';
import { useCapabilities } from '@/hooks/useCapabilities';
// status controls composed via useStatusControls
import { useProjectStatusSubscription } from '@/components/projects/useProjectStatusSubscription';

// Enhanced project interface with loading states for status operations
interface ProjectWithState extends Project {
  isUpdating?: boolean;
  lastUpdated?: number;
}
import Layout from '@/components/layout/Layout';
import AssignmentsSkeleton from '@/components/skeletons/AssignmentsSkeleton';
import { useGridUrlState } from '@/pages/Assignments/grid/useGridUrlState';
import { toWeekHeader } from '@/pages/Assignments/grid/utils';
import Toast from '@/components/ui/Toast';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
// header filter included by HeaderBarComp
import { subscribeGridRefresh } from '@/lib/gridRefreshBus';
import { useUtilizationScheme } from '@/hooks/useUtilizationScheme';
import { getUtilizationPill, defaultUtilizationScheme } from '@/util/utilization';

// In-file grid column widths hook moved to grid/useGridColumnWidths

import PersonGroupHeaderComp from '@/pages/Assignments/grid/components/PersonGroupHeader';
import AssignmentRowComp from '@/pages/Assignments/grid/components/AssignmentRow';
import PeopleSection from '@/pages/Assignments/grid/components/PeopleSection';
import { updateAssignmentRoleAction } from '@/pages/Assignments/grid/useAssignmentRoleUpdate';
import WeekHeaderComp from '@/pages/Assignments/grid/components/WeekHeader';
import AddAssignmentRow from '@/pages/Assignments/grid/components/AddAssignmentRow';
import { useProjectAssignmentAdd } from '@/pages/Assignments/grid/useProjectAssignmentAdd';
import HeaderBarComp from '@/pages/Assignments/grid/components/HeaderBar';
import { useGridColumnWidthsAssign } from '@/pages/Assignments/grid/useGridColumnWidths';
import { useCellSelection } from '@/pages/Assignments/grid/useCellSelection';
import StatusBar from '@/pages/Assignments/grid/components/StatusBar';
import { useStatusControls } from '@/pages/Assignments/grid/useStatusControls';
import { useEditingCell as useEditingCellHook } from '@/pages/Assignments/grid/useEditingCell';
// useWeekHeaders is managed inside useAssignmentsSnapshot
import { useAssignmentsSnapshot } from '@/pages/Assignments/grid/useAssignmentsSnapshot';
import { useGridKeyboardNavigation } from '@/pages/Assignments/grid/useGridKeyboardNavigation';
import { useDeliverablesIndex } from '@/pages/Assignments/grid/useDeliverablesIndex';
import { useScrollSync } from '@/pages/Assignments/grid/useScrollSync';
import { useProjectStatusFilters } from '@/pages/Assignments/grid/useProjectStatusFilters';
import { getFlag } from '@/lib/flags';
import { useTopBarSlots } from '@/components/layout/TopBarSlots';
import { useLayoutDensity } from '@/components/layout/useLayoutDensity';
import WeeksSelector from '@/components/compact/WeeksSelector';
import StatusFilterChips from '@/components/compact/StatusFilterChips';
import HeaderActions from '@/components/compact/HeaderActions';
import { buildProjectAssignmentsLink } from '@/pages/Assignments/grid/linkUtils';
import TopBarPortal from '@/components/layout/TopBarPortal';
import DeliverableLegendFloating from '@/components/deliverables/DeliverableLegendFloating';

// Deliverable utilities moved to '@/util/deliverables' and used by WeekCell.

// (WeekCell moved to grid/components/WeekCell)


interface PersonWithAssignments extends Person {
  assignments: Assignment[];
  isExpanded: boolean;
}
// Removed local Monday computation - weeks come from server snapshot only.

const AssignmentGrid: React.FC = () => {
  const queryClient = useQueryClient();
  const { state: deptState, backendParams } = useDepartmentFilter();
  
  // Pub-sub system for cross-component status updates
  const { emitStatusChange } = useProjectStatusSubscription({
    debug: process.env.NODE_ENV === 'development'
  });
  const [people, setPeople] = useState<PersonWithAssignments[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignmentsData, setAssignmentsData] = useState<Assignment[]>([]);
  const [projectsData, setProjectsData] = useState<Project[]>([]);
  // Snapshot/rendering mode and aggregated hours
  const [hoursByPerson, setHoursByPerson] = useState<Record<number, Record<string, number>>>({});
  // isSnapshotMode provided by useAssignmentsSnapshot
  // Weeks header: from grid snapshot when available; fallback to 12 Mondays
  // (state moved up near other snapshot states)
  // On-demand detail loading flags
  const [loadedAssignmentIds, setLoadedAssignmentIds] = useState<Set<number>>(new Set());
  const [loadingAssignments, setLoadingAssignments] = useState<Set<number>>(new Set());
  // Grid snapshot aggregation state (declared above)
  
  // Enhanced memoized projectsById map with loading states and type safety
  const projectsById = useMemo(() => {
    const m = new Map<number, ProjectWithState>();
    for (const p of projectsData || []) {
      if (p?.id) {
        m.set(p.id, { ...p, isUpdating: false });
      }
    }
    return m;
  }, [projectsData]);
  
  // Toast state (used by status controls)
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => { setToast({ message, type }); };

  // Status controls (dropdown + project status updates)
  const { statusDropdown, projectStatus, getProjectStatus, handleStatusChange } = useStatusControls({
    projectsById,
    setProjectsData: setProjectsData as any,
    emitStatusChange,
    showToast,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addUI = useProjectAssignmentAdd({
    search: (query) => searchProjects(query),
    onAdd: (personId, project) => addAssignment(personId, project),
  });
  const { editingCell, setEditingCell, editingValue, setEditingValue, startEditing, cancelEdit, sanitizeHours } = useEditingCellHook();
  const caps = useCapabilities();
  // Async job state for snapshot generation
  // async job state provided by useAssignmentsSnapshot
  // New multi-select project status filters (aggregate selection)
  const { statusFilterOptions, selectedStatusFilters, formatFilterStatus, toggleStatusFilter, matchesStatusFilters } = useProjectStatusFilters(deliverables);

  const handleAssignmentRoleChange = async (personId: number, assignmentId: number, roleId: number | null, roleName: string | null) => {
    await updateAssignmentRoleAction({
      assignmentsApi,
      setPeople: setPeople as any,
      setAssignmentsData: setAssignmentsData as any,
      people: people as any,
      personId,
      assignmentId,
      roleId,
      roleName,
      showToast,
    });
  };

  const [weeksHorizon, setWeeksHorizon] = useState<number>(20);
  // Weeks header: from grid snapshot when available (server weekKeys only)
  const snapshot = useAssignmentsSnapshot({
    weeksHorizon,
    departmentId: deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId),
    includeChildren: deptState.includeChildren,
    capsAsyncJobs: (useMemo(() => caps.data?.asyncJobs ?? false, [caps.data]) as boolean),
    assignmentsApi,
    peopleApi,
    deliverablesApi,
    projectsApi,
    jobsApi,
    setPeople,
    setAssignmentsData,
    setProjectsData: setProjectsData as any,
    setDeliverables,
    setHoursByPerson,
    subscribeGridRefresh,
    trackPerformanceEvent,
    showToast,
    setError,
    setLoading,
  });
  const { weeks, isSnapshotMode, loadData, asyncJob } = snapshot;
  // Compact header feature: inject controls into global top bar
  const compact = getFlag('COMPACT_ASSIGNMENT_HEADERS', true);
  const { setLeft, setRight, clearLeft, clearRight } = useTopBarSlots();
  const { setMainPadding } = useLayoutDensity();
  // Ensure the grid header hugs the top/side edges when compact mode is on
  // by switching the Layout "density" to compact (removes main padding).
  useLayoutEffect(() => {
    if (compact) setMainPadding('compact');
    return () => setMainPadding('default');
    // Only depends on compact flag and setter
  }, [compact, setMainPadding]);
  // topBarHeader is defined later after handlers
  // Selection state via useCellSelection
  const weekKeys = useMemo(() => weeks.map(w => w.date), [weeks]);
  const rowKeyFor = (personId: number, assignmentId: number) => `${personId}:${assignmentId}`;
  const {
    selectedCell: selCell,
    selectedCells: selCells,
    selectionStart: selStart,
    isDragging: isDraggingSel,
    onCellMouseDown: csMouseDown,
    onCellMouseEnter: csMouseEnter,
    onCellSelect: csSelect,
    clearSelection: csClear,
    isCellSelected: csIsSelected,
    selectionSummary,
  } = useCellSelection(weekKeys, useMemo(() => {
    const out: string[] = [];
    try {
      const now = new Date();
      const projectHasFutureDeliverables = new Map<number, boolean>();
      (deliverables || []).forEach((d: any) => {
        if (d?.project && d?.date) {
          const dt = new Date(d.date);
          if (dt >= now) projectHasFutureDeliverables.set(d.project, true);
        }
      });
      for (const person of people || []) {
        if (!person?.isExpanded) continue;
        if (loadingAssignments.has(person.id!)) continue;
        const assignments = person.assignments || [];
        for (const a of assignments) {
          const project = a?.project ? projectsById.get(a.project) : undefined;
          let visible = false;
          if (project) {
            const showAll = selectedStatusFilters.has('Show All') || selectedStatusFilters.size === 0;
            if (showAll) visible = true; else {
              const status = (project.status || '').toLowerCase();
              const baseMatch = Array.from(selectedStatusFilters).some(f => f !== 'Show All' && f !== 'active_no_deliverables' && f === status);
              const noDelSel = selectedStatusFilters.has('active_no_deliverables');
              const noDelMatch = noDelSel && status === 'active' && !projectHasFutureDeliverables.get(project.id!);
              visible = baseMatch || noDelMatch;
            }
          }
          if (visible && a?.id != null) out.push(`${person.id!}:${a.id!}`);
        }
      }
    } catch {}
    return out;
  }, [people, loadingAssignments, deliverables, projectsById, selectedStatusFilters]));
  const selectedCell = useMemo(() => selCell ? (() => { const [p,a] = selCell.rowKey.split(':'); return { personId: Number(p), assignmentId: Number(a), week: selCell.weekKey }; })() : null, [selCell]);
  const selectedCells = useMemo(() => selCells.map(k => { const [p,a] = k.rowKey.split(':'); return { personId: Number(p), assignmentId: Number(a), week: k.weekKey }; }), [selCells]);
  const selectionStart = useMemo(() => selStart ? (() => { const [p,a] = selStart.rowKey.split(':'); return { personId: Number(p), assignmentId: Number(a), week: selStart.weekKey }; })() : null, [selStart]);
  const url = useGridUrlState();
  const { headerRef: headerScrollRef, bodyRef: bodyScrollRef, onHeaderScroll, onBodyScroll } = useScrollSync();

  // Per-person assignment sort mode (default client->project; alt by next deliverable date)
  const [personSortMode, setPersonSortMode] = useState<'client_project' | 'deliverable'>('client_project');

  // Precompute next upcoming deliverable date per project for sorting
  const nextDeliverableByProject = useMemo(() => {
    const map = new Map<number, string>();
    try {
      const now = new Date(); now.setHours(0,0,0,0);
      for (const d of (deliverables || [])) {
        const pid = (d as any).project as number | undefined; const ds = (d as any).date as string | undefined;
        if (!pid || !ds) continue; const dt = new Date(ds.replace(/-/g,'/')); dt.setHours(0,0,0,0);
        if (dt < now) continue;
        const prev = map.get(pid);
        if (!prev || new Date(ds.replace(/-/g,'/')).getTime() < new Date(prev.replace(/-/g,'/')).getTime()) {
          map.set(pid, ds);
        }
      }
    } catch {}
    return map;
  }, [deliverables]);

  // Column width state (extracted hook, assignGrid keys)
  const {
    clientColumnWidth,
    setClientColumnWidth,
    projectColumnWidth,
    setProjectColumnWidth,
    isResizing,
    setIsResizing,
    resizeStartX,
    setResizeStartX,
    resizeStartWidth,
    setResizeStartWidth,
  } = useGridColumnWidthsAssign();

  // Create dynamic grid template based on column widths
  const gridTemplate = useMemo(() => {
    return `${clientColumnWidth}px ${projectColumnWidth}px 40px repeat(${weeks.length}, 70px)`;
  }, [clientColumnWidth, projectColumnWidth, weeks.length]);

  // Calculate total minimum width
  const totalMinWidth = useMemo(() => {
    return clientColumnWidth + projectColumnWidth + 40 + (weeks.length * 70) + 20; // +20 for gaps/padding
  }, [clientColumnWidth, projectColumnWidth, weeks.length]);

  // Initialize from URL (weeks + view)
  useEffect(() => {
    try {
      url.set('view', 'people');
      const w = url.get('weeks');
      if (w) {
        const n = parseInt(w, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= 26) setWeeksHorizon(n);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Persist weeks in URL
  useEffect(() => { url.set('weeks', String(weeksHorizon)); }, [weeksHorizon]);

  // Measure sticky header height so the week header can offset correctly
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(88);
  useEffect(() => {
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
  }, []);

  // Error-bounded computation with explicit null/undefined handling
  const computeAllowedProjects = useMemo(() => {
    try {
      // Guard against missing data
      if (!assignmentsData?.length || !projectsData?.length) {
        return { projectHoursSum: new Map(), allowedProjectIds: new Set() };
      }

      const projectHoursSum = new Map<number, number>();
      const projectsWithHours = new Set<number>();
      const activeProjectIds = new Set<number>();

      // Build projectHoursSum with null/undefined safety
      assignmentsData.forEach(assignment => {
        // Skip assignments without valid project reference
        if (!assignment?.project || typeof assignment.project !== 'number') return;
        
        // Parse weeklyHours with null/undefined/string safety
        const weeklyHours = assignment.weeklyHours || {};
        let totalHours = 0;
        
        Object.values(weeklyHours).forEach(hours => {
          const parsedHours = parseFloat(hours?.toString() || '0') || 0;
          totalHours += parsedHours;
        });
        
        const currentSum = projectHoursSum.get(assignment.project) || 0;
        projectHoursSum.set(assignment.project, currentSum + totalHours);
        
        if (totalHours > 0) {
          projectsWithHours.add(assignment.project);
        }
      });

      // Build activeProjectIds with null/undefined safety
      projectsData.forEach(project => {
        if (!project?.id) return;
        
        const isActive = project.isActive === true;
        const hasActiveStatus = ['active', 'active_ca'].includes(project.status?.toLowerCase() || '');
        
        if (isActive || hasActiveStatus) {
          activeProjectIds.add(project.id);
        }
      });

      // Union operation
      const allowedProjectIds = new Set([...projectsWithHours, ...activeProjectIds]);

      return { projectHoursSum, allowedProjectIds };
      
    } catch (error) {
      console.error('Error computing allowed projects:', error);
      // Return safe fallback - show all projects on error
      return { 
        projectHoursSum: new Map(), 
        allowedProjectIds: new Set(projectsData?.map(p => p?.id).filter(Boolean) || [])
      };
    }
  }, [
    // Memoization dependencies (recompute when these change):
    assignmentsData,           // Assignment data array
    projectsData,             // Project data array
    // Note: Department filter state not needed here as data is pre-filtered
  ]);

  const { allowedProjectIds } = computeAllowedProjects;

  // Get deliverables for a specific project and week (indexed)
  const getDeliverablesForProjectWeek = useDeliverablesIndex(deliverables);

  // Smart project search (kept as-is; independent of status filters)
  const searchProjects = (query: string): Project[] => {
    try {
      if (!projectsData?.length) return [];
      
      if (!query?.trim()) {
        return [];
      }

      const searchWords = query.trim().toLowerCase().split(/\s+/);
      
      let results = projectsData.filter(project => {
        // Null/undefined safety for project properties
        const searchableText = [
          project?.name || '',
          project?.client || '',
          project?.projectNumber || ''
        ].join(' ').toLowerCase();
        
        // All search words must be found in the combined searchable text
        return searchWords.every(word => searchableText.includes(word));
      });
      
      return results.slice(0, 8); // Limit results
    } catch (error) {
      console.error('Error in searchProjects:', error);
      return []; // Safe fallback
    }
  };

  // (Add-assignment handlers moved into useProjectAssignmentAdd)

  // (showToast moved above with toast state)

  // (status controls and editing cell logic extracted via hooks above)

  // Check if the current selectedCells form a contiguous range within the same assignment
  const isContiguousSelection = (): { ok: boolean; reason?: string } => {
    if (!selectedCells || selectedCells.length <= 1) return { ok: true };

    const allSame = selectedCells.every(
      c => c.personId === selectedCells[0].personId && c.assignmentId === selectedCells[0].assignmentId
    );
    if (!allSame) return { ok: false, reason: 'Selection must be within a single assignment row' };

    // Ensure weeks are contiguous according to the weeks array order
    const weekIndex = (date: string) => weeks.findIndex(w => w.date === date);
    const sorted = [...selectedCells].sort((a, b) => weekIndex(a.week) - weekIndex(b.week));
    const start = weekIndex(sorted[0].week);
    for (let i = 1; i < sorted.length; i++) {
      const expected = start + i;
      if (weekIndex(sorted[i].week) !== expected) {
        return { ok: false, reason: 'Selection must be a contiguous week range' };
      }
    }
    return { ok: true };
  };

  const saveEdit = async () => {
    if (!editingCell) return;

    const numValue = sanitizeHours(editingValue);

    try {
      // Bulk selection path
      if (selectedCells && selectedCells.length > 1) {
        const check = isContiguousSelection();
        if (!check.ok) {
          showToast(check.reason || 'Invalid selection for bulk apply', 'warning');
          setEditingCell(null);
          return;
        }
        await updateMultipleCells(selectedCells, numValue);

        // Mirror to assignmentsData for derived filters
        setAssignmentsData(prev => {
          const map = new Map(prev.map(a => [a.id, a] as const));
          for (const cell of selectedCells) {
            const a = map.get(cell.assignmentId);
            if (a) {
              a.weeklyHours = { ...a.weeklyHours, [cell.week]: numValue };
            }
          }
          return Array.from(map.values());
        });
      } else {
        // Single cell path
        await updateAssignmentHours(
          editingCell.personId,
          editingCell.assignmentId,
          editingCell.week,
          numValue
        );
        setAssignmentsData(prev => prev.map(a =>
          a.id === editingCell.assignmentId
            ? { ...a, weeklyHours: { ...a.weeklyHours, [editingCell.week]: numValue } }
            : a
        ));
      }

      // Move selection to next week (if possible) for smoother entry
      const currentIdx = weeks.findIndex(w => w.date === editingCell.week);
      if (currentIdx >= 0 && currentIdx < weeks.length - 1) {
        const next = { personId: editingCell.personId, assignmentId: editingCell.assignmentId, week: weeks[currentIdx + 1].date };
        csSelect(`${next.personId}:${next.assignmentId}`, next.week, false);
      }
    } catch (err: any) {
      console.error('Failed to save edit:', err);
      showToast('Failed to save hours: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setEditingCell(null);
    }
  };

  // (cancelEdit provided by useEditingCellHook)

  const handleCellSelection = (personId: number, assignmentId: number, week: string, isShiftClick?: boolean) => {
    csSelect(rowKeyFor(personId, assignmentId), week, isShiftClick);
  };

  // Click + drag selection support within a single assignment row
  const handleCellMouseDown = (personId: number, assignmentId: number, week: string) => {
    csMouseDown(rowKeyFor(personId, assignmentId), week);
  };

  const handleCellMouseEnter = (personId: number, assignmentId: number, week: string) => {
    csMouseEnter(rowKeyFor(personId, assignmentId), week);
  };


  // Load data on mount and when department filter or weeks horizon changes
  useAuthenticatedEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptState.selectedDepartmentId, deptState.includeChildren, weeksHorizon]);

  useGridKeyboardNavigation({
    selectedCell,
    editingCell,
    isAddingAssignment: addUI.isAddingFor !== null,
    weeks,
    csSelect,
    setEditingCell,
    setEditingValue,
    findAssignment: (personId: number, assignmentId: number) => {
      const person = people.find(p => p.id === personId);
      const assignment = person?.assignments.find(a => a.id === assignmentId);
      return Boolean(person && assignment);
    }
  });

  // Global mouse up handler for drag selection and column resizing
  useEffect(() => {
    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(null);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const deltaX = e.clientX - resizeStartX;
        const newWidth = Math.max(80, resizeStartWidth + deltaX); // Min width of 80px

        if (isResizing === 'client') {
          setClientColumnWidth(newWidth);
        } else if (isResizing === 'project') {
          setProjectColumnWidth(newWidth);
        }
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDraggingSel, isResizing, resizeStartX, resizeStartWidth]);

  // Column resize handlers
  const startColumnResize = (column: 'client' | 'project', e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(column);
    setResizeStartX(e.clientX);
    setResizeStartWidth(column === 'client' ? clientColumnWidth : projectColumnWidth);
  };

  // Use existing department filter state declared near top of component

  // loadData implemented in useAssignmentsSnapshot

  // (subscribeGridRefresh is handled inside useAssignmentsSnapshot)

  // Load a person's assignments once when expanding
  const ensureAssignmentsLoaded = async (personId: number) => {
    if (loadedAssignmentIds.has(personId) || loadingAssignments.has(personId)) return;
    setLoadingAssignments(prev => new Set(prev).add(personId));
    try {
      const rows = await assignmentsApi.byPerson(personId);
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, assignments: rows } : p)));
      setLoadedAssignmentIds(prev => new Set(prev).add(personId));
    } catch (e: any) {
      showToast('Failed to load assignments: ' + (e?.message || 'Unknown error'), 'error');
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, isExpanded: false } : p)));
    } finally {
      setLoadingAssignments(prev => { const n = new Set(prev); n.delete(personId); return n; });
    }
  };

  // Manual refresh for a person's assignments on demand
  const refreshPersonAssignments = async (personId: number) => {
    setLoadingAssignments(prev => new Set(prev).add(personId));
    try {
      const rows = await assignmentsApi.byPerson(personId);
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, assignments: rows } : p)));
      setLoadedAssignmentIds(prev => new Set(prev).add(personId));
      // Optional: recompute aggregated totals for this person from refreshed rows
      try {
        setHoursByPerson(prev => {
          const next = { ...prev } as Record<number, Record<string, number>>;
          const totals: Record<string, number> = {};
          for (const wk of weeks.map(w => w.date)) {
            let sum = 0;
            for (const a of rows) {
              const wh = (a as any).weeklyHours || {};
              const v = parseFloat((wh[wk] ?? 0).toString()) || 0;
              sum += v;
            }
            if (sum !== 0) totals[wk] = sum;
          }
          next[personId] = { ...(next[personId] || {}), ...totals };
          return next;
        });
      } catch {}
      showToast('Assignments refreshed', 'success');
    } catch (e: any) {
      showToast('Failed to refresh assignments: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      setLoadingAssignments(prev => { const n = new Set(prev); n.delete(personId); return n; });
    }
  };

  // Refresh assignments for all people (both expanded and collapsed)
  const refreshAllAssignments = async () => {
    if (people.length === 0) {
      showToast('No people available to refresh', 'warning');
      return;
    }

    try {
      // Refresh assignments for all people in parallel
      await Promise.all(
        people.map(person => refreshPersonAssignments(person.id!))
      );
      showToast(`Refreshed assignments for all ${people.length} people`, 'success');
    } catch (error) {
      showToast('Failed to refresh some assignments', 'error');
    }
  };

  // Toggle person expansion
  const togglePersonExpanded = (personId: number) => {
    const person = people.find(p => p.id === personId);
    const willExpand = !(person?.isExpanded ?? false);
    setPeople(prev => prev.map(p => (p.id === personId ? { ...p, isExpanded: !p.isExpanded } : p)));
    if (willExpand) {
      void ensureAssignmentsLoaded(personId);
    }
  };

  // Status filter matching provided by useProjectStatusFilters

  // Filter assignments based on multi-select status filters
  const getVisibleAssignments = (assignments: Assignment[]): Assignment[] => {
    try {
      if (!assignments?.length) return [];

      const filteredAssignments = assignments.filter(assignment => {
        const project = assignment?.project ? projectsById.get(assignment.project) : undefined;
        return matchesStatusFilters(project as Project);
      });

      // Sort within person based on active mode
      const list = [...filteredAssignments];
      if (personSortMode === 'deliverable') {
        list.sort((a, b) => {
          const ad = a?.project ? nextDeliverableByProject.get(a.project) : undefined;
          const bd = b?.project ? nextDeliverableByProject.get(b.project) : undefined;
          if (ad && bd) return ad.localeCompare(bd);
          if (ad && !bd) return -1;
          if (!ad && bd) return 1;
          // fallback deterministic by client->project
          const ap = a?.project ? projectsById.get(a.project) : undefined;
          const bp = b?.project ? projectsById.get(b.project) : undefined;
          const ac = (ap?.client || '').toString().trim().toLowerCase();
          const bc = (bp?.client || '').toString().trim().toLowerCase();
          if (ac !== bc) return ac.localeCompare(bc);
          const an = (ap?.name || '').toString().trim().toLowerCase();
          const bn = (bp?.name || '').toString().trim().toLowerCase();
          return an.localeCompare(bn);
        });
      } else {
        list.sort((a, b) => {
          const ap = a?.project ? projectsById.get(a.project) : undefined;
          const bp = b?.project ? projectsById.get(b.project) : undefined;
          const ac = (ap?.client || '').toString().trim().toLowerCase();
          const bc = (bp?.client || '').toString().trim().toLowerCase();
          if (ac !== bc) return ac.localeCompare(bc);
          const an = (ap?.name || '').toString().trim().toLowerCase();
          const bn = (bp?.name || '').toString().trim().toLowerCase();
          return an.localeCompare(bn);
        });
      }
      return list;
    } catch (error) {
      console.error('Error filtering/sorting assignments:', error);
      return assignments || []; // Safe fallback - show all on error
    }
  };

  // Calculate person total using filtered assignments with null safety
  const calculatePersonTotal = (assignments: Assignment[], week: string): number => {
    try {
      const visibleAssignments = getVisibleAssignments(assignments);
      return visibleAssignments.reduce((sum, assignment) => {
        const hours = parseFloat(assignment?.weeklyHours?.[week]?.toString() || '0') || 0;
        return sum + hours;
      }, 0);
    } catch (error) {
      console.error('Error calculating person total:', error);
      return 0; // Safe fallback
    }
  };

  // Get person's total hours for a specific week (updated to use filtered assignments)
  const getPersonTotalHours = (person: PersonWithAssignments, week: string) => {
    const byWeek = hoursByPerson[person.id!];
    if (byWeek && Object.prototype.hasOwnProperty.call(byWeek, week)) {
      return byWeek[week] || 0;
    }
    return calculatePersonTotal(person.assignments, week);
  };

  // Add new assignment
  const addAssignment = async (personId: number, project: Project) => {
    try {
      const newAssignment = await assignmentsApi.create({
        person: personId,
        project: project.id!,
        weeklyHours: {}
      });
      
      setPeople(prev => prev.map(person => 
        person.id === personId 
          ? { ...person, assignments: [...person.assignments, newAssignment] }
          : person
      ));

      // Show notification about assignment creation and potential overallocation risk
      const person = people.find(p => p.id === personId);
      if (person) {
        const projectCount = person.assignments.length + 1; // Include the new assignment
        
        if (projectCount >= 3) {
          showToast(
            `?? ${person.name} is now assigned to ${projectCount} projects. Monitor workload to avoid overallocation.`,
            'warning'
          );
        } else {
          showToast(
            `? ${person.name} successfully assigned to ${project.name}`,
            'success'
          );
        }
      }
      // Reset add-assignment UI
      try { addUI.reset(); } catch {}
      
    } catch (err: any) {
      console.error('Failed to create assignment:', err);
      showToast('Failed to create assignment: ' + err.message, 'error');
    }
  };

  // Remove assignment
  const removeAssignment = async (assignmentId: number, personId: number) => {
    if (!confirm('Are you sure you want to remove this assignment?')) return;
    await removeAssignmentAction({ assignmentsApi, setPeople, personId, assignmentId, showToast });
  };

  // Update assignment hours
  const updateAssignmentHours = async (personId: number, assignmentId: number, week: string, hours: number) => {
    await updateAssignmentHoursAction({ assignmentsApi, queryClient, setPeople, setAssignmentsData, setHoursByPerson, hoursByPerson, people, personId, assignmentId, week, hours, showToast });
  };

  // Helper function to check if a cell is in the selected cells array
  const isCellSelected = (personId: number, assignmentId: number, week: string) => {
    return selectedCells.some(cell => 
      cell.personId === personId && 
      cell.assignmentId === assignmentId && 
      cell.week === week
    );
  };

  // Update multiple cells at once (for bulk editing)
  const updateMultipleCells = async (cells: { personId: number, assignmentId: number, week: string }[], hours: number) => {
    await updateMultipleCellsAction({ assignmentsApi, queryClient, setPeople, setAssignmentsData, setHoursByPerson, hoursByPerson, people, cells, hours, showToast });
  };

  const { data: schemeData } = useUtilizationScheme();
  const topBarHeader = (
    <div className="flex items-center gap-4 min-w-0">
      <div className="min-w-0">
        <div className="text-lg font-semibold text-[var(--text)] leading-tight">Assignments</div>
        <div className="text-[var(--muted)] text-xs">Manage team workload allocation across {weeks.length} weeks</div>
      </div>
      <WeeksSelector value={weeksHorizon} onChange={setWeeksHorizon} />
      <HeaderActions
        onExpandAll={async () => { try { setPeople(prev => prev.map(p => ({...p,isExpanded:true}))); await refreshAllAssignments(); } catch {} }}
        onCollapseAll={() => setPeople(prev => prev.map(p => ({...p,isExpanded:false})))}
        onRefreshAll={refreshAllAssignments}
        disabled={loading || (loadingAssignments.size > 0)}
      />
      <StatusFilterChips
        options={statusFilterOptions as unknown as readonly string[]}
        selected={selectedStatusFilters as unknown as Set<string>}
        format={formatFilterStatus as any}
        onToggle={(s) => toggleStatusFilter(s as any)}
      />
      <a
        href={buildProjectAssignmentsLink({ weeks: weeksHorizon, statuses: (Array.from(selectedStatusFilters) || []).filter(s => s !== 'Show All') })}
        className="px-2 py-0.5 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        Project View
      </a>
    </div>
  );

  if (loading) {
    return (
      <Layout>
        {compact && (<TopBarPortal side="right">{topBarHeader}</TopBarPortal>)}
        <AssignmentsSkeleton />
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-red-400">{error}</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {compact && (<TopBarPortal side="right">{topBarHeader}</TopBarPortal>)}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Sticky Header Section */}
        {!compact && (
        <HeaderBarComp
          headerRef={headerRef}
          title="Assignment Grid"
          weeksCount={weeks.length}
          isSnapshotMode={isSnapshotMode}
          weeksHorizon={weeksHorizon}
          setWeeksHorizon={setWeeksHorizon}
          projectViewHref={(function(){ const s=selectedStatusFilters; const statusStr = (s.size===0 || s.has('Show All')) ? '' : `&status=${encodeURIComponent(Array.from(s).join(','))}`; return `/project-assignments?view=project&weeks=${weeksHorizon}${statusStr}`; })()}
          peopleCount={people.length}
          assignmentsCount={people.reduce((total,p)=> total + p.assignments.length, 0)}
          asyncJobId={asyncJob.id}
          asyncProgress={asyncJob.progress}
          asyncMessage={asyncJob.message}
          loading={loading}
          loadingAssignmentsInProgress={loadingAssignments.size > 0}
          onExpandAllAndRefresh={async () => { try { setPeople(prev => prev.map(p => ({...p,isExpanded:true}))); await refreshAllAssignments(); } catch {} }}
          onCollapseAll={() => setPeople(prev => prev.map(p => ({...p,isExpanded:false})))}
          onRefreshAll={refreshAllAssignments}
          statusFilterOptions={statusFilterOptions as unknown as readonly string[]}
          selectedStatusFilters={selectedStatusFilters as unknown as Set<string>}
          formatFilterStatus={(status) => formatFilterStatus(status as any)}
          toggleStatusFilter={(status) => toggleStatusFilter(status as any)}
        />)}

        {/* Sticky Week Header - positioned directly below measured header */}
        <WeekHeaderComp
          top={compact ? 0 : headerHeight}
          minWidth={totalMinWidth}
          gridTemplate={gridTemplate}
          weeks={weeks}
          onStartResize={startColumnResize}
          scrollRef={headerScrollRef}
          onScroll={onHeaderScroll}
          onClientClick={() => setPersonSortMode('client_project')}
          onWeeksClick={() => setPersonSortMode('deliverable')}
        />

        {/* Floating deliverables legend (wide screens only) */}
        <DeliverableLegendFloating top={(compact ? 0 : headerHeight) + 8} />

        

        {/* Full Width Grid Container */}
        <div className="flex-1 overflow-x-auto bg-[var(--bg)]" ref={bodyScrollRef} onScroll={onBodyScroll}>
          <div style={{ minWidth: totalMinWidth }}>

            {/* Data Rows */}
            <div>
              <PeopleSection
                people={people as any}
                weeks={weeks}
                gridTemplate={gridTemplate}
                loadingAssignments={loadingAssignments}
                projectsById={projectsById as any}
                getVisibleAssignments={getVisibleAssignments}
                togglePersonExpanded={(pid) => togglePersonExpanded(pid)}
                addAssignment={addAssignment}
                removeAssignment={(assignmentId, personId) => removeAssignment(assignmentId, personId)}
                onCellSelect={handleCellSelection}
                onCellMouseDown={handleCellMouseDown}
                onCellMouseEnter={handleCellMouseEnter}
                editingCell={editingCell}
                onEditStart={startEditing}
                onEditSave={saveEdit}
                onEditCancel={cancelEdit}
                editingValue={editingValue}
                onEditValueChange={setEditingValue}
                selectedCell={selectedCell}
                selectedCells={selectedCells}
                getDeliverablesForProjectWeek={getDeliverablesForProjectWeek}
                getProjectStatus={getProjectStatus}
                statusDropdown={statusDropdown}
                projectStatus={projectStatus}
                onStatusChange={handleStatusChange}
                onAssignmentRoleChange={handleAssignmentRoleChange}
                renderAddAction={(person) => (
                  <button
                    className="w-7 h-7 rounded text-white hover:text-[var(--muted)] hover:bg-[var(--surface)] transition-colors text-center text-sm font-medium leading-none font-mono"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Add new assignment"
                    onClick={() => { addUI.open(person.id!); }}
                  >
                    +
                  </button>
                )}
                renderAddRow={(person) => (
                  <AddAssignmentRow
                    personId={person.id!}
                    weeks={weeks}
                    gridTemplate={gridTemplate}
                    newProjectName={addUI.newProjectName}
                    onSearchChange={addUI.onSearchChange}
                    projectSearchResults={addUI.projectSearchResults}
                    selectedDropdownIndex={addUI.selectedDropdownIndex}
                    setSelectedDropdownIndex={addUI.setSelectedDropdownIndex}
                    showProjectDropdown={addUI.showProjectDropdown}
                    setShowProjectDropdown={addUI.setShowProjectDropdown}
                    selectedProject={addUI.selectedProject}
                    onProjectSelect={addUI.onProjectSelect}
                    onAddProject={(proj) => addUI.addProject(person.id!, proj)}
                    onAddSelected={() => addUI.addSelected(person.id!)}
                    onCancel={addUI.cancel}
                  />
                )}
                showAddRow={(person) => person.isExpanded && addUI.isAddingFor === person.id}
                renderWeekTotals={(p, week) => {
                  const totalHours = getPersonTotalHours(p as any, week.date);
                  const pill = getUtilizationPill({ hours: totalHours, capacity: (p as any).weeklyCapacity!, scheme: schemeData || defaultUtilizationScheme, output: 'classes' });
                  const aria = totalHours > 0 ? `${totalHours} hours` : '0 hours';
                  return (
                    <div className={`inline-flex items-center justify-center h-6 px-2 leading-none rounded-full text-xs font-medium min-w-[40px] text-center ${pill.classes}`} aria-label={aria}>
                      {pill.label}
                    </div>
                  );
                }}
              />
            </div>
          
        

        {/* Status Bar */}
        {(() => {
          const s = (schemeData ?? defaultUtilizationScheme);
          const labels = s.mode === 'absolute_hours'
            ? {
                blue: `${s.blue_min}-${s.blue_max}h`,
                green: `${s.green_min}-${s.green_max}h`,
                orange: `${s.orange_min}-${s.orange_max}h`,
                red: `${s.red_min}h+`,
              }
            : {
                blue: '<=70%',
                green: '70-85%',
                orange: '85-100%',
                red: '>100%',
              } as const;
          return (
            <StatusBar labels={labels} selectionSummary={selectionSummary} />
          );
        })()}
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </Layout>
  );
};

export default AssignmentGrid;








import { removeAssignmentAction, updateAssignmentHoursAction, updateMultipleCellsAction } from '@/pages/Assignments/grid/assignmentActions';
