/**
 * Assignment Grid - Real implementation of the spreadsheet-like assignment interface
 * Replaces the form-based AssignmentForm with a modern grid view
 */

import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { useQueryClient } from '@tanstack/react-query';
import { Assignment, Person, Deliverable, Project, DeliverablePhaseMappingSettings, AutoHoursTemplate } from '@/types/models';
import { assignmentsApi, autoHoursSettingsApi, autoHoursTemplatesApi, deliverablePhaseMappingApi, type AutoHoursRoleSetting } from '@/services/api';
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
import { subscribeAssignmentsRefresh, type AssignmentEvent } from '@/lib/assignmentsRefreshBus';
import { bulkUpdateAssignmentHours, createAssignment, updateAssignment } from '@/lib/mutations/assignments';
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
import StatusBar from '@/pages/Assignments/grid/components/StatusBar';
import { useStatusControls } from '@/pages/Assignments/grid/useStatusControls';
import { useEditingCell as useEditingCellHook } from '@/pages/Assignments/grid/useEditingCell';
// useWeekHeaders is managed inside useAssignmentsSnapshot
import { useAssignmentsSnapshot } from '@/pages/Assignments/grid/useAssignmentsSnapshot';
import { useGridKeyboardNavigation } from '@/pages/Assignments/grid/useGridKeyboardNavigation';
import { useDeliverablesIndex } from '@/pages/Assignments/grid/useDeliverablesIndex';
import { useProjectStatusFilters } from '@/pages/Assignments/grid/useProjectStatusFilters';
import { getFlag } from '@/lib/flags';
import { useTopBarSlots } from '@/components/layout/TopBarSlots';
import { useAssignmentsInteractionStore } from '@/pages/Assignments/grid/useAssignmentsInteractionStore';
import WeeksSelector from '@/components/compact/WeeksSelector';
import StatusFilterChips from '@/components/compact/StatusFilterChips';
import HeaderActions from '@/components/compact/HeaderActions';
import { buildProjectAssignmentsLink } from '@/pages/Assignments/grid/linkUtils';
import TopBarPortal from '@/components/layout/TopBarPortal';
import DeliverableLegendFloating from '@/components/deliverables/DeliverableLegendFloating';
import MobilePersonAccordions from '@/pages/Assignments/grid/components/MobilePersonAccordions';
import AutoHoursActionButtons from '@/pages/Assignments/grid/components/AutoHoursActionButtons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import MobileAssignmentSheet from '@/pages/Assignments/grid/components/MobileAssignmentSheet';
import MobileAddAssignmentSheet from '@/pages/Assignments/grid/components/MobileAddAssignmentSheet';
import { useWeekVirtualization } from '@/pages/Assignments/grid/useWeekVirtualization';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrManager } from '@/utils/roleAccess';

// Deliverable utilities moved to '@/util/deliverables' and used by WeekCell.

// (WeekCell moved to grid/components/WeekCell)


interface PersonWithAssignments extends Person {
  assignments: Assignment[];
  isExpanded: boolean;
}
// Removed local Monday computation - weeks come from server snapshot only.

const AUTO_HOURS_MAX_WEEKS = 8;
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const roundHours = (value: number) => (Number.isFinite(value) ? Math.ceil(value) : 0);
const DEFAULT_PHASE_MAPPING: DeliverablePhaseMappingSettings = {
  useDescriptionMatch: true,
  phases: [
    { key: 'sd', label: 'SD', descriptionTokens: ['sd', 'schematic'], rangeMin: 0, rangeMax: 40, sortOrder: 0 },
    { key: 'dd', label: 'DD', descriptionTokens: ['dd', 'design development'], rangeMin: 41, rangeMax: 89, sortOrder: 1 },
    { key: 'ifp', label: 'IFP', descriptionTokens: ['ifp'], rangeMin: 90, rangeMax: 99, sortOrder: 2 },
    { key: 'ifc', label: 'IFC', descriptionTokens: ['ifc'], rangeMin: 100, rangeMax: 100, sortOrder: 3 },
  ],
};
const DEFAULT_AUTO_HOURS_PHASES = ['sd', 'dd', 'ifp', 'ifc'] as const;
const isDateInWeek = (dateStr: string, weekStartStr: string) => {
  try {
    const deliverableDate = new Date(dateStr);
    const weekStartDate = new Date(weekStartStr);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    return deliverableDate >= weekStartDate && deliverableDate <= weekEndDate;
  } catch {
    return false;
  }
};

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
  const [autoHoursSettingsByPhase, setAutoHoursSettingsByPhase] = useState<Record<string, AutoHoursRoleSetting[]>>({});
  const [autoHoursSettingsLoading, setAutoHoursSettingsLoading] = useState<boolean>(false);
  const [autoHoursSettingsError, setAutoHoursSettingsError] = useState<string | null>(null);
  const [autoHoursTemplateSettings, setAutoHoursTemplateSettings] = useState<Record<number, Record<string, AutoHoursRoleSetting[]>>>({});
  const [autoHoursTemplateSettingsLoading, setAutoHoursTemplateSettingsLoading] = useState<Set<number>>(new Set());
  const [autoHoursTemplates, setAutoHoursTemplates] = useState<AutoHoursTemplate[]>([]);
  const [phaseMapping, setPhaseMapping] = useState<DeliverablePhaseMappingSettings | null>(null);
  const [phaseMappingError, setPhaseMappingError] = useState<string | null>(null);
  const phaseMappingEffective = useMemo(() => phaseMapping || DEFAULT_PHASE_MAPPING, [phaseMapping]);
  const autoHoursPhases = useMemo(() => {
    const keys = (phaseMappingEffective.phases || []).map(p => p.key).filter(Boolean);
    return keys.length ? keys : Array.from(DEFAULT_AUTO_HOURS_PHASES);
  }, [phaseMappingEffective]);
  // Snapshot/rendering mode and aggregated hours
  const [hoursByPerson, setHoursByPerson] = useState<Record<number, Record<string, number>>>({});
  // isSnapshotMode provided by useAssignmentsSnapshot
  // Weeks header: from grid snapshot when available; fallback to 12 Mondays
  // (state moved up near other snapshot states)
  // On-demand detail loading flags
  const [loadedAssignmentIds, setLoadedAssignmentIds] = useState<Set<number>>(new Set());
  const [loadingAssignments, setLoadingAssignments] = useState<Set<number>>(new Set());
  const [mobileEditTarget, setMobileEditTarget] = useState<{ personId: number; assignmentId: number } | null>(null);
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
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addUI = useProjectAssignmentAdd({
    search: (query) => searchProjects(query),
    onAdd: (personId, project) => addAssignment(personId, project),
  });
  const { editingCell, setEditingCell, editingValue, setEditingValue, startEditing, cancelEdit, sanitizeHours } = useEditingCellHook();
  const caps = useCapabilities({ enabled: false });
  const auth = useAuth();
  const canUseAutoHours = isAdminOrManager(auth.user);
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
    setPeople,
    setAssignmentsData,
    setProjectsData: setProjectsData as any,
    setDeliverables,
    setHoursByPerson,
    getHasData: () => people.length > 0 || assignmentsData.length > 0,
    setIsFetching,
    subscribeGridRefresh,
    trackPerformanceEvent,
    showToast,
    setError,
    setLoading,
  });
  const { weeks, isSnapshotMode, loadData, asyncJob, departments } = snapshot;
  const canEditAssignments = caps.data?.aggregates?.gridSnapshot !== false;
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');
  const weekKeys = useMemo(() => weeks.map(w => w.date), [weeks]);
  const weekVirtualization = useWeekVirtualization(weeks, 70, 2);
  const mobileWeeks = isMobileLayout ? weekVirtualization.visibleWeeks : weeks;
  const weekPaddingLeft = isMobileLayout ? weekVirtualization.paddingLeft : 0;
  const weekPaddingRight = isMobileLayout ? weekVirtualization.paddingRight : 0;
  const compact = getFlag('COMPACT_ASSIGNMENT_HEADERS', true);
  const { setLeft, setRight, clearLeft, clearRight } = useTopBarSlots();
  const rowKeyFor = (personId: number, assignmentId: number) => `${personId}:${assignmentId}`;
  // Per-person assignment sort mode (default client->project; alt by next deliverable date)
  const [personSortMode, setPersonSortMode] = useState<'client_project' | 'deliverable'>('client_project');

  const autoHoursDepartmentId = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
  const refreshAutoHoursSettings = useCallback(async () => {
    if (!canUseAutoHours) {
      setAutoHoursSettingsByPhase({});
      setAutoHoursSettingsError(null);
      setAutoHoursSettingsLoading(false);
      return;
    }
    try {
      setAutoHoursSettingsLoading(true);
      setAutoHoursSettingsError(null);
      const results = await Promise.allSettled(
        autoHoursPhases.map(phase => autoHoursSettingsApi.list(autoHoursDepartmentId, phase))
      );
      const next: Record<string, AutoHoursRoleSetting[]> = {};
      const failures: string[] = [];
      results.forEach((res, idx) => {
        const phase = autoHoursPhases[idx];
        if (res.status === 'fulfilled') next[phase] = res.value || [];
        else failures.push(phase);
      });
      setAutoHoursSettingsByPhase(next);
      if (failures.length) {
        setAutoHoursSettingsError(`Failed to load auto hours for: ${failures.join(', ')}`);
      }
    } catch (e: any) {
      setAutoHoursSettingsError(e?.message || 'Failed to load auto hours settings');
    } finally {
      setAutoHoursSettingsLoading(false);
    }
  }, [autoHoursDepartmentId, autoHoursPhases, canUseAutoHours]);

  useEffect(() => {
    void refreshAutoHoursSettings();
  }, [refreshAutoHoursSettings]);

  useEffect(() => {
    if (!canUseAutoHours) {
      setAutoHoursTemplates([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const list = await autoHoursTemplatesApi.list();
        if (!mounted) return;
        setAutoHoursTemplates(list || []);
      } catch (e: any) {
        if (!mounted) return;
        setAutoHoursTemplates([]);
      }
    })();
    return () => { mounted = false; };
  }, [canUseAutoHours]);

  const autoHoursTemplatePhaseKeysById = useMemo(() => {
    const map = new Map<number, Set<string>>();
    (autoHoursTemplates || []).forEach((template) => {
      const keys = (template.phaseKeys && template.phaseKeys.length)
        ? template.phaseKeys
        : autoHoursPhases;
      map.set(template.id, new Set(keys));
    });
    return map;
  }, [autoHoursPhases, autoHoursTemplates]);

  const ensureTemplateSettings = useCallback(async (templateIds: number[]) => {
    const ids = Array.from(new Set(templateIds.filter(id => Number.isFinite(id))));
    if (ids.length === 0) return;
    const missing = ids.filter(id => !autoHoursTemplateSettings[id]);
    if (missing.length === 0) return;
    setAutoHoursTemplateSettingsLoading(prev => {
      const next = new Set(prev);
      missing.forEach(id => next.add(id));
      return next;
    });
    try {
      await Promise.all(missing.map(async (templateId) => {
        const phasesToFetch = Array.from(autoHoursTemplatePhaseKeysById.get(templateId) ?? autoHoursPhases);
        const results = await Promise.allSettled(
          phasesToFetch.map(phase => autoHoursTemplatesApi.listSettings(templateId, phase))
        );
        const phaseMap: Record<string, AutoHoursRoleSetting[]> = {};
        results.forEach((res, idx) => {
          const phase = phasesToFetch[idx];
          if (res.status === 'fulfilled') phaseMap[phase] = res.value || [];
        });
        setAutoHoursTemplateSettings(prev => ({ ...prev, [templateId]: phaseMap }));
      }));
    } catch (e: any) {
      showToast(e?.message || 'Failed to load auto hours templates', 'error');
    } finally {
      setAutoHoursTemplateSettingsLoading(prev => {
        const next = new Set(prev);
        missing.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [autoHoursTemplatePhaseKeysById, autoHoursTemplateSettings, showToast]);

  useEffect(() => {
    if (!canUseAutoHours) return;
    let mounted = true;
    (async () => {
      try {
        const mapping = await deliverablePhaseMappingApi.get();
        if (!mounted) return;
        setPhaseMapping(mapping || null);
        setPhaseMappingError(null);
      } catch (e: any) {
        if (!mounted) return;
        setPhaseMappingError(e?.message || 'Failed to load deliverable phase mapping');
        setPhaseMapping(null);
      }
    })();
    return () => { mounted = false; };
  }, [canUseAutoHours]);

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

  // Filter + sort assignments based on status filters and current sort mode
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
  const rowOrder = useMemo(() => {
    const out: string[] = [];
    try {
      for (const person of people || []) {
        if (!person?.isExpanded) continue;
        if (loadingAssignments.has(person.id!)) continue;
        const assignments = getVisibleAssignments(person.assignments || []);
        for (const a of assignments) {
          if (a?.id != null) out.push(`${person.id!}:${a.id!}`);
        }
      }
    } catch {}
    return out;
  }, [people, loadingAssignments, getVisibleAssignments]);

  const peopleRef = useRef<PersonWithAssignments[]>([]);
  const assignmentsRef = useRef<Assignment[]>([]);
  const lastAssignmentUpdateRef = useRef<Map<number, number>>(new Map());
  const lastAssignmentUpdateSourceRef = useRef<Map<number, 'event' | 'local'>>(new Map());
  const eventQueueRef = useRef<AssignmentEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  useEffect(() => {
    assignmentsRef.current = assignmentsData;
  }, [assignmentsData]);

  const applyAssignmentEvent = useCallback(async (event: AssignmentEvent) => {
    if (!event?.assignmentId) return;
    if (editingCell?.assignmentId && event.fields?.includes('weeklyHours')) {
      if (editingCell.assignmentId === event.assignmentId) return;
    }
    const eventTimestamp = event.updatedAt ? Date.parse(event.updatedAt) : 0;
    const last = lastAssignmentUpdateRef.current.get(event.assignmentId) || 0;
    const lastSource = lastAssignmentUpdateSourceRef.current.get(event.assignmentId);
    if (eventTimestamp && last && lastSource === 'event' && eventTimestamp < last) return;

    if (event.type === 'deleted') {
      if (eventTimestamp) {
        lastAssignmentUpdateRef.current.set(event.assignmentId, eventTimestamp);
        lastAssignmentUpdateSourceRef.current.set(event.assignmentId, 'event');
      } else {
        lastAssignmentUpdateRef.current.set(event.assignmentId, Date.now());
        lastAssignmentUpdateSourceRef.current.set(event.assignmentId, 'local');
      }
      setAssignmentsData((prev) => prev.filter((a) => a.id !== event.assignmentId));
      setPeople((prev) => prev.map((person) => ({
        ...person,
        assignments: (person.assignments || []).filter((a: any) => a.id !== event.assignmentId),
      })));
      return;
    }

    let assignment = event.assignment || null;
    if (!assignment) {
      try {
        assignment = await assignmentsApi.get(event.assignmentId);
      } catch {
        return;
      }
    }
    if (!assignment?.id) return;
    const assignmentTs = assignment.updatedAt ? Date.parse(assignment.updatedAt) : 0;
    if (eventTimestamp || assignmentTs) {
      const nextTs = eventTimestamp || assignmentTs;
      lastAssignmentUpdateRef.current.set(assignment.id, nextTs);
      lastAssignmentUpdateSourceRef.current.set(assignment.id, 'event');
    } else {
      lastAssignmentUpdateRef.current.set(assignment.id, Date.now());
      lastAssignmentUpdateSourceRef.current.set(assignment.id, 'local');
    }

    setAssignmentsData((prev) => {
      let found = false;
      const next = prev.map((a) => {
        if (a.id === assignment!.id) {
          found = true;
          return { ...a, ...assignment };
        }
        return a;
      });
      if (!found) next.push(assignment as Assignment);
      return next;
    });

    const previousPeople = peopleRef.current;
    const previousAssignment = assignmentsRef.current.find((a) => a.id === assignment!.id);
    const oldPersonId = previousAssignment?.person ?? null;
    const newPersonId = assignment.person ?? null;
    setPeople((prev) => prev.map((person) => {
      if (person.id !== oldPersonId && person.id !== newPersonId) return person;
      let nextAssignments = person.assignments || [];
      if (person.id === oldPersonId && oldPersonId !== newPersonId) {
        nextAssignments = nextAssignments.filter((a: any) => a.id !== assignment!.id);
      }
      if (person.id === newPersonId) {
        const exists = nextAssignments.some((a: any) => a.id === assignment!.id);
        nextAssignments = exists
          ? nextAssignments.map((a: any) => (a.id === assignment!.id ? { ...a, ...assignment } : a))
          : [...nextAssignments, assignment as Assignment];
      }
      return { ...person, assignments: nextAssignments };
    }));

    if (assignment.weeklyHours && newPersonId != null) {
      const weeksToUpdate = Object.keys(assignment.weeklyHours || {});
      if (weeksToUpdate.length > 0) {
        const person = previousPeople.find((p) => p.id === newPersonId);
        const assignmentsForPerson = (person?.assignments || []).map((a) =>
          a.id === assignment!.id ? { ...a, ...assignment } : a
        );
        setHoursByPerson((prev) => {
          const next = { ...prev };
          const personHours = { ...(next[newPersonId] || {}) };
          for (const wk of weeksToUpdate) {
            const total = assignmentsForPerson.reduce((sum, a: any) => {
              const wh = a.weeklyHours || {};
              const v = parseFloat((wh?.[wk] as any)?.toString?.() || '0') || 0;
              return sum + v;
            }, 0);
            personHours[wk] = total;
          }
          next[newPersonId] = personHours;
          return next;
        });
      }
    }
  }, [setAssignmentsData, setPeople, setHoursByPerson, editingCell]);

  const enqueueAssignmentEvent = useCallback((event: AssignmentEvent) => {
    eventQueueRef.current.push(event);
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(async () => {
      const queued = eventQueueRef.current.splice(0, eventQueueRef.current.length);
      flushTimerRef.current = null;
      const coalesced = new Map<number, AssignmentEvent>();
      queued.forEach((evt) => {
        if (!evt?.assignmentId) return;
        const existing = coalesced.get(evt.assignmentId);
        if (!existing) {
          coalesced.set(evt.assignmentId, evt);
          return;
        }
        const existingTs = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
        const nextTs = evt.updatedAt ? Date.parse(evt.updatedAt) : 0;
        if (!existingTs || (nextTs && nextTs >= existingTs)) {
          coalesced.set(evt.assignmentId, evt);
        }
      });
      for (const evt of coalesced.values()) {
        await applyAssignmentEvent(evt);
      }
    }, 60);
  }, [applyAssignmentEvent]);

  useEffect(() => {
    const unsubscribe = subscribeAssignmentsRefresh((event) => {
      enqueueAssignmentEvent(event);
    });
    return () => {
      unsubscribe();
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };
  }, [enqueueAssignmentEvent]);
  const interactionStore = useAssignmentsInteractionStore({ weeks: weekKeys, rowOrder });
  const {
    selection: {
      selectedCell: selCell,
      selectionStart: selStart,
      isDragging: isDraggingSel,
      onCellMouseDown: csMouseDown,
      onCellMouseEnter: csMouseEnter,
      onCellSelect: csSelect,
      clearSelection: csClear,
      isCellSelected: csIsSelected,
      selectionSummary,
      getSelectedCells,
    },
    scroll: { headerRef: headerScrollRef, bodyRef: bodyScrollRef, onHeaderScroll, onBodyScroll },
    density: { setMainPadding },
  } = interactionStore;
  const handleHeaderScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (isMobileLayout) {
        weekVirtualization.updateRange(e.currentTarget.scrollLeft, e.currentTarget.clientWidth);
      }
      onHeaderScroll(e);
    },
    [weekVirtualization, onHeaderScroll, isMobileLayout]
  );
  const handleBodyScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (isMobileLayout) {
        weekVirtualization.updateRange(e.currentTarget.scrollLeft, e.currentTarget.clientWidth);
      }
      onBodyScroll(e);
    },
    [weekVirtualization, onBodyScroll, isMobileLayout]
  );
  useEffect(() => {
    if (!isMobileLayout) return;
    const node = bodyScrollRef.current;
    if (!node) return;
    const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    weekVirtualization.updateRange(node.scrollLeft, node.clientWidth || fallbackWidth);
  }, [bodyScrollRef, weekVirtualization, weeks.length, isMobileLayout]);
  // Ensure the grid header hugs the top/side edges when compact mode is on
  // by switching the Layout "density" to compact (removes main padding).
  useLayoutEffect(() => {
    if (compact) setMainPadding('compact');
    return () => setMainPadding('default');
    // Only depends on compact flag and setter
  }, [compact, setMainPadding]);
  // topBarHeader is defined later after handlers
  const selectedCell = useMemo(() => selCell ? (() => { const [p,a] = selCell.rowKey.split(':'); return { personId: Number(p), assignmentId: Number(a), week: selCell.weekKey }; })() : null, [selCell]);
  const selectedCells = useMemo(() => {
    const cells = getSelectedCells();
    return cells.map(k => {
      const [p, a] = k.rowKey.split(':');
      return { personId: Number(p), assignmentId: Number(a), week: k.weekKey };
    });
  }, [getSelectedCells]);
  const selectionStart = useMemo(() => selStart ? (() => { const [p,a] = selStart.rowKey.split(':'); return { personId: Number(p), assignmentId: Number(a), week: selStart.weekKey }; })() : null, [selStart]);
  const url = useGridUrlState();

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
  const autoHoursColumnWidth = 28;
  const gridTemplate = useMemo(() => {
    const count = Math.max(1, (isMobileLayout ? mobileWeeks.length : weeks.length));
    return `${clientColumnWidth}px ${projectColumnWidth}px 40px ${autoHoursColumnWidth}px repeat(${count}, 70px)`;
  }, [clientColumnWidth, projectColumnWidth, mobileWeeks.length, weeks.length, isMobileLayout, autoHoursColumnWidth]);

  // Calculate total minimum width
  const totalMinWidth = useMemo(() => {
    return clientColumnWidth + projectColumnWidth + 40 + autoHoursColumnWidth + (weeks.length * 70) + 20; // +20 for gaps/padding
  }, [clientColumnWidth, projectColumnWidth, weeks.length, autoHoursColumnWidth]);

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

  const autoHoursSettingsByPhaseMap = useMemo(() => {
    const out: Record<string, Map<number, AutoHoursRoleSetting>> = {};
    autoHoursPhases.forEach((phase) => {
      const map = new Map<number, AutoHoursRoleSetting>();
      const rows = autoHoursSettingsByPhase?.[phase] || [];
      for (const setting of rows) {
        map.set(setting.roleId, setting);
      }
      out[phase] = map;
    });
    return out;
  }, [autoHoursPhases, autoHoursSettingsByPhase]);

  const autoHoursTemplateSettingsByPhaseMap = useMemo(() => {
    const out: Record<number, Record<string, Map<number, AutoHoursRoleSetting>>> = {};
    Object.entries(autoHoursTemplateSettings || {}).forEach(([tid, phases]) => {
      const templateId = Number(tid);
      const phaseMaps: Record<string, Map<number, AutoHoursRoleSetting>> = {};
      autoHoursPhases.forEach((phase) => {
        const map = new Map<number, AutoHoursRoleSetting>();
        const rows = phases?.[phase] || [];
        for (const setting of rows) {
          map.set(setting.roleId, setting);
        }
        phaseMaps[phase] = map;
      });
      out[templateId] = phaseMaps;
    });
    return out;
  }, [autoHoursPhases, autoHoursTemplateSettings]);

  const classifyDeliverablePhase = useCallback((deliverable: Deliverable): string | null => {
    const descRaw = (deliverable?.description || '').toLowerCase().trim();
    const desc = descRaw.replace(/\s+/g, ' ');
    if (desc.includes('bulletin') || desc.includes('addendum')) return null;
    if (desc.includes('masterplan') || desc.includes('master plan') || desc.includes('masterplanning')) return null;

    const tokenMatch = (text: string, token: string) => {
      if (!token) return false;
      if (token.includes(' ') || token.length > 3) return text.includes(token);
      return new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`).test(text);
    };

    const phases = (phaseMappingEffective.phases || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    if (phaseMappingEffective.useDescriptionMatch && desc) {
      for (const phase of phases) {
        const tokens = phase.descriptionTokens || [];
        if (tokens.some(t => tokenMatch(desc, t))) return phase.key;
      }
    }

    if (deliverable?.percentage != null) {
      const p = Math.round(Number(deliverable.percentage));
      if (Number.isFinite(p)) {
        for (const phase of phases) {
          const rmin = phase.rangeMin;
          const rmax = phase.rangeMax;
          if (rmin == null || rmax == null) continue;
          if (p >= rmin && p <= rmax) return phase.key;
        }
      }
    }
    return null;
  }, [phaseMappingEffective]);

  const deliverableWeekEntriesByProject = useMemo(() => {
    const map = new Map<number, Array<{ weekIndex: number; phase: string }>>();
    if (!weeks.length) return map;
    for (const deliverable of deliverables || []) {
      const projectId = (deliverable as any).project as number | undefined;
      const date = (deliverable as any).date as string | null | undefined;
      if (!projectId || !date) continue;
      const weekIndex = weeks.findIndex(week => isDateInWeek(date, week.date));
      if (weekIndex < 0) continue;
      const phase = classifyDeliverablePhase(deliverable);
      if (!phase) continue;
      const list = map.get(projectId) || [];
      if (!list.some(entry => entry.weekIndex === weekIndex && entry.phase === phase)) {
        list.push({ weekIndex, phase });
      }
      map.set(projectId, list);
    }
    return map;
  }, [classifyDeliverablePhase, deliverables, weeks]);

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

  // Check if the current selectedCells form a valid contiguous range for bulk apply
  const isContiguousSelection = (): { ok: boolean; reason?: string } => {
    if (!selectedCells || selectedCells.length <= 1) return { ok: true };

    const personId = selectedCells[0].personId;
    const allSamePerson = selectedCells.every(c => c.personId === personId);
    if (!allSamePerson) return { ok: false, reason: 'Selection must be within a single person' };

    // Ensure the selected weeks form a contiguous range
    const weekIndex = (date: string) => weeks.findIndex(w => w.date === date);
    const uniqueWeekIdx = Array.from(
      new Set(selectedCells.map(c => weekIndex(c.week)).filter(i => i >= 0))
    ).sort((a, b) => a - b);
    if (uniqueWeekIdx.length === 0) return { ok: false, reason: 'Selection must include valid weeks' };
    const start = uniqueWeekIdx[0];
    for (let i = 1; i < uniqueWeekIdx.length; i++) {
      const expected = start + i;
      if (uniqueWeekIdx[i] !== expected) {
        return { ok: false, reason: 'Selection must be a contiguous week range' };
      }
    }
    return { ok: true };
  };

  const saveEditInFlightRef = useRef(false);
  const saveEdit = async () => {
    if (!editingCell || saveEditInFlightRef.current) return;
    saveEditInFlightRef.current = true;

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
      saveEditInFlightRef.current = false;
      setEditingCell(null);
    }
  };

  // Commit edits on outside click (avoid selection mouse events stealing focus)
  useEffect(() => {
    if (!editingCell) return;
    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-week-cell-editing="true"]')) return;
      saveEdit();
    };
    document.addEventListener('mousedown', handleDocMouseDown, true);
    return () => document.removeEventListener('mousedown', handleDocMouseDown, true);
  }, [editingCell, saveEdit]);

  // (cancelEdit provided by useEditingCellHook)

  const handleCellSelection = (personId: number, assignmentId: number, week: string, isShiftClick?: boolean) => {
    csSelect(rowKeyFor(personId, assignmentId), week, isShiftClick);
  };

  // Click + drag selection support across rows
  const handleCellMouseDown = (personId: number, assignmentId: number, week: string) => {
    csMouseDown(rowKeyFor(personId, assignmentId), week);
  };

  const handleCellMouseEnter = (personId: number, assignmentId: number, week: string) => {
    csMouseEnter(rowKeyFor(personId, assignmentId), week);
  };


  // Snapshot query auto-fetches when weeks/department changes; no manual load needed here.

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

  // Load a person's assignments once when expanding.
  // Prefer already-loaded assignments from state to avoid redundant network calls.
  const ensureAssignmentsLoaded = async (personId: number): Promise<Assignment[]> => {
    const person = people.find(p => p.id === personId);
    if (loadedAssignmentIds.has(personId) || loadingAssignments.has(personId)) {
      return person?.assignments || [];
    }
    if (person && Array.isArray(person.assignments) && person.assignments.length > 0) {
      setLoadedAssignmentIds(prev => {
        const next = new Set(prev);
        next.add(personId);
        return next;
      });
      return person.assignments;
    }
    setLoadingAssignments(prev => new Set(prev).add(personId));
    try {
      const rows = await assignmentsApi.byPerson(personId);
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, assignments: rows } : p)));
      setLoadedAssignmentIds(prev => {
        const next = new Set(prev);
        next.add(personId);
        return next;
      });
      // Keep hoursByPerson in sync for this person using the refreshed rows
      try {
        const weekKeys = weeks.map(w => w.date);
        setHoursByPerson(prev => {
          const next = { ...prev } as Record<number, Record<string, number>>;
          const totals: Record<string, number> = {};
          for (const wk of weekKeys) {
            let sum = 0;
            for (const a of rows) {
              const wh = (a as any).weeklyHours || {};
              const v = parseFloat((wh[wk] ?? 0).toString()) || 0;
              sum += v;
            }
            if (sum !== 0) totals[wk] = sum;
          }
          if (Object.keys(totals).length > 0) {
            next[personId] = { ...(next[personId] || {}), ...totals };
          }
          return next;
        });
      } catch {}
      return rows || [];
    } catch (e: any) {
      showToast('Failed to load assignments: ' + (e?.message || 'Unknown error'), 'error');
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, isExpanded: false } : p)));
      return [];
    } finally {
      setLoadingAssignments(prev => { const n = new Set(prev); n.delete(personId); return n; });
    }
    return person?.assignments || [];
  };

  // Manual refresh for a person's assignments on demand
  const refreshPersonAssignments = async (personId: number) => {
    setLoadingAssignments(prev => new Set(prev).add(personId));
    try {
      const rows = await assignmentsApi.byPerson(personId);
      setPeople(prev => prev.map(p => (p.id === personId ? { ...p, assignments: rows } : p)));
      setLoadedAssignmentIds(prev => {
        const next = new Set(prev);
        next.add(personId);
        return next;
      });
      // Recompute aggregated totals for this person from refreshed rows
      try {
        const weekKeys = weeks.map(w => w.date);
        setHoursByPerson(prev => {
          const next = { ...prev } as Record<number, Record<string, number>>;
          const totals: Record<string, number> = {};
          for (const wk of weekKeys) {
            let sum = 0;
            for (const a of rows) {
              const wh = (a as any).weeklyHours || {};
              const v = parseFloat((wh[wk] ?? 0).toString()) || 0;
              sum += v;
            }
            if (sum !== 0) totals[wk] = sum;
          }
          if (Object.keys(totals).length > 0) {
            next[personId] = { ...(next[personId] || {}), ...totals };
          }
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

  // Refresh assignments for all people (both expanded and collapsed) using a single bulk call
  const refreshAllAssignments = async () => {
    if (people.length === 0) {
      showToast('No people available to refresh', 'warning');
      return;
    }

    const personIds = people.map(p => p.id!).filter((id): id is number => typeof id === 'number');
    if (personIds.length === 0) {
      showToast('No people available to refresh', 'warning');
      return;
    }

    setLoadingAssignments(prev => {
      const next = new Set(prev);
      personIds.forEach(id => next.add(id));
      return next;
    });

    try {
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const bulk = await assignmentsApi.listAll({ department: dept, include_children: dept != null ? inc : undefined });
      const allAssignments = Array.isArray(bulk) ? bulk : [];

      const byPerson = new Map<number, Assignment[]>();
      for (const a of allAssignments) {
        const pid = (a as any).person as number | undefined;
        if (!pid) continue;
        const current = byPerson.get(pid) || [];
        current.push(a);
        byPerson.set(pid, current);
      }

      setPeople(prev => prev.map(person => {
        const id = person.id!;
        const rows = byPerson.get(id) || [];
        return { ...person, assignments: rows };
      }));

      setAssignmentsData(allAssignments);

      try {
        const weekKeys = weeks.map(w => w.date);
        setHoursByPerson(() => {
          const next: Record<number, Record<string, number>> = {};
          for (const [pid, rows] of byPerson.entries()) {
            const totals: Record<string, number> = {};
            for (const wk of weekKeys) {
              let sum = 0;
              for (const a of rows) {
                const wh = (a as any).weeklyHours || {};
                const v = parseFloat((wh[wk] ?? 0).toString()) || 0;
                sum += v;
              }
              if (sum !== 0) totals[wk] = sum;
            }
            next[pid] = totals;
          }
          return next;
        });
      } catch {}

      setLoadedAssignmentIds(() => new Set(personIds));
      showToast(`Refreshed assignments for all ${people.length} people`, 'success');
    } catch (error) {
      showToast('Failed to refresh some assignments', 'error');
    } finally {
      setLoadingAssignments(prev => {
        const next = new Set(prev);
        personIds.forEach(id => next.delete(id));
        return next;
      });
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

  const handleMobileAssignmentPress = (personId: number, assignmentId: number) => {
    setMobileEditTarget({ personId, assignmentId });
    void ensureAssignmentsLoaded(personId);
  };

  // Status filter matching provided by useProjectStatusFilters

  // Status filter matching provided by useProjectStatusFilters

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
      const newAssignment = await createAssignment({
        person: personId,
        project: project.id!,
        weeklyHours: {}
      }, assignmentsApi);
      
      setPeople(prev => prev.map(person => 
        person.id === personId 
          ? { ...person, assignments: [...person.assignments, newAssignment] }
          : person
      ));
      setAssignmentsData(prev => [...prev, newAssignment]);
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
    await removeAssignmentAction({ assignmentsApi, setPeople, people, personId, assignmentId, showToast });
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

  type AutoHoursUpdate = {
    personId: number;
    assignmentId: number;
    weeklyHours: Record<string, number>;
    prevWeeklyHours: Record<string, number>;
    weeksTouched: string[];
  };

  const buildAutoHoursUpdates = useCallback((
    assignments: Assignment[],
    person: PersonWithAssignments,
    mode: 'replace' | 'supplement'
  ) => {
    const updates: AutoHoursUpdate[] = [];
    const skipped = { missingRole: 0, missingSettings: 0, missingDeliverables: 0, missingCapacity: 0 };
    for (const assignment of assignments || []) {
      if (!assignment?.id) continue;
      const roleId = assignment.roleOnProjectId ?? null;
      if (!roleId) {
        skipped.missingRole += 1;
        continue;
      }
      const projectId = assignment.project ?? null;
      const project = projectId ? (projectsById as Map<number, any>).get(projectId) : null;
      const templateId = project?.autoHoursTemplateId ?? null;
      const deliverableEntries = projectId ? deliverableWeekEntriesByProject.get(projectId) : null;
      if (!projectId || !deliverableEntries || deliverableEntries.length === 0) {
        skipped.missingDeliverables += 1;
        continue;
      }
      const capacity = person.weeklyCapacity ?? assignment.personWeeklyCapacity ?? 0;
      if (!capacity || capacity <= 0) {
        skipped.missingCapacity += 1;
        continue;
      }
      const targetWeeks = new Set<string>();
      const totals = new Map<string, number>();
      let hasAnySettings = false;
      deliverableEntries.forEach(({ weekIndex: deliverableIndex, phase }) => {
        let settings: AutoHoursRoleSetting | undefined;
        if (templateId) {
          const allowedPhases = autoHoursTemplatePhaseKeysById.get(templateId);
          if (allowedPhases && !allowedPhases.has(phase)) {
            settings = autoHoursSettingsByPhaseMap?.[phase]?.get(roleId);
          } else {
            settings = autoHoursTemplateSettingsByPhaseMap?.[templateId]?.[phase]?.get(roleId);
          }
        } else {
          settings = autoHoursSettingsByPhaseMap?.[phase]?.get(roleId);
        }
        if (!settings) {
          return;
        }
        hasAnySettings = true;
        for (let offset = 0; offset <= AUTO_HOURS_MAX_WEEKS; offset += 1) {
          const targetIndex = deliverableIndex - offset;
          if (targetIndex < 0 || targetIndex >= weeks.length) continue;
          const weekKey = weeks[targetIndex]?.date;
          if (!weekKey) continue;
          targetWeeks.add(weekKey);
          const pct = settings.percentByWeek?.[String(offset)] ?? 0;
          totals.set(weekKey, (totals.get(weekKey) || 0) + pct);
        }
      });
      if (!hasAnySettings) {
        skipped.missingSettings += 1;
        continue;
      }
      if (targetWeeks.size === 0) {
        skipped.missingDeliverables += 1;
        continue;
      }
      const prevWeeklyHours = { ...(assignment.weeklyHours || {}) };
      const nextWeeklyHours = { ...(assignment.weeklyHours || {}) };
      const weeksTouched: string[] = [];
      let changed = false;
      targetWeeks.forEach((weekKey) => {
        const pct = clampPercent(totals.get(weekKey) || 0);
        const hours = roundHours((capacity || 0) * pct / 100);
        if (mode === 'supplement') {
          const current = Number(nextWeeklyHours[weekKey] ?? 0) || 0;
          if (current > 0 || hours <= 0) return;
          nextWeeklyHours[weekKey] = hours;
          weeksTouched.push(weekKey);
          changed = true;
          return;
        }
        const current = Number(nextWeeklyHours[weekKey] ?? 0) || 0;
        if (current !== hours) changed = true;
        nextWeeklyHours[weekKey] = hours;
        weeksTouched.push(weekKey);
      });
      if (!changed) continue;
      updates.push({
        personId: person.id!,
        assignmentId: assignment.id!,
        weeklyHours: nextWeeklyHours,
        prevWeeklyHours,
        weeksTouched,
      });
    }
    return { updates, skipped };
  }, [autoHoursSettingsByPhaseMap, autoHoursTemplatePhaseKeysById, autoHoursTemplateSettingsByPhaseMap, deliverableWeekEntriesByProject, projectsById, weeks]);

  const applyAutoHoursUpdates = async (updates: AutoHoursUpdate[]) => {
    if (!updates.length) {
      showToast('No auto hours changes to apply.', 'info');
      return;
    }
    const updatesByAssignmentId = new Map<number, Record<string, number>>();
    const updatesByPerson = new Map<number, AutoHoursUpdate[]>();
    const byPersonWeeks = new Map<number, Set<string>>();
    updates.forEach((u) => {
      updatesByAssignmentId.set(u.assignmentId, u.weeklyHours);
      const list = updatesByPerson.get(u.personId) || [];
      list.push(u);
      updatesByPerson.set(u.personId, list);
      const weeksSet = byPersonWeeks.get(u.personId) || new Set<string>();
      u.weeksTouched.forEach((wk) => weeksSet.add(wk));
      byPersonWeeks.set(u.personId, weeksSet);
    });

    setPeople(prev => prev.map((person: any) => {
      const personUpdates = updatesByPerson.get(person.id) || [];
      if (personUpdates.length === 0) return person;
      return {
        ...person,
        assignments: person.assignments.map((assignment: any) => {
          const u = personUpdates.find(x => x.assignmentId === assignment.id);
          return u ? { ...assignment, weeklyHours: u.weeklyHours } : assignment;
        }),
      };
    }));
    setAssignmentsData(prev => prev.map((a: any) => {
      const u = updatesByAssignmentId.get(a.id as number);
      return u ? { ...a, weeklyHours: u } : a;
    }));

    try {
      setHoursByPerson(prev => {
        const next: Record<number, Record<string, number>> = { ...prev };
        for (const [pid, weeksSet] of byPersonWeeks.entries()) {
          const person = people.find(p => p.id === pid);
          if (!person) continue;
          if (!next[pid]) next[pid] = { ...(prev[pid] || {}) };
          for (const wk of weeksSet) {
            const total = (person.assignments || []).reduce((sum: number, a: any) => {
              const wh = updatesByAssignmentId.get(a.id as number) || a.weeklyHours || {};
              const v = parseFloat((wh?.[wk] as any)?.toString?.() || '0') || 0;
              return sum + v;
            }, 0);
            next[pid][wk] = total;
          }
        }
        return next;
      });
    } catch {}

    let results: PromiseSettledResult<any>[] = [];
    const updatesPayload = updates.map(u => ({ assignmentId: u.assignmentId, weeklyHours: u.weeklyHours }));
    if (updatesPayload.length > 1) {
      try {
        const bulk = await bulkUpdateAssignmentHours(updatesPayload, assignmentsApi);
        results = (bulk?.results || []).map((r: any) => ({ status: 'fulfilled', value: r })) as PromiseSettledResult<any>[];
      } catch (e) {
        results = updatesPayload.map(() => ({ status: 'rejected', reason: e })) as PromiseSettledResult<any>[];
      }
    } else {
      results = await Promise.allSettled(
        updatesPayload.map(u => updateAssignment(u.assignmentId, { weeklyHours: u.weeklyHours }, assignmentsApi))
      );
    }

    const failed: AutoHoursUpdate[] = [];
    results.forEach((res, idx) => {
      if (res.status === 'rejected') failed.push(updates[idx]);
    });

    if (results.some(r => r.status === 'fulfilled')) {
      queryClient.invalidateQueries({ queryKey: ['capacityHeatmap'] });
      queryClient.invalidateQueries({ queryKey: ['workloadForecast'] });
    }

    if (failed.length > 0) {
      const failedByAssignmentId = new Map<number, AutoHoursUpdate>();
      const failedByPersonWeeks = new Map<number, Set<string>>();
      failed.forEach((f) => {
        failedByAssignmentId.set(f.assignmentId, f);
        const weeksSet = failedByPersonWeeks.get(f.personId) || new Set<string>();
        f.weeksTouched.forEach((wk) => weeksSet.add(wk));
        failedByPersonWeeks.set(f.personId, weeksSet);
      });
      setPeople(prev => prev.map((person: any) => {
        const failedForPerson = failed.filter(f => f.personId === person.id);
        if (failedForPerson.length === 0) return person;
        return {
          ...person,
          assignments: person.assignments.map((assignment: any) => {
            const f = failedByAssignmentId.get(assignment.id as number);
            return f ? { ...assignment, weeklyHours: f.prevWeeklyHours } : assignment;
          }),
        };
      }));
      setAssignmentsData(prev => prev.map((a: any) => {
        const f = failedByAssignmentId.get(a.id as number);
        return f ? { ...a, weeklyHours: f.prevWeeklyHours } : a;
      }));
      try {
        setHoursByPerson(prev => {
          const next: Record<number, Record<string, number>> = { ...prev };
          for (const [pid, weeksSet] of failedByPersonWeeks.entries()) {
            const person = people.find(p => p.id === pid);
            if (!person) continue;
            if (!next[pid]) next[pid] = { ...(prev[pid] || {}) };
            for (const wk of weeksSet) {
              const total = (person.assignments || []).reduce((sum: number, a: any) => {
                const failedEntry = failedByAssignmentId.get(a.id as number);
                if (failedEntry) {
                  const v = parseFloat((failedEntry.prevWeeklyHours?.[wk] as any)?.toString?.() || '0') || 0;
                  return sum + v;
                }
                const updated = updatesByAssignmentId.get(a.id as number);
                const wh = updated || a.weeklyHours || {};
                const v = parseFloat((wh?.[wk] as any)?.toString?.() || '0') || 0;
                return sum + v;
              }, 0);
              next[pid][wk] = total;
            }
          }
          return next;
        });
      } catch {}
      showToast(`Failed to update ${failed.length} assignment(s). Changes were reverted for those.`, 'error');
    } else {
      showToast(`Auto hours applied to ${updates.length} assignment${updates.length === 1 ? '' : 's'}.`, 'success');
    }
  };

  const describeAutoHoursSkip = (skipped: { missingRole: number; missingSettings: number; missingDeliverables: number; missingCapacity: number }) => {
    const reasons: string[] = [];
    if (skipped.missingRole) reasons.push('missing project role');
    if (skipped.missingSettings) reasons.push('missing presets');
    if (skipped.missingDeliverables) reasons.push('no deliverables in range');
    if (skipped.missingCapacity) reasons.push('missing capacity');
    return reasons.length ? `No auto hours changes to apply (${reasons.join(', ')}).` : 'No auto hours changes to apply.';
  };

  const applyAutoHoursForPerson = async (person: PersonWithAssignments, mode: 'replace' | 'supplement') => {
    if (!canUseAutoHours) {
      showToast('Auto hours actions are restricted to admins and managers.', 'warning');
      return;
    }
    if (phaseMappingError) {
      showToast(phaseMappingError, 'warning');
    }
    if (autoHoursSettingsLoading) {
      showToast('Auto hours settings are still loading.', 'info');
      return;
    }
    if (autoHoursSettingsError) {
      showToast(autoHoursSettingsError, 'error');
      return;
    }
    if (mode === 'replace' && !confirm('This will replace hours based on auto hours presets and may overwrite existing hours. Continue?')) {
      return;
    }
    const assignments = await ensureAssignmentsLoaded(person.id!);
    if (!assignments || assignments.length === 0) {
      showToast('No assignments found for this person.', 'info');
      return;
    }
    const templateIds = assignments
      .map(a => {
        const project = a.project ? (projectsById as Map<number, any>).get(a.project) : null;
        return project?.autoHoursTemplateId ?? null;
      })
      .filter((id): id is number => typeof id === 'number');
    await ensureTemplateSettings(templateIds);
    const { updates, skipped } = buildAutoHoursUpdates(assignments, person, mode);
    if (updates.length === 0) {
      showToast(describeAutoHoursSkip(skipped), 'info');
      return;
    }
    await applyAutoHoursUpdates(updates);
  };

  const applyAutoHoursForAssignment = async (
    assignment: Assignment,
    personId: number,
    mode: 'replace' | 'supplement'
  ) => {
    if (!canUseAutoHours) {
      showToast('Auto hours actions are restricted to admins and managers.', 'warning');
      return;
    }
    if (phaseMappingError) {
      showToast(phaseMappingError, 'warning');
    }
    if (autoHoursSettingsLoading) {
      showToast('Auto hours settings are still loading.', 'info');
      return;
    }
    if (autoHoursSettingsError) {
      showToast(autoHoursSettingsError, 'error');
      return;
    }
    if (mode === 'replace' && !confirm('This will replace hours based on auto hours presets and may overwrite existing hours. Continue?')) {
      return;
    }
    const person = people.find(p => p.id === personId);
    if (!person) return;
    const project = assignment.project ? (projectsById as Map<number, any>).get(assignment.project) : null;
    const templateId = project?.autoHoursTemplateId ?? null;
    if (templateId) {
      await ensureTemplateSettings([templateId]);
    }
    const { updates, skipped } = buildAutoHoursUpdates([assignment], person, mode);
    if (updates.length === 0) {
      showToast(describeAutoHoursSkip(skipped), 'info');
      return;
    }
    await applyAutoHoursUpdates(updates);
  };

  const { data: schemeData } = useUtilizationScheme({ enabled: false });
  const scheme = schemeData ?? defaultUtilizationScheme;
  const topBarHeader = (
    <div className="flex flex-col gap-2 min-w-0 w-full">
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        <div className="min-w-[120px]">
          <div className="text-lg font-semibold text-[var(--text)] leading-tight">Assignments</div>
          {isFetching ? (
            <div className="text-[10px] text-[var(--muted)]">Refreshing…</div>
          ) : null}
        </div>
        <WeeksSelector value={weeksHorizon} onChange={setWeeksHorizon} />
        <HeaderActions
          onExpandAll={async () => { try { setPeople(prev => prev.map(p => ({...p,isExpanded:true}))); await refreshAllAssignments(); } catch {} }}
          onCollapseAll={() => setPeople(prev => prev.map(p => ({...p,isExpanded:false})))}
          onRefreshAll={refreshAllAssignments}
          disabled={loading || (loadingAssignments.size > 0)}
        />
        <a
          href={buildProjectAssignmentsLink({ weeks: weeksHorizon, statuses: (Array.from(selectedStatusFilters) || []).filter(s => s !== 'Show All') })}
          className="px-2 py-0.5 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
        >
          Project View
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <StatusFilterChips
          options={statusFilterOptions as unknown as readonly string[]}
          selected={selectedStatusFilters as unknown as Set<string>}
          format={formatFilterStatus as any}
          onToggle={(s) => toggleStatusFilter(s as any)}
        />
      </div>
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

  const mobileToolbar = (
    <div className="md:hidden sticky top-0 z-30 bg-[var(--bg)] border border-[var(--border)] rounded-lg shadow-sm px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-1">
        <WeeksSelector value={weeksHorizon} onChange={setWeeksHorizon} />
        <button
          type="button"
          className="px-3 py-1 rounded-full border border-[var(--border)] text-xs text-[var(--text)]"
          onClick={refreshAllAssignments}
          disabled={loading || loadingAssignments.size > 0}
        >
          Refresh
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <StatusFilterChips
          options={statusFilterOptions as unknown as readonly string[]}
          selected={selectedStatusFilters as unknown as Set<string>}
          format={formatFilterStatus as any}
          onToggle={(s) => toggleStatusFilter(s as any)}
        />
      </div>
      {!canEditAssignments && (
        <div className="text-xs text-[var(--muted)]">Editing disabled for your role. You can still view assignments.</div>
      )}
    </div>
  );

  return (
    <Layout>
      {compact && !isMobileLayout && (<TopBarPortal side="right">{topBarHeader}</TopBarPortal>)}
      {isMobileLayout ? (
        <div className="flex-1 flex flex-col min-w-0 px-4 py-4 space-y-4">
          {mobileToolbar}
          <MobilePersonAccordions
            people={people as any}
            weeks={weeks}
            hoursByPerson={hoursByPerson}
            onExpand={(pid) => ensureAssignmentsLoaded(pid)}
            onAssignmentPress={handleMobileAssignmentPress}
            canEditAssignments={canEditAssignments}
            onAddAssignment={(pid) => addUI.open(pid)}
            activeAddPersonId={addUI.isAddingFor}
            scheme={scheme}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
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
              departmentsOverride={departments}
            />
          )}
          <WeekHeaderComp
            top={compact ? 0 : headerHeight}
            minWidth={totalMinWidth}
            gridTemplate={gridTemplate}
            weeks={isMobileLayout ? mobileWeeks : weeks}
            onStartResize={startColumnResize}
            scrollRef={headerScrollRef}
            onScroll={handleHeaderScroll}
            onClientClick={() => setPersonSortMode('client_project')}
            onWeeksClick={() => setPersonSortMode('deliverable')}
            virtualPaddingLeft={isMobileLayout ? weekPaddingLeft : 0}
            virtualPaddingRight={isMobileLayout ? weekPaddingRight : 0}
            showAutoHoursHeader={canUseAutoHours}
          />
          <DeliverableLegendFloating top={(compact ? 0 : headerHeight) + 8} />
          <div
            className={`flex-1 overflow-x-auto bg-[var(--bg)] ${isMobileLayout ? 'snap-x snap-mandatory' : ''}`}
            ref={bodyScrollRef}
            onScroll={handleBodyScroll}
          >
            <div style={{ minWidth: totalMinWidth }}>
              <div>
                <PeopleSection
                  people={people as any}
                  weeks={isMobileLayout ? mobileWeeks : weeks}
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
                  virtualPaddingLeft={isMobileLayout ? weekPaddingLeft : 0}
                  virtualPaddingRight={isMobileLayout ? weekPaddingRight : 0}
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
                  renderAutoHoursAction={(person) => (
                    canUseAutoHours ? (
                      <AutoHoursActionButtons
                        onReplace={() => void applyAutoHoursForPerson(person as any, 'replace')}
                        onSupplement={() => void applyAutoHoursForPerson(person as any, 'supplement')}
                      />
                    ) : null
                  )}
                  renderAddRow={(person) => (
                    <AddAssignmentRow
                      personId={person.id!}
                      weeks={isMobileLayout ? mobileWeeks : weeks}
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
                    const pill = getUtilizationPill({ hours: totalHours, capacity: (p as any).weeklyCapacity!, scheme, output: 'classes' });
                    const aria = totalHours > 0 ? `${totalHours} hours` : '0 hours';
                    return (
                      <div className={`inline-flex items-center justify-center h-6 px-2 leading-none rounded-full text-xs font-medium min-w-[40px] text-center ${pill.classes}`} aria-label={aria}>
                        {pill.label}
                      </div>
                    );
                  }}
                  onAutoHoursReplaceAssignment={canUseAutoHours ? ((assignment, personId) => void applyAutoHoursForAssignment(assignment, personId, 'replace')) : undefined}
                  onAutoHoursSupplementAssignment={canUseAutoHours ? ((assignment, personId) => void applyAutoHoursForAssignment(assignment, personId, 'supplement')) : undefined}
                  />
              </div>
              {(() => {
                const s = scheme;
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
                return <StatusBar labels={labels} selectionSummary={selectionSummary} />;
              })()}
            </div>
          </div>
        </div>
      )}
      {isMobileLayout ? (
        <MobileAddAssignmentSheet addController={addUI} people={people as any} canEditAssignments={canEditAssignments} />
      ) : null}
      <MobileAssignmentSheet
        target={mobileEditTarget}
        people={people as any}
        weeks={weeks}
        onClose={() => setMobileEditTarget(null)}
        onSaveHours={updateAssignmentHours}
        onRoleChange={handleAssignmentRoleChange}
        loadingAssignments={loadingAssignments}
        canEditAssignments={canEditAssignments}
      />
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
