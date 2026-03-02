import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/layout/Layout';
import AssignmentsSkeleton from '@/components/skeletons/AssignmentsSkeleton';
import PageState from '@/components/ui/PageState';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useAssignmentsSnapshot } from '@/pages/Assignments/grid/useAssignmentsSnapshot';
import { useGridUrlState } from '@/pages/Assignments/grid/useGridUrlState';
import { useEditingCell as useEditingCellHook } from '@/pages/Assignments/grid/useEditingCell';
import { useAssignmentsInteractionStore } from '@/pages/Assignments/grid/useAssignmentsInteractionStore';
import { useGridKeyboardNavigation } from '@/pages/Assignments/grid/useGridKeyboardNavigation';
import { useDeliverablesIndex } from '@/pages/Assignments/grid/useDeliverablesIndex';
import { useDeliverableBars } from '@/pages/Assignments/grid/useDeliverableBars';
import { useGridColumnWidthsAssign } from '@/pages/Assignments/grid/useGridColumnWidths';
import { useProjectStatusFilters } from '@/pages/Assignments/grid/useProjectStatusFilters';
import { useProjectStatusSubscription } from '@/components/projects/useProjectStatusSubscription';
import { useStatusControls } from '@/pages/Assignments/grid/useStatusControls';
import StatusBadge from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import { searchProjectRoles, type ProjectRole } from '@/roles/api';
import RoleDropdown from '@/roles/components/RoleDropdown';
import RemoveAssignmentButton from '@/pages/Assignments/grid/components/RemoveAssignmentButton';
import WeekCell from '@/pages/Assignments/grid/components/WeekCell';
import AutoHoursActionButtons from '@/pages/Assignments/grid/components/AutoHoursActionButtons';
import PlaceholderPersonSwap from '@/components/assignments/PlaceholderPersonSwap';
import HeaderActions from '@/components/compact/HeaderActions';
import AssignmentsFilterMenu from '@/components/compact/AssignmentsFilterMenu';
import WeeksHorizonField from '@/components/compact/WeeksHorizonField';
import TopBarPortal from '@/components/layout/TopBarPortal';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrManager } from '@/utils/roleAccess';
import { emitToast, showToast as showToastBus } from '@/lib/toastBus';
import { getFlag } from '@/lib/flags';
import { confirmAction } from '@/lib/confirmAction';
import SaveStateBadge, { type SaveState } from '@/components/ux/SaveStateBadge';
import { usePageShortcuts } from '@/hooks/usePageShortcuts';
import { useRouteUiState } from '@/hooks/useRouteUiState';
import MobileProjectAccordions from '@/pages/Assignments/project/components/MobileProjectAccordions';
import MobileProjectAddAssignmentSheet from '@/pages/Assignments/project/components/MobileProjectAddAssignmentSheet';
import MobileProjectAssignmentSheet from '@/pages/Assignments/project/components/MobileProjectAssignmentSheet';
import { Assignment, Deliverable, DeliverablePhaseMappingSettings, Person, Project, AutoHoursTemplate } from '@/types/models';
import { assignmentsApi, autoHoursSettingsApi, autoHoursTemplatesApi, deliverablePhaseMappingApi, peopleApi, projectsApi, type AutoHoursRoleSetting } from '@/services/api';
import { updateAssignmentRoleAction } from '@/pages/Assignments/grid/useAssignmentRoleUpdate';
import { bulkUpdateAssignmentHours, createAssignment, updateAssignment, deleteAssignment } from '@/lib/mutations/assignments';
import { useWeekVirtualization } from '@/pages/Assignments/grid/useWeekVirtualization';
import { subscribeGridRefresh } from '@/lib/gridRefreshBus';
import { subscribeAssignmentsRefresh, type AssignmentEvent } from '@/lib/assignmentsRefreshBus';
import { buildAssignmentsLink } from '@/pages/Assignments/grid/linkUtils';
import DeliverableLegendFloating from '@/components/deliverables/DeliverableLegendFloating';
import { classifyWorkloadTokenTerm, filterTextCompatibleTokens, hasInvalidWorkloadLikeTokens, normalizeWorkloadAliasTerm } from '@/utils/workloadSearch';
import { useProjectStatusDefinitions } from '@/hooks/useProjectStatusDefinitions';

interface ProjectWithAssignments extends Project {
  assignments: Assignment[];
  isExpanded: boolean;
}

const DEFAULT_AUTO_HOURS_WEEKS_COUNT = 6;
const MAX_AUTO_HOURS_WEEKS_COUNT = 18;
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const roundHours = (value: number) => (Number.isFinite(value) ? Math.ceil(value) : 0);
const normalizeWeeksCount = (value: unknown, fallback = DEFAULT_AUTO_HOURS_WEEKS_COUNT) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(n, MAX_AUTO_HOURS_WEEKS_COUNT));
};
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
const MOBILE_PROJECT_PAGE_SIZE = 50;
const getCurrentSundayIso = () => {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - day);
  return sunday.toISOString().slice(0, 10);
};
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

const ProjectAssignmentsGrid: React.FC = () => {
  const pageStateEnabled = true;
  const { state: deptState } = useDepartmentFilter();
  const { state: verticalState } = useVerticalFilter();
  const { state: routeUiState, update: updateRouteUiState } = useRouteUiState('project-assignments');
  const auth = useAuth();
  const canUseAutoHours = isAdminOrManager(auth.user);
  const canEditAssignments = true;
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');
  const isNarrowHeaderLayout = useMediaQuery('(max-width: 1700px)');
  const useAbbrevHeaderLabels = !isMobileLayout && isNarrowHeaderLayout;
  const query = useGridUrlState();
  const departmentFilters = useMemo(() => (deptState.filters ?? [])
    .map((f) => ({ departmentId: Number(f.departmentId), op: f.op }))
    .filter((f) => Number.isFinite(f.departmentId) && f.departmentId > 0), [deptState.filters]);
  const departmentFiltersPayload = useMemo(
    () => (deptState.selectedDepartmentId == null ? departmentFilters : []),
    [deptState.selectedDepartmentId, departmentFilters]
  );

  const [people, setPeople] = useState<Person[]>([]);
  const [assignmentsData, setAssignmentsData] = useState<Assignment[]>([]);
  const [projectsData, setProjectsData] = useState<Project[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [, setHoursByPerson] = useState<Record<number, Record<string, number>>>({});
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<number>>(new Set(routeUiState.expandedIds || []));
  const [loadingAssignments, setLoadingAssignments] = useState<Set<number>>(new Set());
  const [loadedProjectIds, setLoadedProjectIds] = useState<Set<number>>(new Set());
  const [mobileAssignmentPageByProject, setMobileAssignmentPageByProject] = useState<Record<number, number>>({});
  const [mobileHasMoreAssignmentsByProject, setMobileHasMoreAssignmentsByProject] = useState<Record<number, boolean>>({});
  const [mobileLoadingMoreByProject, setMobileLoadingMoreByProject] = useState<Set<number>>(new Set());
  const [mobileAssignmentTarget, setMobileAssignmentTarget] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTokens, setSearchTokens] = useState<Array<{ id: string; term: string; op: 'or' | 'and' | 'not' }>>([]);
  const [searchOp, setSearchOp] = useState<'or' | 'and' | 'not'>('or');
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
  const searchTokenSeq = useRef(0);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectsCount, setProjectsCount] = useState(0);
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsPageSize] = useState(50);
  const [hasMoreProjects, setHasMoreProjects] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveStateMessage, setSaveStateMessage] = useState<string | undefined>(undefined);
  const saveStateTimerRef = useRef<number | null>(null);
  const lastRetryRef = useRef<null | (() => Promise<void>)>(null);
  const markSaveState = useCallback((nextState: SaveState, message?: string, autoResetMs = 0) => {
    setSaveState(nextState);
    setSaveStateMessage(message);
    if (saveStateTimerRef.current) {
      window.clearTimeout(saveStateTimerRef.current);
      saveStateTimerRef.current = null;
    }
    if (autoResetMs > 0) {
      saveStateTimerRef.current = window.setTimeout(() => {
        setSaveState('idle');
        setSaveStateMessage(undefined);
        saveStateTimerRef.current = null;
      }, autoResetMs);
    }
  }, []);
  useEffect(() => {
    return () => {
      if (saveStateTimerRef.current) {
        window.clearTimeout(saveStateTimerRef.current);
      }
    };
  }, []);

  const [phaseMapping, setPhaseMapping] = useState<DeliverablePhaseMappingSettings | null>(null);
  const [phaseMappingError, setPhaseMappingError] = useState<string | null>(null);
  const phaseMappingEffective = useMemo(() => phaseMapping || DEFAULT_PHASE_MAPPING, [phaseMapping]);
  const autoHoursPhases = useMemo(() => {
    const keys = (phaseMappingEffective.phases || []).map(p => p.key).filter(Boolean);
    return keys.length ? keys : Array.from(DEFAULT_AUTO_HOURS_PHASES);
  }, [phaseMappingEffective]);

  const [autoHoursSettingsByPhase, setAutoHoursSettingsByPhase] = useState<Record<string, AutoHoursRoleSetting[]>>({});
  const [autoHoursSettingsLoading, setAutoHoursSettingsLoading] = useState(false);
  const [autoHoursSettingsError, setAutoHoursSettingsError] = useState<string | null>(null);
  const [autoHoursTemplateSettings, setAutoHoursTemplateSettings] = useState<Record<number, Record<string, AutoHoursRoleSetting[]>>>({});
  const [autoHoursTemplateSettingsLoading, setAutoHoursTemplateSettingsLoading] = useState<Set<number>>(new Set());
  const [autoHoursTemplates, setAutoHoursTemplates] = useState<AutoHoursTemplate[]>([]);

  const [weeksHorizon, setWeeksHorizon] = useState(20);
  const snapshotAutoHoursTemplateIds = useMemo(() => {
    const ids = new Set<number>();
    (projectsData || []).forEach((project) => {
      const value = Number((project as any)?.autoHoursTemplateId);
      if (!Number.isFinite(value) || value <= 0) return;
      ids.add(Math.trunc(value));
    });
    return Array.from(ids).sort((a, b) => a - b).slice(0, 200);
  }, [projectsData]);
  const setProjectsDataFromSnapshot = useCallback(() => {
    // Keep project list controlled by paged search results to avoid snapshot overrides.
  }, []);
  const snapshot = useAssignmentsSnapshot({
    weeksHorizon,
    departmentId: deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId),
    includeChildren: deptState.includeChildren,
    departmentFilters: deptState.selectedDepartmentId == null ? departmentFiltersPayload : undefined,
    vertical: verticalState.selectedVerticalId ?? undefined,
    include: 'assignment',
    requestAutoHoursBundle: canUseAutoHours && getFlag('FF_ASSIGNMENTS_AUTO_HOURS_BUNDLE', true),
    autoHoursPhases,
    autoHoursTemplateIds: snapshotAutoHoursTemplateIds,
    setPeople: setPeople as any,
    setAssignmentsData,
    setProjectsData: setProjectsDataFromSnapshot as any,
    setDeliverables,
    setHoursByPerson,
    getHasData: () => projectsData.length > 0 || assignmentsData.length > 0,
    setIsFetching,
    subscribeGridRefresh,
    showToast: (msg, type) => showToastBus(msg, type),
    setError,
    setLoading,
  });

  const { weeks, departments, snapshotSettled } = snapshot;
  const autoHoursBundle = snapshot.autoHoursBundle;
  const hasAutoHoursBundle = canUseAutoHours && !!autoHoursBundle;
  const shouldUseLegacyAutoHoursFallback = canUseAutoHours && snapshotSettled && !hasAutoHoursBundle;
  const weekKeys = useMemo(() => weeks.map(w => w.date), [weeks]);
  const weekVirtualization = useWeekVirtualization(weeks, 70, 2);
  const visibleWeeks = isMobileLayout ? weekVirtualization.visibleWeeks : weeks;
  const weekPaddingLeft = isMobileLayout ? weekVirtualization.paddingLeft : 0;
  const weekPaddingRight = isMobileLayout ? weekVirtualization.paddingRight : 0;

  const peopleById = useMemo(() => {
    const map = new Map<number, Person>();
    (people || []).forEach(p => { if (p?.id != null) map.set(p.id, p); });
    return map;
  }, [people]);

  const projectsById = useMemo(() => {
    const map = new Map<number, Project & { isUpdating?: boolean }>();
    (projectsData || []).forEach(p => { if (p?.id != null) map.set(p.id, { ...p, isUpdating: false }); });
    return map;
  }, [projectsData]);

  const departmentNameById = useMemo(() => {
    const map = new Map<number, string>();
    (departments || []).forEach((dept: any) => {
      if (dept?.id != null) map.set(dept.id, dept.name || '');
    });
    return map;
  }, [departments]);

  useEffect(() => {
    if (!shouldUseLegacyAutoHoursFallback) return;
    let mounted = true;
    (async () => {
      try {
        const mapping = await deliverablePhaseMappingApi.get();
        if (!mounted || !mapping) return;
        setPhaseMapping(mapping);
      } catch (e: any) {
        if (mounted) setPhaseMappingError(e?.message || 'Failed to load deliverable phase mapping');
      }
    })();
    return () => { mounted = false; };
  }, [shouldUseLegacyAutoHoursFallback]);

  useEffect(() => {
    try {
      query.set('view', 'project');
      const w = query.get('weeks');
      if (w) {
        const n = parseInt(w, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= 52) setWeeksHorizon(n);
      }
    } catch {}
  }, []);
  useEffect(() => { query.set('weeks', String(weeksHorizon)); }, [weeksHorizon]);

  const projectsWithAssignments = useMemo(() => {
    const grouped = new Map<number, Assignment[]>();
    (assignmentsData || []).forEach((assignment) => {
      if (!assignment?.project) return;
      const list = grouped.get(assignment.project) || [];
      list.push(assignment);
      grouped.set(assignment.project, list);
    });
    return (projectsData || []).map((project) => ({
      ...project,
      assignments: grouped.get(project.id!) || [],
      isExpanded: expandedProjectIds.has(project.id!),
    }));
  }, [assignmentsData, projectsData, expandedProjectIds]);
  const visibleProjects = useMemo(() => projectsWithAssignments, [projectsWithAssignments]);
  useEffect(() => {
    updateRouteUiState({ expandedIds: Array.from(expandedProjectIds) });
  }, [expandedProjectIds, updateRouteUiState]);

  useEffect(() => {
    setLoadedProjectIds(new Set());
    setLoadingAssignments(new Set());
  }, [deptState.selectedDepartmentId, deptState.includeChildren, deptState.filters, verticalState.selectedVerticalId, weeksHorizon]);

  const { statusFilterOptions, selectedStatusFilters, formatFilterStatus, toggleStatusFilter } = useProjectStatusFilters(deliverables);
  const { definitionMap, statusOptionKeys } = useProjectStatusDefinitions();

  const normalizedSearchTokens = useMemo(() => {
    return searchTokens
      .map((token) => ({ ...token, term: token.term.trim().toLowerCase() }))
      .filter((token) => token.term.length > 0);
  }, [searchTokens]);
  const workloadHintVisible = useMemo(
    () => hasInvalidWorkloadLikeTokens(searchTokens),
    [searchTokens]
  );

  const statusFilterCsv = useMemo(() => {
    const values = Array.from(selectedStatusFilters || []).filter((s) => s !== 'Show All');
    return values.length ? values.join(',') : null;
  }, [selectedStatusFilters]);

  const searchTokenPayload = useMemo(
    () => normalizedSearchTokens.map((token) => ({ term: token.term, op: token.op })),
    [normalizedSearchTokens]
  );
  const assignmentRowTokenPayload = useMemo(
    () => filterTextCompatibleTokens(normalizedSearchTokens).map((token) => ({ term: token.term, op: token.op })),
    [normalizedSearchTokens]
  );
  const workloadWeekStart = useMemo(() => weeks[0]?.date || getCurrentSundayIso(), [weeks]);
  useEffect(() => {
    if (!isMobileLayout) return;
    setMobileAssignmentPageByProject({});
    setMobileHasMoreAssignmentsByProject({});
    setMobileLoadingMoreByProject(new Set());
  }, [isMobileLayout, deptState.selectedDepartmentId, deptState.includeChildren, deptState.filters, verticalState.selectedVerticalId, weeksHorizon, statusFilterCsv, searchTokenPayload]);

  const activeToken = useMemo(() => (
    activeTokenId ? (searchTokens.find((token) => token.id === activeTokenId) || null) : null
  ), [activeTokenId, searchTokens]);

  useEffect(() => {
    if (activeTokenId && !activeToken) {
      setActiveTokenId(null);
    }
  }, [activeTokenId, activeToken]);

  const addSearchToken = useCallback(() => {
    const term = searchInput.trim();
    if (!term) return;
    const aliased = normalizeWorkloadAliasTerm(term);
    const classified = classifyWorkloadTokenTerm(aliased);
    const storedTerm = classified.isWorkload ? classified.canonicalTerm : aliased;
    const normalized = storedTerm.toLowerCase();
    setSearchTokens((prev) => {
      const alreadyExists = prev.some((token) => token.term.trim().toLowerCase() === normalized && token.op === searchOp);
      if (alreadyExists) return prev;
      const nextId = `search-${searchTokenSeq.current += 1}`;
      return [...prev, { id: nextId, term: storedTerm, op: searchOp }];
    });
    setSearchInput('');
    setActiveTokenId(null);
  }, [searchInput, searchOp]);

  const removeSearchToken = useCallback((id: string) => {
    setSearchTokens((prev) => prev.filter((token) => token.id !== id));
    if (activeTokenId === id) setActiveTokenId(null);
  }, [activeTokenId]);

  const handleSearchOpChange = useCallback((value: 'or' | 'and' | 'not') => {
    if (activeToken) {
      setSearchTokens((prev) => prev.map((token) => token.id === activeToken.id ? { ...token, op: value } : token));
    } else {
      setSearchOp(value);
    }
  }, [activeToken]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSearchToken();
      return;
    }
    if (e.key === 'Backspace' && searchInput.length === 0 && searchTokens.length > 0) {
      e.preventDefault();
      setSearchTokens((prev) => prev.slice(0, -1));
      return;
    }
    if (e.key === 'Escape') {
      setSearchInput('');
      setActiveTokenId(null);
    }
  }, [addSearchToken, searchInput.length, searchTokens.length]);

  const resetProjectAssignmentsState = useCallback(() => {
    setLoadedProjectIds(new Set());
    setLoadingAssignments(new Set());
    setAssignmentsData([]);
  }, []);

  const fetchProjectsPage = useCallback(async (page: number, opts?: { append?: boolean; resetAssignments?: boolean }) => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const deptFilters = dept == null && departmentFiltersPayload.length ? departmentFiltersPayload : undefined;
      const res = await projectsApi.search({
        page,
        page_size: projectsPageSize,
        ordering: 'client,name',
        ...(statusFilterCsv ? { status_in: statusFilterCsv } : {}),
        ...(searchTokenPayload.length ? { search_tokens: searchTokenPayload } : {}),
        workload_week_start: workloadWeekStart,
        workload_weeks: weeksHorizon,
        ...(dept != null ? { department: dept, include_children: inc } : {}),
        ...(deptFilters ? { department_filters: deptFilters } : {}),
        ...(verticalState.selectedVerticalId != null ? { vertical: Number(verticalState.selectedVerticalId) } : {}),
      });
      const rows = res?.results || [];
      setProjectsCount(res?.count ?? rows.length);
      setHasMoreProjects(Boolean(res?.next));
      if (opts?.resetAssignments) resetProjectAssignmentsState();
      setProjectsData(prev => {
        if (!opts?.append) return rows;
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        rows.forEach((p) => {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        });
        return merged;
      });
      setProjectsPage(page);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load projects';
      setProjectsError(msg);
      showToastBus(msg, 'error');
    } finally {
      setProjectsLoading(false);
    }
  }, [
    projectsPageSize,
    resetProjectAssignmentsState,
    searchTokenPayload,
    workloadWeekStart,
    weeksHorizon,
    statusFilterCsv,
    deptState.selectedDepartmentId,
    deptState.includeChildren,
    departmentFiltersPayload,
    verticalState.selectedVerticalId,
  ]);

  useEffect(() => {
    void fetchProjectsPage(1, { append: false, resetAssignments: true });
  }, [fetchProjectsPage, statusFilterCsv, searchTokenPayload]);

  const getVisibleAssignments = useCallback((project: ProjectWithAssignments) => {
    const list = project.assignments || [];
    const withPeople: Assignment[] = [];
    const placeholders: Assignment[] = [];
    list.forEach((assignment) => {
      if (assignment?.person != null) withPeople.push(assignment);
      else placeholders.push(assignment);
    });
    return withPeople.concat(placeholders);
  }, []);

  const rowOrder = useMemo(() => {
    const out: string[] = [];
    for (const project of visibleProjects) {
      if (!project?.id || !project.isExpanded) continue;
      if (loadingAssignments.has(project.id)) continue;
      const list = getVisibleAssignments(project);
      for (const a of list) {
        if (a?.id != null) out.push(`${project.id}:${a.id}`);
      }
    }
    return out;
  }, [visibleProjects, loadingAssignments, getVisibleAssignments]);

  const interaction = useAssignmentsInteractionStore({ weeks: weekKeys, rowOrder });
  const {
    selection: {
      selectedCell: selCell,
      onCellMouseDown: csMouseDown,
      onCellMouseEnter: csMouseEnter,
      onCellSelect: csSelect,
      clearSelection: csClear,
      getSelectedCells,
      isCellSelected: csIsSelected,
    },
    scroll: { headerRef: headerScrollRef, bodyRef: bodyScrollRef, onHeaderScroll, onBodyScroll },
  } = interaction;

  const { editingCell, setEditingCell, editingValue, setEditingValue, startEditing, cancelEdit, sanitizeHours } = useEditingCellHook();

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

  const selectedCell = useMemo(() => {
    if (!selCell) return null;
    const [projectId, assignmentId] = selCell.rowKey.split(':');
    return { projectId: Number(projectId), assignmentId: Number(assignmentId), week: selCell.weekKey };
  }, [selCell]);

  const selectedCells = useMemo(() => {
    const cells = getSelectedCells();
    return cells.map(cell => {
      const [projectId, assignmentId] = cell.rowKey.split(':');
      return { projectId: Number(projectId), assignmentId: Number(assignmentId), week: cell.weekKey };
    });
  }, [getSelectedCells]);
  const focusProjectAssignmentsSearch = useCallback(() => {
    if (typeof document === 'undefined') return;
    const input = document.getElementById('project-assignments-search') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, []);
  const getHoursForCell = useCallback((projectId: number, assignmentId: number, week: string) => {
    const project = visibleProjects.find((item) => item.id === projectId);
    const assignment = project?.assignments?.find((row) => row.id === assignmentId);
    return Number(assignment?.weeklyHours?.[week] || 0);
  }, [visibleProjects]);
  const selectedHoursTotal = useMemo(
    () => selectedCells.reduce((sum, cell) => sum + getHoursForCell(cell.projectId, cell.assignmentId, cell.week), 0),
    [getHoursForCell, selectedCells]
  );
  const selectedHoursLabel = useMemo(() => {
    const rounded = Math.round(selectedHoursTotal * 100) / 100;
    if (Number.isInteger(rounded)) return `${rounded}`;
    return rounded.toFixed(2).replace(/\.?0+$/, '');
  }, [selectedHoursTotal]);

  const findAssignment = useCallback((projectId: number, assignmentId: number) => {
    const project = visibleProjects.find(p => p.id === projectId);
    return !!project?.assignments?.some(a => a.id === assignmentId);
  }, [visibleProjects]);

  useGridKeyboardNavigation({
    selectedCell: selectedCell
      ? { personId: selectedCell.projectId, assignmentId: selectedCell.assignmentId, week: selectedCell.week }
      : null,
    editingCell,
    isAddingAssignment: false,
    weeks,
    csSelect,
    setEditingCell,
    setEditingValue,
    findAssignment: (pid, aid) => findAssignment(pid, aid),
  });

  const { emitStatusChange } = useProjectStatusSubscription({ debug: false });
  const { statusDropdown, projectStatus, getProjectStatus, handleStatusChange } = useStatusControls({
    projectsById,
    setProjectsData: setProjectsData as any,
    emitStatusChange,
    showToast: (msg, type) => showToastBus(msg, type),
  });

  const refreshAutoHoursSettings = useCallback(async () => {
    if (!canUseAutoHours) {
      setAutoHoursSettingsByPhase({});
      setAutoHoursSettingsError(null);
      setAutoHoursSettingsLoading(false);
      return;
    }
    if (!shouldUseLegacyAutoHoursFallback) {
      setAutoHoursSettingsLoading(false);
      return;
    }
    try {
      setAutoHoursSettingsLoading(true);
      setAutoHoursSettingsError(null);
      const results = await Promise.allSettled(
        autoHoursPhases.map(phase => autoHoursSettingsApi.list(undefined, phase))
      );
      const next: Record<string, AutoHoursRoleSetting[]> = {};
      const failures: string[] = [];
      results.forEach((res, idx) => {
        const phase = autoHoursPhases[idx];
        if (res.status === 'fulfilled') next[phase] = res.value?.settings || [];
        else failures.push(phase);
      });
      setAutoHoursSettingsByPhase(next);
      if (failures.length) setAutoHoursSettingsError(`Failed to load auto hours for: ${failures.join(', ')}`);
    } catch (e: any) {
      setAutoHoursSettingsError(e?.message || 'Failed to load auto hours settings');
    } finally {
      setAutoHoursSettingsLoading(false);
    }
  }, [autoHoursPhases, canUseAutoHours, shouldUseLegacyAutoHoursFallback]);

  useEffect(() => { void refreshAutoHoursSettings(); }, [refreshAutoHoursSettings]);

  useEffect(() => {
    if (!canUseAutoHours) {
      setAutoHoursTemplates([]);
      return;
    }
    if (!shouldUseLegacyAutoHoursFallback) {
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const list = await autoHoursTemplatesApi.list();
        if (mounted) setAutoHoursTemplates(list || []);
      } catch {
        if (mounted) setAutoHoursTemplates([]);
      }
    })();
    return () => { mounted = false; };
  }, [canUseAutoHours, shouldUseLegacyAutoHoursFallback]);

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
      showToastBus(e?.message || 'Failed to load auto hours templates', 'error');
    } finally {
      setAutoHoursTemplateSettingsLoading(prev => {
        const next = new Set(prev);
        missing.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [autoHoursPhases, autoHoursTemplatePhaseKeysById, autoHoursTemplateSettings]);

  useEffect(() => {
    if (!canUseAutoHours || !autoHoursBundle) return;
    setAutoHoursSettingsByPhase(autoHoursBundle.defaultSettingsByPhase || {});
    setAutoHoursSettingsLoading(false);
    setAutoHoursSettingsError(null);
    setAutoHoursTemplates((autoHoursBundle.templates || []) as AutoHoursTemplate[]);
    setPhaseMapping((autoHoursBundle.phaseMapping as DeliverablePhaseMappingSettings) || null);
    setPhaseMappingError(null);

    const templateSettingsRaw = autoHoursBundle.templateSettingsByPhase || {};
    const templateSettings: Record<number, Record<string, AutoHoursRoleSetting[]>> = {};
    Object.entries(templateSettingsRaw).forEach(([templateIdRaw, phases]) => {
      const templateId = Number(templateIdRaw);
      if (!Number.isFinite(templateId)) return;
      templateSettings[templateId] = phases || {};
    });
    if (Object.keys(templateSettings).length > 0) {
      setAutoHoursTemplateSettings((prev) => ({ ...prev, ...templateSettings }));
    }
    if (!autoHoursBundle.bundleComplete && (autoHoursBundle.missingTemplateIds || []).length > 0) {
      setAutoHoursSettingsError(
        `Auto hours bundle missing template settings for: ${autoHoursBundle.missingTemplateIds.join(', ')}`
      );
    }
  }, [autoHoursBundle, canUseAutoHours]);

  const autoHoursSettingsByPhaseMap = useMemo(() => {
    const out: Record<string, Map<number, AutoHoursRoleSetting>> = {};
    autoHoursPhases.forEach((phase) => {
      const map = new Map<number, AutoHoursRoleSetting>();
      const rows = autoHoursSettingsByPhase?.[phase] || [];
      for (const setting of rows) map.set(setting.roleId, setting);
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
        for (const setting of rows) map.set(setting.roleId, setting);
        phaseMaps[phase] = map;
      });
      out[templateId] = phaseMaps;
    });
    return out;
  }, [autoHoursPhases, autoHoursTemplateSettings]);

  const autoHoursWeeksCountByPhase = useMemo(() => {
    const out: Record<string, number> = {};
    autoHoursPhases.forEach((phase) => {
      const rows = autoHoursSettingsByPhase?.[phase] || [];
      const weeksCount = rows.find(row => row.weeksCount != null)?.weeksCount;
      out[phase] = normalizeWeeksCount(weeksCount);
    });
    return out;
  }, [autoHoursPhases, autoHoursSettingsByPhase]);

  const autoHoursTemplateWeeksCountByPhase = useMemo(() => {
    const out: Record<number, Record<string, number>> = {};
    Object.entries(autoHoursTemplateSettings || {}).forEach(([tid, phases]) => {
      const templateId = Number(tid);
      const perPhase: Record<string, number> = {};
      autoHoursPhases.forEach((phase) => {
        const rows = phases?.[phase] || [];
        const weeksCount = rows.find(row => row.weeksCount != null)?.weeksCount;
        perPhase[phase] = normalizeWeeksCount(weeksCount);
      });
      out[templateId] = perPhase;
    });
    return out;
  }, [autoHoursPhases, autoHoursTemplateSettings]);

  const getWeeksCountForPhase = useCallback((phase: string, templateId?: number | null) => {
    if (templateId != null) {
      const templateCount = autoHoursTemplateWeeksCountByPhase?.[templateId]?.[phase];
      if (Number.isFinite(templateCount)) return normalizeWeeksCount(templateCount);
    }
    const globalCount = autoHoursWeeksCountByPhase?.[phase];
    if (Number.isFinite(globalCount)) return normalizeWeeksCount(globalCount);
    return DEFAULT_AUTO_HOURS_WEEKS_COUNT;
  }, [autoHoursTemplateWeeksCountByPhase, autoHoursWeeksCountByPhase]);

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

  const getDeliverablesForProjectWeek = useDeliverablesIndex(deliverables);

  const assignmentById = useMemo(() => {
    const map = new Map<number, Assignment>();
    (assignmentsData || []).forEach(a => { if (a?.id != null) map.set(a.id, a); });
    return map;
  }, [assignmentsData]);

  const assignmentsRef = useRef<Assignment[]>([]);
  const assignmentEventQueueRef = useRef<AssignmentEvent[]>([]);
  const assignmentFlushTimerRef = useRef<number | null>(null);

  useEffect(() => {
    assignmentsRef.current = assignmentsData;
  }, [assignmentsData]);

  const applyAutoHoursUpdates = async (updates: Array<{ assignmentId: number; weeklyHours: Record<string, number> }>) => {
    if (!updates.length) {
      showToastBus('No auto hours changes to apply.', 'info');
      return;
    }
    const updatesByAssignmentId = new Map<number, Record<string, number>>();
    updates.forEach((u) => updatesByAssignmentId.set(u.assignmentId, u.weeklyHours));
    setAssignmentsData(prev => prev.map(a => updatesByAssignmentId.has(a.id!) ? { ...a, weeklyHours: updatesByAssignmentId.get(a.id!) } : a));

    try {
      if (updates.length > 1) {
        await bulkUpdateAssignmentHours(updates, assignmentsApi);
      } else {
        await updateAssignment(updates[0].assignmentId, { weeklyHours: updates[0].weeklyHours }, assignmentsApi);
      }
      showToastBus(`Auto hours applied to ${updates.length} assignment${updates.length === 1 ? '' : 's'}.`, 'success');
    } catch (e: any) {
      showToastBus(e?.message || 'Failed to apply auto hours.', 'error');
    }
  };

  const buildAutoHoursUpdatesForAssignments = useCallback((assignments: Assignment[], mode: 'replace' | 'supplement') => {
    const updates: Array<{ assignmentId: number; weeklyHours: Record<string, number> }> = [];
    const skipped = { missingRole: 0, missingSettings: 0, missingDeliverables: 0, missingCapacity: 0 };
    for (const assignment of assignments || []) {
      if (!assignment?.id) continue;
      const roleId = assignment.roleOnProjectId ?? null;
      if (!roleId) { skipped.missingRole += 1; continue; }
      const projectId = assignment.project ?? null;
      const project = projectId ? projectsById.get(projectId) : null;
      const templateId = project?.autoHoursTemplateId ?? null;
      const deliverableEntries = projectId ? deliverableWeekEntriesByProject.get(projectId) : null;
      if (!projectId || !deliverableEntries || deliverableEntries.length === 0) { skipped.missingDeliverables += 1; continue; }
      const person = assignment.person ? peopleById.get(assignment.person) : null;
      const capacity = person?.weeklyCapacity ?? assignment.personWeeklyCapacity ?? 0;
      if (!capacity || capacity <= 0) { skipped.missingCapacity += 1; continue; }

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
        if (!settings) return;
        hasAnySettings = true;
        const weeksCount = getWeeksCountForPhase(phase, templateId);
        const maxOffset = Math.max(0, weeksCount - 1);
        for (let offset = 0; offset <= maxOffset; offset += 1) {
          const targetIndex = deliverableIndex - offset;
          if (targetIndex < 0 || targetIndex >= weeks.length) continue;
          const weekKey = weeks[targetIndex]?.date;
          if (!weekKey) continue;
          targetWeeks.add(weekKey);
          const pct = settings.percentByWeek?.[String(offset)] ?? 0;
          totals.set(weekKey, (totals.get(weekKey) || 0) + pct);
        }
      });
      if (!hasAnySettings) { skipped.missingSettings += 1; continue; }
      if (targetWeeks.size === 0) { skipped.missingDeliverables += 1; continue; }

      const nextWeeklyHours = { ...(assignment.weeklyHours || {}) };
      let changed = false;
      targetWeeks.forEach((weekKey) => {
        const pct = clampPercent(totals.get(weekKey) || 0);
        const hours = roundHours((capacity || 0) * pct / 100);
        if (mode === 'supplement') {
          const current = Number(nextWeeklyHours[weekKey] ?? 0) || 0;
          if (current > 0 || hours <= 0) return;
          nextWeeklyHours[weekKey] = hours;
          changed = true;
          return;
        }
        const current = Number(nextWeeklyHours[weekKey] ?? 0) || 0;
        if (current !== hours) changed = true;
        nextWeeklyHours[weekKey] = hours;
      });
      if (!changed) continue;
      updates.push({ assignmentId: assignment.id!, weeklyHours: nextWeeklyHours });
    }
    return { updates, skipped };
  }, [autoHoursSettingsByPhaseMap, autoHoursTemplatePhaseKeysById, autoHoursTemplateSettingsByPhaseMap, deliverableWeekEntriesByProject, getWeeksCountForPhase, peopleById, projectsById, weeks]);

  const describeAutoHoursSkip = (skipped: { missingRole: number; missingSettings: number; missingDeliverables: number; missingCapacity: number }) => {
    const reasons: string[] = [];
    if (skipped.missingRole) reasons.push('missing project role');
    if (skipped.missingSettings) reasons.push('missing presets');
    if (skipped.missingDeliverables) reasons.push('no deliverables in range');
    if (skipped.missingCapacity) reasons.push('missing capacity');
    return reasons.length ? `No auto hours changes to apply (${reasons.join(', ')}).` : 'No auto hours changes to apply.';
  };

  const applyAutoHoursForProject = async (project: ProjectWithAssignments, mode: 'replace' | 'supplement') => {
    if (!canUseAutoHours) {
      showToastBus('Auto hours actions are restricted to admins and managers.', 'warning');
      return;
    }
    if (phaseMappingError) showToastBus(phaseMappingError, 'warning');
    if (autoHoursSettingsLoading) {
      showToastBus('Auto hours settings are still loading.', 'info');
      return;
    }
    if (autoHoursSettingsError) {
      showToastBus(autoHoursSettingsError, 'error');
      return;
    }
    if (mode === 'replace') {
      const confirmed = await confirmAction({
        title: 'Replace Auto Hours',
        message: 'This will replace hours based on auto hours presets and may overwrite existing hours. Continue?',
        confirmLabel: 'Replace',
        tone: 'warning',
      });
      if (!confirmed) return;
    }
    const templateId = project?.autoHoursTemplateId ?? null;
    if (templateId) await ensureTemplateSettings([templateId]);
    const { updates, skipped } = buildAutoHoursUpdatesForAssignments(project.assignments || [], mode);
    if (updates.length === 0) {
      showToastBus(describeAutoHoursSkip(skipped), 'info');
      return;
    }
    await applyAutoHoursUpdates(updates);
  };

  const applyAutoHoursForAssignment = async (assignment: Assignment, mode: 'replace' | 'supplement') => {
    if (!canUseAutoHours) {
      showToastBus('Auto hours actions are restricted to admins and managers.', 'warning');
      return;
    }
    if (phaseMappingError) showToastBus(phaseMappingError, 'warning');
    if (autoHoursSettingsLoading) {
      showToastBus('Auto hours settings are still loading.', 'info');
      return;
    }
    if (autoHoursSettingsError) {
      showToastBus(autoHoursSettingsError, 'error');
      return;
    }
    if (mode === 'replace') {
      const confirmed = await confirmAction({
        title: 'Replace Auto Hours',
        message: 'This will replace hours based on auto hours presets and may overwrite existing hours. Continue?',
        confirmLabel: 'Replace',
        tone: 'warning',
      });
      if (!confirmed) return;
    }
    const project = assignment.project ? projectsById.get(assignment.project) : null;
    const templateId = project?.autoHoursTemplateId ?? null;
    if (templateId) await ensureTemplateSettings([templateId]);
    const { updates, skipped } = buildAutoHoursUpdatesForAssignments([assignment], mode);
    if (updates.length === 0) {
      showToastBus(describeAutoHoursSkip(skipped), 'info');
      return;
    }
    await applyAutoHoursUpdates(updates);
  };

  const handleAssignmentRoleChange = async (personId: number, assignmentId: number, roleId: number | null, roleName: string | null) => {
    markSaveState('saving', 'Updating role...');
    try {
      await updateAssignmentRoleAction({ assignmentsApi, setPeople: setPeople as any, setAssignmentsData, people: people as any, personId, assignmentId, roleId, roleName, showToast: (msg, type) => showToastBus(msg, type) });
      markSaveState('saved', 'Role updated', 1200);
    } catch {
      markSaveState('error', 'Role update failed');
    }
  };

  const updateAssignmentHours = async (projectId: number, assignmentId: number, week: string, hours: number) => {
    markSaveState('saving', 'Saving...');
    const assignment = assignmentById.get(assignmentId);
    if (!assignment) return;
    const isPlaceholder = assignment.person == null;
    const prevWeeklyHours = { ...(assignment.weeklyHours || {}) };
    const updatedWeeklyHours = { ...prevWeeklyHours, [week]: hours };
    setAssignmentsData(prev => prev.map(a => a.id === assignmentId ? { ...a, weeklyHours: updatedWeeklyHours } : a));
    try {
      await updateAssignment(assignmentId, { weeklyHours: updatedWeeklyHours }, assignmentsApi, { skipIfMatch: isPlaceholder });
      markSaveState('saved', 'Saved', 1200);
    } catch (e: any) {
      setAssignmentsData(prev => prev.map(a => a.id === assignmentId ? { ...a, weeklyHours: prevWeeklyHours } : a));
      showToastBus(e?.message || 'Failed to update hours', 'error');
      markSaveState('error', 'Save failed');
      lastRetryRef.current = async () => {
        await updateAssignmentHours(projectId, assignmentId, week, hours);
      };
      emitToast({
        type: 'error',
        message: 'Failed to update hours',
        action: {
          label: 'Retry',
          onClick: async () => {
            if (!lastRetryRef.current) return;
            await lastRetryRef.current();
          },
        },
      });
    }
  };

  const handleMobileAssignmentPress = (projectId: number, assignmentId: number) => {
    const assignment = assignmentById.get(assignmentId);
    if (assignment) setMobileAssignmentTarget(assignment);
  };

  const handleMobileAssignmentSaveHours = async (assignmentId: number, week: string, hours: number) => {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment || assignment.project == null) return;
    await updateAssignmentHours(assignment.project as number, assignmentId, week, hours);
  };

  const swapPlaceholderAssignment = async (assignmentId: number, person: { id: number; name: string; department?: number | null }) => {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment) return;
    const prevAssignment = { ...assignment };
    setAssignmentsData(prev => prev.map(a => a.id === assignmentId ? {
      ...a,
      person: person.id,
      personName: person.name,
      personDepartmentId: person.department ?? (a as any).personDepartmentId ?? null,
    } : a));
    markSaveState('saving', 'Replacing placeholder...');
    try {
      await updateAssignment(assignmentId, { person: person.id }, assignmentsApi);
      showToastBus('Assignment updated', 'success');
      markSaveState('saved', 'Assignment updated', 1200);
    } catch (e: any) {
      setAssignmentsData(prev => prev.map(a => a.id === assignmentId ? prevAssignment : a));
      showToastBus(e?.message || 'Failed to replace placeholder', 'error');
      markSaveState('error', 'Update failed');
    }
  };

  const applyAssignmentEvent = useCallback(async (event: AssignmentEvent) => {
    if (!event?.assignmentId) return;
    if (event.type === 'deleted') {
      setAssignmentsData(prev => prev.filter(a => a.id !== event.assignmentId));
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
    setAssignmentsData(prev => {
      let found = false;
      const next = prev.map(a => {
        if (a.id === assignment!.id) {
          found = true;
          return { ...a, ...assignment };
        }
        return a;
      });
      if (!found) next.push(assignment as Assignment);
      return next;
    });
  }, [setAssignmentsData]);

  const enqueueAssignmentEvent = useCallback((event: AssignmentEvent) => {
    assignmentEventQueueRef.current.push(event);
    if (assignmentFlushTimerRef.current) return;
    assignmentFlushTimerRef.current = window.setTimeout(async () => {
      const queued = assignmentEventQueueRef.current.splice(0, assignmentEventQueueRef.current.length);
      assignmentFlushTimerRef.current = null;
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
      if (assignmentFlushTimerRef.current) {
        window.clearTimeout(assignmentFlushTimerRef.current);
        assignmentFlushTimerRef.current = null;
      }
    };
  }, [enqueueAssignmentEvent]);

  const updateMultipleCells = async (cells: Array<{ rowKey: string; weekKey: string }>, hours: number) => {
    markSaveState('saving', 'Saving...');
    const updates = new Map<number, Record<string, number>>();
    cells.forEach((cell) => {
      const [, assignmentIdStr] = cell.rowKey.split(':');
      const assignmentId = Number(assignmentIdStr);
      const assignment = assignmentById.get(assignmentId);
      if (!assignment) return;
      const next = updates.get(assignmentId) || { ...(assignment.weeklyHours || {}) };
      next[cell.weekKey] = hours;
      updates.set(assignmentId, next);
    });
    const payload = Array.from(updates.entries()).map(([assignmentId, weeklyHours]) => ({ assignmentId, weeklyHours }));
    setAssignmentsData(prev => prev.map(a => updates.has(a.id!) ? { ...a, weeklyHours: updates.get(a.id!) } : a));
    try {
      if (payload.length > 1) {
        await bulkUpdateAssignmentHours(payload, assignmentsApi);
      } else if (payload.length === 1) {
        const isPlaceholder = assignmentById.get(payload[0].assignmentId)?.person == null;
        await updateAssignment(payload[0].assignmentId, { weeklyHours: payload[0].weeklyHours }, assignmentsApi, { skipIfMatch: isPlaceholder });
      }
      markSaveState('saved', 'Saved', 1200);
    } catch (e: any) {
      showToastBus(e?.message || 'Failed to update hours', 'error');
      markSaveState('error', 'Save failed');
      lastRetryRef.current = async () => {
        await updateMultipleCells(cells, hours);
      };
      emitToast({
        type: 'error',
        message: 'Failed to update some cells',
        action: {
          label: 'Retry',
          onClick: async () => {
            if (!lastRetryRef.current) return;
            await lastRetryRef.current();
          },
        },
      });
    }
  };

  const copyForwardSelectedRange = useCallback(async () => {
    if (!selectedCell || selectedCells.length <= 1) return;
    const sourceHours = getHoursForCell(selectedCell.projectId, selectedCell.assignmentId, selectedCell.week);
    const targets = selectedCells
      .filter((cell) => !(cell.projectId === selectedCell.projectId && cell.assignmentId === selectedCell.assignmentId && cell.week === selectedCell.week))
      .map((cell) => ({ rowKey: `${cell.projectId}:${cell.assignmentId}`, weekKey: cell.week }));
    if (!targets.length) return;
    markSaveState('saving', 'Copying hours...');
    try {
      await updateMultipleCells(targets, sourceHours);
      markSaveState('saved', `Copied ${sourceHours}h`, 1400);
      showToastBus(`Copied ${sourceHours}h to ${targets.length} cells`, 'success');
    } catch {
      markSaveState('error', 'Copy forward failed');
    }
  }, [selectedCell, selectedCells, getHoursForCell, updateMultipleCells, markSaveState]);

  const handlePasteIntoGrid = useCallback(async (rawText: string) => {
    if (!selectedCell) return false;
    const raw = (rawText || '').trim();
    if (!raw) return false;
    const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
    if (!lines.length) return false;
    const matrix = lines.map((line) => line.split('\t').map((cell) => Number(cell.trim())));
    if (!matrix.some((row) => row.some((value) => Number.isFinite(value)))) return false;

    if (matrix.length === 1 && matrix[0].length === 1 && selectedCells.length > 1) {
      const cells = selectedCells.map((cell) => ({ rowKey: `${cell.projectId}:${cell.assignmentId}`, weekKey: cell.week }));
      markSaveState('saving', 'Pasting...');
      try {
        await updateMultipleCells(cells, matrix[0][0]);
        markSaveState('saved', 'Paste applied', 1200);
        return true;
      } catch {
        markSaveState('error', 'Paste failed');
        return false;
      }
    }

    const startRowIndex = rowOrder.indexOf(`${selectedCell.projectId}:${selectedCell.assignmentId}`);
    const startWeekIndex = weeks.findIndex((week) => week.date === selectedCell.week);
    if (startRowIndex < 0 || startWeekIndex < 0) return false;

    const updatesByValue = new Map<number, Array<{ rowKey: string; weekKey: string }>>();
    matrix.forEach((row, rIdx) => {
      row.forEach((value, cIdx) => {
        if (!Number.isFinite(value)) return;
        const rowKey = rowOrder[startRowIndex + rIdx];
        const weekKey = weeks[startWeekIndex + cIdx]?.date;
        if (!rowKey || !weekKey) return;
        const list = updatesByValue.get(value) || [];
        list.push({ rowKey, weekKey });
        updatesByValue.set(value, list);
      });
    });
    if (!updatesByValue.size) return false;
    markSaveState('saving', 'Pasting...');
    try {
      for (const [value, cells] of updatesByValue.entries()) {
        await updateMultipleCells(cells, value);
      }
      markSaveState('saved', 'Paste applied', 1200);
      return true;
    } catch {
      markSaveState('error', 'Paste failed');
      return false;
    }
  }, [selectedCell, selectedCells, rowOrder, weeks, updateMultipleCells, markSaveState]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const rawText = event.clipboardData?.getData('text/plain') || '';
      if (!rawText) return;
      event.preventDefault();
      void handlePasteIntoGrid(rawText);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handlePasteIntoGrid]);

  usePageShortcuts({
    bindings: [
      {
        id: 'project-assignments-focus-search',
        keys: ['/'],
        description: 'Focus project assignments search',
        action: focusProjectAssignmentsSearch,
      },
      {
        id: 'project-assignments-escape',
        keys: ['escape'],
        description: 'Close assignment overlays',
        action: () => {
          setMobileAssignmentTarget(null);
          csClear();
        },
      },
      {
        id: 'project-assignments-copy-forward',
        keys: ['meta+shift+f', 'ctrl+shift+f'],
        description: 'Copy selected value forward',
        when: () => selectedCells.length > 1,
        action: () => { void copyForwardSelectedRange(); },
      },
    ],
  });

  const isContiguousSelection = (): { ok: boolean; reason?: string } => {
    if (!selectedCells || selectedCells.length <= 1) return { ok: true };

    const projectId = selectedCells[0].projectId;
    const allSameProject = selectedCells.every(c => c.projectId === projectId);
    if (!allSameProject) return { ok: false, reason: 'Selection must be within a single project' };

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
    markSaveState('saving', 'Saving...');
    const numValue = sanitizeHours(editingValue);

    try {
      const selectedKeys = getSelectedCells();
      if (selectedKeys.length > 1) {
        const check = isContiguousSelection();
        if (!check.ok) {
          showToastBus(check.reason || 'Invalid selection for bulk apply', 'warning');
          setEditingCell(null);
          return;
        }
        await updateMultipleCells(selectedKeys, numValue);
      } else {
        await updateAssignmentHours(editingCell.personId, editingCell.assignmentId, editingCell.week, numValue);
      }

      const currentIdx = weeks.findIndex(w => w.date === editingCell.week);
      if (currentIdx >= 0 && currentIdx < weeks.length - 1) {
        const next = { personId: editingCell.personId, assignmentId: editingCell.assignmentId, week: weeks[currentIdx + 1].date };
        csSelect(`${next.personId}:${next.assignmentId}`, next.week, false);
      }
      markSaveState('saved', 'Saved', 1200);
    } catch (err: any) {
      showToastBus('Failed to save hours: ' + (err?.message || 'Unknown error'), 'error');
      markSaveState('error', 'Save failed');
    } finally {
      saveEditInFlightRef.current = false;
      setEditingCell(null);
    }
  };

  useEffect(() => {
    if (!editingCell) return;
    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-week-cell-editing=\"true\"]')) return;
      saveEdit();
    };
    document.addEventListener('mousedown', handleDocMouseDown, true);
    return () => document.removeEventListener('mousedown', handleDocMouseDown, true);
  }, [editingCell, saveEdit]);

  const fetchAssignmentsForProject = async (projectId: number): Promise<Assignment[]> => {
    const pageSize = 200;
    let page = 1;
    const all: Assignment[] = [];
    while (true) {
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const deptFilters = dept == null && departmentFiltersPayload.length ? departmentFiltersPayload : undefined;
      const res = await assignmentsApi.list({
        project: projectId,
        page,
        page_size: pageSize,
        include_placeholders: 1,
        department: dept,
        include_children: inc,
        department_filters: deptFilters,
        vertical: verticalState.selectedVerticalId ?? undefined,
        search_tokens: assignmentRowTokenPayload.length ? assignmentRowTokenPayload : undefined,
      });
      const rows = Array.isArray((res as any)) ? (res as any) : (res?.results || []);
      all.push(...rows);
      if (!res?.next) break;
      page += 1;
      if (page > 50) break; // safety valve
    }
    return all;
  };

  const fetchProjectAssignmentsPage = useCallback(async (projectId: number, page: number) => {
    const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
    const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
    const deptFilters = dept == null && departmentFiltersPayload.length ? departmentFiltersPayload : undefined;
    const res = await assignmentsApi.list({
      project: projectId,
      page,
      page_size: MOBILE_PROJECT_PAGE_SIZE,
      include_placeholders: 1,
      department: dept,
      include_children: inc,
      department_filters: deptFilters,
      vertical: verticalState.selectedVerticalId ?? undefined,
      search_tokens: assignmentRowTokenPayload.length ? assignmentRowTokenPayload : undefined,
    });
    const rows = Array.isArray(res as any) ? (res as any) : (res?.results || []);
    const hasMore = Boolean((res as any)?.next);
    return { rows, hasMore };
  }, [
    deptState.selectedDepartmentId,
    deptState.includeChildren,
    departmentFiltersPayload,
    verticalState.selectedVerticalId,
    assignmentRowTokenPayload,
  ]);

  const loadProjectAssignmentsPage = useCallback(async (projectId: number, page: number, opts?: { append?: boolean }) => {
    setMobileLoadingMoreByProject(prev => new Set(prev).add(projectId));
    try {
      const { rows, hasMore } = await fetchProjectAssignmentsPage(projectId, page);
      setAssignmentsData(prev => {
        const existing = prev.filter(a => (a.project as number | null | undefined) === projectId);
        const rest = prev.filter(a => (a.project as number | null | undefined) !== projectId);
        const merged = opts?.append ? (() => {
          const seen = new Set(existing.map(a => a.id));
          const nextRows = [...existing];
          rows.forEach((a) => { if (!seen.has(a.id)) nextRows.push(a); });
          return nextRows;
        })() : rows;
        return [...rest, ...merged];
      });
      setMobileAssignmentPageByProject(prev => ({ ...prev, [projectId]: page }));
      setMobileHasMoreAssignmentsByProject(prev => ({ ...prev, [projectId]: hasMore }));
    } catch (e: any) {
      showToastBus(e?.message || 'Failed to load project assignments', 'error');
    } finally {
      setMobileLoadingMoreByProject(prev => { const next = new Set(prev); next.delete(projectId); return next; });
    }
  }, [fetchProjectAssignmentsPage]);

  const loadMoreProjectAssignments = useCallback(async (projectId: number) => {
    if (!mobileHasMoreAssignmentsByProject[projectId]) return;
    if (mobileLoadingMoreByProject.has(projectId)) return;
    const currentPage = mobileAssignmentPageByProject[projectId] || 1;
    const nextPage = currentPage + 1;
    await loadProjectAssignmentsPage(projectId, nextPage, { append: true });
  }, [mobileHasMoreAssignmentsByProject, mobileLoadingMoreByProject, mobileAssignmentPageByProject, loadProjectAssignmentsPage]);

  const ensureAssignmentsLoaded = async (projectId: number) => {
    if (loadedProjectIds.has(projectId) || loadingAssignments.has(projectId)) return;
    setLoadingAssignments(prev => new Set(prev).add(projectId));
    try {
      const rows = await fetchAssignmentsForProject(projectId);
      setAssignmentsData(prev => {
        const withoutProject = prev.filter(a => (a.project as number | null | undefined) !== projectId);
        return [...withoutProject, ...rows];
      });
      setLoadedProjectIds(prev => {
        const next = new Set(prev);
        next.add(projectId);
        return next;
      });
    } catch (e: any) {
      showToastBus(e?.message || 'Failed to load project assignments', 'error');
    } finally {
      setLoadingAssignments(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const refreshAllAssignments = useCallback(async () => {
    if (projectsData.length === 0) {
      showToastBus('No projects available to refresh', 'warning');
      return;
    }
    const projectIds = projectsData.map(p => p.id!).filter((id): id is number => typeof id === 'number');
    setLoadingAssignments(new Set(projectIds));
    try {
      const dept = deptState.selectedDepartmentId == null ? undefined : Number(deptState.selectedDepartmentId);
      const inc = dept != null ? (deptState.includeChildren ? 1 : 0) : undefined;
      const deptFilters = dept == null && departmentFiltersPayload.length ? departmentFiltersPayload : undefined;
      const bulk = await assignmentsApi.listAll({
        project_ids: projectIds,
        department: dept,
        include_children: dept != null ? inc : undefined,
        department_filters: deptFilters,
        include_placeholders: 1,
        vertical: verticalState.selectedVerticalId ?? undefined,
        search_tokens: assignmentRowTokenPayload.length ? assignmentRowTokenPayload : undefined,
      }, { noCache: true });
      const allAssignments = Array.isArray(bulk) ? bulk : [];
      setAssignmentsData(prev => {
        const withoutVisible = prev.filter(a => !projectIds.includes(a.project as number));
        return [...withoutVisible, ...allAssignments];
      });
      setLoadedProjectIds(() => new Set(projectIds));
      showToastBus('Assignments refreshed', 'success');
    } catch (e: any) {
      showToastBus(e?.message || 'Failed to refresh assignments', 'error');
    } finally {
      setLoadingAssignments(new Set());
    }
  }, [deptState.selectedDepartmentId, deptState.includeChildren, departmentFiltersPayload, verticalState.selectedVerticalId, assignmentRowTokenPayload, projectsData]);

  const toggleProjectExpanded = (projectId: number) => {
    const getMainScrollContainer = () => bodyScrollRef.current?.closest('main') as HTMLElement | null;
    const capturedScrollTop = getMainScrollContainer()?.scrollTop ?? null;
    const scheduleScrollRestore = () => {
      if (capturedScrollTop == null || capturedScrollTop <= 8 || typeof window === 'undefined') return;
      window.requestAnimationFrame(() => {
        const main = getMainScrollContainer();
        if (!main) return;
        if (main.scrollTop <= 2) {
          main.scrollTop = capturedScrollTop;
        }
      });
    };
    const willExpand = !expandedProjectIds.has(projectId);
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (willExpand) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
    scheduleScrollRestore();
    if (willExpand) {
      if (isMobileLayout) {
        if (!mobileAssignmentPageByProject[projectId] && !mobileLoadingMoreByProject.has(projectId)) {
          void loadProjectAssignmentsPage(projectId, 1, { append: false }).finally(() => {
            scheduleScrollRestore();
          });
        }
      } else {
        void ensureAssignmentsLoaded(projectId).finally(() => {
          scheduleScrollRestore();
        });
      }
    }
  };

  const removeAssignment = async (projectId: number, assignmentId: number) => {
    const confirmed = await confirmAction({
      title: 'Remove Assignment',
      message: 'Are you sure you want to remove this assignment?',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;
    const assignment = assignmentById.get(assignmentId);
    markSaveState('saving', 'Removing assignment...');
    try {
      await deleteAssignment(assignmentId, assignmentsApi, {
        projectId,
        personId: assignment?.person ?? null,
        updatedAt: assignment?.updatedAt ?? new Date().toISOString(),
      });
      setAssignmentsData(prev => prev.filter(a => a.id !== assignmentId));
      markSaveState('saved', 'Assignment removed', 1200);
    } catch (e: any) {
      showToastBus(e?.message || 'Failed to delete assignment', 'error');
      markSaveState('error', 'Remove failed');
    }
  };

  const addPersonToProject = async (
    projectId: number,
    person: { id: number; name: string; department?: number | null },
    role?: ProjectRole | null
  ) => {
    markSaveState('saving', 'Adding assignment...');
    try {
      const created = await createAssignment({
        person: person.id,
        project: projectId,
        ...(role?.id ? { roleOnProjectId: role.id } : {}),
      }, assignmentsApi);
      const normalized = {
        ...(created as Assignment),
        roleName: (created as any)?.roleName ?? role?.name ?? null,
      } as Assignment;
      setAssignmentsData(prev => [...prev, normalized]);
      showToastBus('Assignment created', 'success');
      markSaveState('saved', 'Assignment added', 1200);
    } catch (e: any) {
      showToastBus(e?.message || 'Failed to create assignment', 'error');
      markSaveState('error', 'Add failed');
    }
  };

  const addRolePlaceholderToProject = async (projectId: number, role: ProjectRole & { departmentName?: string }) => {
    markSaveState('saving', 'Adding placeholder...');
    try {
      const created = await createAssignment({ project: projectId, roleOnProjectId: role.id }, assignmentsApi);
      const normalized = {
        ...(created as Assignment),
        personDepartmentId: (created as any)?.personDepartmentId ?? role.department_id ?? null,
        roleName: (created as any)?.roleName ?? role.name,
      } as Assignment;
      setAssignmentsData(prev => [...prev, normalized]);
      showToastBus('Placeholder role added', 'success');
      markSaveState('saved', 'Placeholder added', 1200);
    } catch (e: any) {
      showToastBus(e?.message || 'Failed to add placeholder role', 'error');
      markSaveState('error', 'Add failed');
    }
  };

  const addUI = usePersonAssignmentAdd({
    searchPeople: async (query) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      return peopleApi.search(query, 10, {
        department: deptState.selectedDepartmentId ?? undefined,
        vertical: verticalState.selectedVerticalId ?? undefined,
      });
    },
    searchRoles: async (query) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      const deptId = deptState.selectedDepartmentId != null ? Number(deptState.selectedDepartmentId) : undefined;
      const results = await searchProjectRoles(trimmed, deptId);
      return (results || []).map((role) => ({
        ...role,
        departmentName: departmentNameById.get(role.department_id) || '',
      }));
    },
    onAddPerson: async (projectId, person, role) => addPersonToProject(projectId, person, role),
    onAddRole: async (projectId, role) => addRolePlaceholderToProject(projectId, role),
  });

  const hoursByProject = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    visibleProjects.forEach((project) => {
      const weekTotals: Record<string, number> = {};
      (project.assignments || []).forEach((assignment) => {
        Object.entries(assignment.weeklyHours || {}).forEach(([week, value]) => {
          const v = Number(value) || 0;
          weekTotals[week] = (weekTotals[week] || 0) + v;
        });
      });
      map[project.id!] = weekTotals;
    });
    return map;
  }, [visibleProjects]);

  const { clientColumnWidth, projectColumnWidth, setClientColumnWidth, setProjectColumnWidth, isResizing, setIsResizing, resizeStartX, setResizeStartX, resizeStartWidth, setResizeStartWidth } = useGridColumnWidthsAssign();
  const autoHoursColumnWidth = 28;
  const gridTemplate = useMemo(() => {
    const count = Math.max(1, visibleWeeks.length);
    return `${clientColumnWidth}px ${projectColumnWidth}px 40px ${autoHoursColumnWidth}px repeat(${count}, 70px)`;
  }, [clientColumnWidth, projectColumnWidth, visibleWeeks.length, autoHoursColumnWidth]);

  const totalMinWidth = useMemo(() => clientColumnWidth + projectColumnWidth + 40 + autoHoursColumnWidth + (weeks.length * 70) + 20, [clientColumnWidth, projectColumnWidth, weeks.length, autoHoursColumnWidth]);

  const onStartResize = (column: 'client' | 'project', e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(column);
    setResizeStartX(e.clientX);
    const startWidth = column === 'client' ? clientColumnWidth : projectColumnWidth;
    setResizeStartWidth(startWidth);
  };

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartX;
      if (isResizing === 'client') {
        setClientColumnWidth(Math.max(140, resizeStartWidth + delta));
      } else {
        setProjectColumnWidth(Math.max(160, resizeStartWidth + delta));
      }
    };
    const onUp = () => setIsResizing(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing, resizeStartX, resizeStartWidth, setClientColumnWidth, setProjectColumnWidth, setIsResizing]);

  const initialProjectsLoading = projectsLoading && projectsData.length === 0;

  if (loading || initialProjectsLoading) {
    if (pageStateEnabled) {
      return (
        <Layout>
          <PageState isLoading skeleton={<AssignmentsSkeleton />} />
        </Layout>
      );
    }
    return (
      <Layout>
        <AssignmentsSkeleton />
      </Layout>
    );
  }

  if (error || projectsError) {
    if (pageStateEnabled) {
      return (
        <Layout>
          <PageState error={error || projectsError} onRetry={() => { void refreshAllAssignments(); }} />
        </Layout>
      );
    }
    return (
      <Layout>
        <div className="p-6 text-red-400">{error || projectsError}</div>
      </Layout>
    );
  }

  const ProjectWeekHeader: React.FC = () => (
    <div
      ref={headerScrollRef}
      onScroll={handleHeaderScroll}
      className="sticky left-0 right-0 bg-[var(--card)] border-b border-[var(--border)] z-20 overflow-x-auto"
      style={{ top: 0 }}
    >
      <div style={{ minWidth: totalMinWidth }}>
        <div
          className="grid gap-px p-2"
          style={{ gridTemplateColumns: gridTemplate, paddingLeft: weekPaddingLeft, paddingRight: weekPaddingRight }}
        >
          <div className="font-medium text-[var(--text)] text-sm px-2 py-1 relative group">
            Person
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[var(--surfaceHover)]"
              onMouseDown={(e) => onStartResize('client', e)}
            />
          </div>
          <div className="font-medium text-[var(--text)] text-sm px-2 py-1 relative group">
            Role
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-[var(--surfaceHover)]"
              onMouseDown={(e) => onStartResize('project', e)}
            />
          </div>
          <div className="text-center text-xs text-[var(--muted)] px-1">+/-</div>
          <div className="text-center text-[10px] text-[var(--muted)] px-1">{canUseAutoHours ? 'R/S' : ''}</div>
          {visibleWeeks.map((week, index) => (
            <div key={week.date} className="text-center px-1">
              <div className="text-xs font-medium text-[var(--text)]">{week.display}</div>
              <div className="text-[10px] text-[var(--muted)]">W{index + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const ProjectGroupHeader: React.FC<{ project: ProjectWithAssignments }> = ({ project }) => (
    <div className="col-span-2 flex items-center">
      <button
        type="button"
        onClick={() => project.id && toggleProjectExpanded(project.id)}
        className="flex items-center gap-2 pl-3 pr-2 py-1 w-full text-left hover:bg-[var(--surfaceHover)] transition-all duration-200 rounded-sm"
      >
        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-[var(--muted)]">
          <svg width="12" height="12" viewBox="0 0 12 12" className={`transition-transform duration-200 ${project.isExpanded ? 'rotate-90' : 'rotate-0'}`}>
            <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-[var(--text)] text-sm truncate">{project.name}</div>
          <div className="text-xs text-[var(--muted)]">{project.client || ''}</div>
        </div>
      </button>
      <div className="pr-2 relative">
        {project.id ? (
          <>
            <StatusBadge
              status={project.id ? getProjectStatus(project.id) : null}
              variant="editable"
              definitionMap={definitionMap}
              onClick={() => project.id && statusDropdown.toggle(String(project.id))}
              isUpdating={project.id && projectStatus.isUpdating(project.id)}
            />
            {project.id && (
              <StatusDropdown
                currentStatus={getProjectStatus(project.id)}
                isOpen={statusDropdown.isOpen(String(project.id))}
                onSelect={(newStatus) => project.id && handleStatusChange(project.id, newStatus)}
                onClose={statusDropdown.close}
                projectId={project.id}
                disabled={projectStatus.isUpdating(project.id)}
                closeOnSelect={false}
                statusOptions={statusOptionKeys}
                definitionMap={definitionMap}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );

  const PersonCell: React.FC<{ assignment: Assignment }> = ({ assignment }) => {
    const personId = assignment.person as number | null;
    const person = personId ? peopleById.get(personId) : null;
    const placeholderRole = !personId ? assignment.roleName : null;
    const name = assignment.personName || person?.name || (placeholderRole ? `<${placeholderRole}>` : 'Unassigned');
    const meta = person?.weeklyCapacity != null ? `${person.weeklyCapacity}h/wk` : '';
    const deptId = (assignment as any).personDepartmentId as number | null | undefined;
    const canSwapPlaceholder = !personId && !!placeholderRole;
    return (
      <div className="flex items-start pt-0.5 pb-1 pl-[60px] pr-2">
        <div className="min-w-0 flex-1">
          <div className="text-[var(--text)] text-xs leading-5" title={name}>
            {canSwapPlaceholder ? (
              <PlaceholderPersonSwap
                label={name}
                deptId={deptId ?? null}
                className="text-[var(--text)] text-xs truncate inline-block max-w-full"
                onSelect={(person) => swapPlaceholderAssignment(assignment.id!, person)}
              />
            ) : (
              <span className="block truncate">{name}</span>
            )}
          </div>
          {meta ? (
            <div className="mt-0.5 text-[var(--muted)] text-[11px] leading-4">{meta}</div>
          ) : null}
        </div>
      </div>
    );
  };

  const RoleCell: React.FC<{ assignment: Assignment }> = ({ assignment }) => {
    const personId = assignment.person as number | null;
    const person = personId ? peopleById.get(personId) : null;
    const departmentId = person?.department ?? (assignment as any).personDepartmentId ?? null;
    const roleName = assignment.roleName || 'Set role';
    const roleOnProjectId = assignment.roleOnProjectId ?? null;
    const { data: roles = [] } = useProjectRoles(departmentId ?? undefined);
    const [openRole, setOpenRole] = useState(false);
    const roleBtnRef = useRef<HTMLButtonElement | null>(null);
    return (
      <div className="flex items-start pt-0.5 pb-1 pr-2">
        <div className="min-w-0 flex-1">
          <div className="mt-0.5 text-[var(--muted)] text-[11px] leading-4">
            <button
              type="button"
              className="hover:text-[var(--text)]"
              onClick={() => setOpenRole(v => !v)}
              title="Edit role on project"
              ref={roleBtnRef}
            >
              {roleName}
            </button>
            {openRole && (
              <div className="relative mt-1">
                <RoleDropdown
                  roles={roles}
                  currentId={roleOnProjectId}
                  onSelect={(id, name) => {
                    if (personId) {
                      void handleAssignmentRoleChange(personId, assignment.id!, id, name);
                    }
                    setOpenRole(false);
                  }}
                  onClose={() => setOpenRole(false)}
                  anchorRef={roleBtnRef}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ProjectAssignmentRow: React.FC<{ projectId: number; assignment: Assignment }> = ({ projectId, assignment }) => {
    const rowKey = `${projectId}:${assignment.id}`;
    const isSelected = (week: string) => csIsSelected(rowKey, week);
    const isEditing = (week: string) => editingCell?.personId === projectId && editingCell?.assignmentId === assignment.id && editingCell?.week === week;
    return (
      <div className="grid gap-px p-0.5 bg-[var(--surface)] hover:bg-[var(--surfaceHover)] transition-colors" style={{ gridTemplateColumns: gridTemplate }}>
        <PersonCell assignment={assignment} />
        <RoleCell assignment={assignment} />
        <div className="flex items-center justify-center">
          <RemoveAssignmentButton onClick={() => removeAssignment(projectId, assignment.id!)} />
        </div>
        <div className="flex items-center justify-center">
          {canUseAutoHours ? (
            <AutoHoursActionButtons
              onReplace={() => void applyAutoHoursForAssignment(assignment, 'replace')}
              onSupplement={() => void applyAutoHoursForAssignment(assignment, 'supplement')}
            />
          ) : null}
        </div>
        {visibleWeeks.map((week) => (
          <WeekCell
            key={week.date}
            weekKey={week.date}
            isSelected={isSelected(week.date)}
            isEditing={isEditing(week.date)}
            currentHours={assignment.weeklyHours?.[week.date] || 0}
            onSelect={(isShift) => csSelect(rowKey, week.date, isShift)}
            onMouseDown={() => csMouseDown(rowKey, week.date)}
            onMouseEnter={() => csMouseEnter(rowKey, week.date)}
            onEditStart={() => startEditing(projectId, assignment.id!, week.date, String(assignment.weeklyHours?.[week.date] || 0))}
            onEditSave={saveEdit}
            onEditCancel={() => cancelEdit()}
            editingValue={editingValue}
            onEditValueChange={setEditingValue}
            deliverablesForWeek={assignment.project ? getDeliverablesForProjectWeek(assignment.project, week.date) : []}
          />
        ))}
      </div>
    );
  };

  const ProjectTotalsCell: React.FC<{ totalHours: number; deliverablesForWeek: Deliverable[] }> = ({ totalHours, deliverablesForWeek }) => {
    const { entries, hasDeliverable, tooltip, colorFor } = useDeliverableBars(deliverablesForWeek);
    const labelValue = Number.isFinite(totalHours)
      ? (Number.isInteger(totalHours) ? totalHours : totalHours.toFixed(1))
      : 0;
    const aria = `${labelValue} hours`;
    const pillClasses = totalHours > 0
      ? 'bg-[var(--surfaceHover)] text-[var(--text)] border border-[var(--border)]'
      : 'bg-transparent text-[var(--muted)] border border-[var(--borderSubtle)]';
    return (
      <div className="relative flex items-center justify-center px-1" title={tooltip} aria-label={aria}>
        <div className={`inline-flex items-center justify-center h-6 px-2 leading-none rounded-full text-xs font-medium min-w-[40px] text-center ${pillClasses}`}>
          {totalHours > 0 ? `${labelValue}h` : ''}
        </div>
        {hasDeliverable && (
          <div className="absolute right-0 top-1 bottom-1 flex items-stretch gap-0.5 pr-[2px] pointer-events-none">
            {entries.slice(0, 3).map((entry, idx) => (
              <div key={idx} className="w-[3px] rounded" style={{ background: colorFor(entry.type) }} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const ProjectSection: React.FC<{ project: ProjectWithAssignments }> = ({ project }) => {
    const visibleAssignments = useMemo(() => {
      return getVisibleAssignments(project);
    }, [getVisibleAssignments, project]);
    const totals = hoursByProject[project.id!] || {};
    return (
      <div className="border-b border-[var(--border)] last:border-b-0">
        <div className="grid gap-px p-2 hover:bg-[var(--surfaceHover)] transition-colors" style={{ gridTemplateColumns: gridTemplate }}>
          <ProjectGroupHeader project={project} />
          <div className="flex items-center justify-center gap-1">
            <button
              className="w-5 h-5 rounded bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)] text-xs font-medium transition-colors flex items-center justify-center"
              title="Add person"
              onClick={() => addUI.open(project.id!)}
            >
              +
            </button>
          </div>
          <div className="flex items-center justify-center">
            {canUseAutoHours ? (
              <AutoHoursActionButtons
                onReplace={() => void applyAutoHoursForProject(project, 'replace')}
                onSupplement={() => void applyAutoHoursForProject(project, 'supplement')}
              />
            ) : null}
          </div>
          {visibleWeeks.map((week) => {
            const totalHours = totals?.[week.date] || 0;
            const deliverablesForWeek = project.id ? getDeliverablesForProjectWeek(project.id, week.date) : [];
            return (
              <ProjectTotalsCell
                key={week.date}
                totalHours={totalHours}
                deliverablesForWeek={deliverablesForWeek}
              />
            );
          })}
        </div>

        {project.isExpanded && loadingAssignments.has(project.id!) && (
          <div className="grid gap-px p-2" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="col-span-2 flex items-center py-1 pl-[60px] pr-2">
              <div className="text-[var(--muted)] text-xs">Loading assignments...</div>
            </div>
            <div></div>
            <div></div>
            {visibleWeeks.map((week) => (
              <div key={week.date} className="flex items-center justify-center">
                <div className="w-12 h-6" />
              </div>
            ))}
          </div>
        )}

        {project.isExpanded && visibleAssignments.map((assignment) => (
          <ProjectAssignmentRow key={assignment.id} projectId={project.id!} assignment={assignment} />
        ))}

        {project.isExpanded && addUI.isAddingFor === project.id && (
          <AddPersonRow
            weeks={visibleWeeks}
            gridTemplate={gridTemplate}
            newPersonName={addUI.newPersonName}
            onSearchChange={addUI.onSearchChange}
            personResults={addUI.personResults}
            roleResults={addUI.roleResults}
            selectedDropdownIndex={addUI.selectedDropdownIndex}
            setSelectedDropdownIndex={addUI.setSelectedDropdownIndex}
            showPersonDropdown={addUI.showPersonDropdown}
            setShowPersonDropdown={addUI.setShowPersonDropdown}
            selectedPerson={addUI.selectedPerson}
            selectedPersonRole={addUI.selectedPersonRole}
            selectedRole={addUI.selectedRole}
            onPersonSelect={addUI.onPersonSelect}
            onPersonRoleSelect={addUI.onPersonRoleSelect}
            onRoleSelect={addUI.onRoleSelect}
            onAddPerson={(person, role) => addUI.addPerson(project.id!, person, role)}
            onAddRole={(role) => addUI.addRole(project.id!, role)}
            onAddSelected={() => addUI.addSelected(project.id!)}
            onCancel={addUI.cancel}
          />
        )}
      </div>
    );
  };

  const searchBar = (
    <div className={`relative group ${isMobileLayout ? 'w-full min-w-0' : 'w-[320px] min-w-[220px] max-w-[34vw] shrink-0'}`}>
      <label className="sr-only" htmlFor="project-assignments-search">Search projects</label>
      <div className="h-10 flex items-stretch bg-[var(--card)] border border-[var(--border)] rounded-md overflow-hidden">
        <div className="h-full flex items-center border-r border-[var(--border)] bg-[var(--surface)] px-2">
          <select
            className="h-full bg-transparent text-[11px] uppercase tracking-wide text-[var(--muted)] focus:outline-none"
            value={activeToken?.op ?? searchOp}
            onChange={(e) => handleSearchOpChange(e.target.value as 'or' | 'and' | 'not')}
            aria-label={activeToken ? 'Set operator for selected filter' : 'Set operator for new filter'}
          >
            <option value="or">OR</option>
            <option value="and">AND</option>
            <option value="not">NOT</option>
          </select>
        </div>
        <div className="h-full flex items-center gap-1 px-2 flex-1 min-w-0 overflow-x-auto whitespace-nowrap scrollbar-theme">
          {searchTokens.map((token) => {
            const isActive = token.id === activeTokenId;
            return (
              <div
                key={token.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveTokenId(token.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTokenId(token.id); } }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] shrink-0 ${
                  isActive
                    ? 'border-[var(--primary)] bg-[var(--surfaceHover)] text-[var(--text)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]'
                }`}
                title={`${token.op.toUpperCase()} ${token.term}`}
              >
                <span className="text-[10px] uppercase tracking-wide">{token.op}</span>
                <span className="max-w-[140px] truncate text-[var(--text)]">{token.term}</span>
                <button
                  type="button"
                  className="ml-0.5 text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSearchToken(token.id);
                  }}
                  aria-label={`Remove ${token.term}`}
                >
                  x
                </button>
              </div>
            );
          })}
          <input
            id="project-assignments-search"
            type="text"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setActiveTokenId(null); }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search"
            className="h-full flex-1 min-w-[140px] px-1 text-base lg:text-sm bg-transparent text-[var(--text)] placeholder-[var(--muted)] focus:outline-none"
          />
        </div>
      </div>
      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-[340px] max-w-[95vw] rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-[10px] text-[var(--muted)] shadow-lg group-hover:block group-focus-within:block"
      >
        <p>Press Enter to add a filter token. Use OR / AND / NOT to combine filters.</p>
        <p className="mt-1">Workload filters: available, optimal, full, overallocated, &lt;30, &gt;14, 10-20.</p>
      </div>
      {workloadHintVisible ? (
        <div className="mt-0.5 text-[10px] text-amber-500">
          Couldn&apos;t parse workload filter; using text search.
        </div>
      ) : null}
    </div>
  );

  const topBarHeader = (
    <div className="flex items-center gap-1 min-w-0 w-full">
      {searchBar}
      <WeeksHorizonField value={weeksHorizon} onChange={setWeeksHorizon} />
      <HeaderActions
        onExpandAll={() => {
          const next = new Set(
            (projectsData || [])
              .map(p => p.id)
              .filter((id): id is number => typeof id === 'number')
          );
          setExpandedProjectIds(next);
          void refreshAllAssignments();
        }}
        onCollapseAll={() => setExpandedProjectIds(new Set())}
        onRefreshAll={async () => {
          await snapshot.loadData();
          await fetchProjectsPage(1, { append: false });
          await refreshAllAssignments();
        }}
        disabled={loading}
        compact={useAbbrevHeaderLabels}
        compactLabels={{ expandAll: 'EA', collapseAll: 'CA', refreshAll: 'RE' }}
      />
      <AssignmentsFilterMenu
        statusOptions={statusFilterOptions as unknown as readonly string[]}
        selectedStatuses={selectedStatusFilters as unknown as Set<string>}
        formatStatus={(status) => formatFilterStatus(status as any)}
        onToggleStatus={(status) => toggleStatusFilter(status as any)}
        buttonLabel="Filter"
        buttonTitle="Filter project assignments"
      />
      <a
        href={buildAssignmentsLink({ weeks: weeksHorizon, statuses: (Array.from(selectedStatusFilters) || []).filter(s => s !== 'Show All') })}
        className="h-10 inline-flex items-center px-2 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] shrink-0"
        title="Assignments View"
      >
        {useAbbrevHeaderLabels ? 'AV' : 'Assignments View'}
      </a>
      <DeliverableLegendFloating
        buttonLabel={useAbbrevHeaderLabels ? 'TP' : 'Types'}
        buttonTitle="Deliverable Types"
      />
      {selectedCells.length > 0 ? (
        <div className="h-10 shrink-0 inline-flex items-center gap-2 px-2 rounded border border-[var(--border)] bg-[var(--surface)]">
          <span className="text-xs text-[var(--muted)] whitespace-nowrap">{selectedCells.length} selected • {selectedHoursLabel}h</span>
          <button
            type="button"
            className="h-8 px-2 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)]"
            onClick={() => { void copyForwardSelectedRange(); }}
            disabled={selectedCells.length < 2}
          >
            Copy Forward
          </button>
          <button
            type="button"
            className="h-8 px-2 rounded border border-red-500/40 text-xs text-red-200 hover:bg-red-500/10"
            onClick={csClear}
          >
            Clear
          </button>
        </div>
      ) : null}
      {saveState !== 'idle' ? (
        <div className="shrink-0">
          <SaveStateBadge
            state={saveState}
            message={saveStateMessage}
            onRetry={lastRetryRef.current ? () => { void lastRetryRef.current?.(); } : undefined}
          />
        </div>
      ) : null}
    </div>
  );

  const leftTopBarContent = !isMobileLayout ? (
    <TopBarPortal side="left">
      <div className="text-base font-semibold text-[var(--text)] leading-tight whitespace-nowrap">Project Assignments</div>
    </TopBarPortal>
  ) : null;

  return (
    <Layout>
      {leftTopBarContent}
      {isMobileLayout ? (
        <div className="flex-1 flex flex-col min-w-0 px-4 py-4 space-y-4">
          {topBarHeader}
          <MobileProjectAccordions
            projects={visibleProjects as any}
            weeks={weeks}
            hoursByProject={hoursByProject}
            onExpand={(pid) => toggleProjectExpanded(pid)}
            onAssignmentPress={handleMobileAssignmentPress}
            onAddAssignment={(pid) => addUI.open(pid)}
            activeAddProjectId={addUI.isAddingFor}
            hasMoreAssignmentsByProject={mobileHasMoreAssignmentsByProject}
            loadingMoreByProject={mobileLoadingMoreByProject}
            onLoadMoreAssignments={(pid) => { void loadMoreProjectAssignments(pid); }}
            canEditAssignments={canEditAssignments}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <div>
              {projectsCount > 0 ? `Showing ${visibleProjects.length} of ${projectsCount} projects` : 'No projects found'}
            </div>
            {hasMoreProjects && (
              <button
                type="button"
                onClick={() => { void fetchProjectsPage(projectsPage + 1, { append: true }); }}
                disabled={projectsLoading}
                className="px-3 py-1 rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {projectsLoading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="p-0">
          <TopBarPortal side="right">{topBarHeader}</TopBarPortal>
          <ProjectWeekHeader />
          <div
            ref={bodyScrollRef}
            onScroll={handleBodyScroll}
            className="overflow-x-auto overflow-y-visible scrollbar-theme"
          >
            <div style={{ minWidth: totalMinWidth, paddingLeft: weekPaddingLeft, paddingRight: weekPaddingRight }}>
              {visibleProjects.map((project) => (
                <ProjectSection key={project.id} project={project} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-[var(--muted)]">
            <div>
              {projectsCount > 0 ? `Showing ${visibleProjects.length} of ${projectsCount} projects` : 'No projects found'}
            </div>
            {hasMoreProjects && (
              <button
                type="button"
                onClick={() => { void fetchProjectsPage(projectsPage + 1, { append: true }); }}
                disabled={projectsLoading}
                className="px-3 py-1 rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {projectsLoading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        </div>
      )}
      {isMobileLayout ? (
        <MobileProjectAddAssignmentSheet addController={addUI as any} projects={projectsData} canEditAssignments={canEditAssignments} />
      ) : null}
      <MobileProjectAssignmentSheet
        assignment={mobileAssignmentTarget}
        weeks={weeks}
        onClose={() => setMobileAssignmentTarget(null)}
        onSaveHours={handleMobileAssignmentSaveHours}
        canEditAssignments={canEditAssignments}
      />
    </Layout>
  );
};

export default ProjectAssignmentsGrid;

function usePersonAssignmentAdd({
  searchPeople,
  searchRoles,
  onAddPerson,
  onAddRole,
}: {
  searchPeople: (query: string) => Promise<Array<{ id: number; name: string; department?: number | null }>>;
  searchRoles: (query: string) => Promise<Array<ProjectRole & { departmentName?: string }>>;
  onAddPerson: (projectId: number, person: { id: number; name: string; department?: number | null }, role?: ProjectRole | null) => Promise<void> | void;
  onAddRole: (projectId: number, role: ProjectRole & { departmentName?: string }) => Promise<void> | void;
}) {
  const [isAddingFor, setIsAddingFor] = useState<number | null>(null);
  const [newPersonName, setNewPersonName] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string; department?: number | null } | null>(null);
  const [selectedPersonRole, setSelectedPersonRole] = useState<ProjectRole | null>(null);
  const [selectedRole, setSelectedRole] = useState<(ProjectRole & { departmentName?: string }) | null>(null);
  const [personResults, setPersonResults] = useState<Array<{ id: number; name: string; department?: number | null }>>([]);
  const [roleResults, setRoleResults] = useState<Array<ProjectRole & { departmentName?: string }>>([]);
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(-1);
  const latestQueryRef = useRef('');

  const open = useCallback((projectId: number) => {
    setIsAddingFor(projectId);
    setNewPersonName('');
    setSelectedPerson(null);
    setSelectedPersonRole(null);
    setSelectedRole(null);
    setPersonResults([]);
    setRoleResults([]);
    setShowPersonDropdown(false);
    setSelectedDropdownIndex(-1);
  }, []);

  const reset = useCallback(() => {
    setIsAddingFor(null);
    setNewPersonName('');
    setSelectedPerson(null);
    setSelectedPersonRole(null);
    setSelectedRole(null);
    setPersonResults([]);
    setRoleResults([]);
    setShowPersonDropdown(false);
    setSelectedDropdownIndex(-1);
  }, []);

  const cancel = useCallback(() => reset(), [reset]);

  const onSearchChange = useCallback(async (value: string) => {
    setNewPersonName(value);
    latestQueryRef.current = value;
    const trimmed = value.trim();
    if (!trimmed) {
      setPersonResults([]);
      setRoleResults([]);
      setShowPersonDropdown(false);
      setSelectedPerson(null);
      setSelectedPersonRole(null);
      setSelectedRole(null);
      return;
    }
    if (trimmed.length < 2) {
      setPersonResults([]);
      setRoleResults([]);
      setShowPersonDropdown(false);
      setSelectedPerson(null);
      setSelectedPersonRole(null);
      setSelectedRole(null);
      return;
    }
    const [peopleResults, rolesResults] = await Promise.allSettled([
      searchPeople(trimmed),
      searchRoles(trimmed),
    ]);
    if (latestQueryRef.current !== value) return;
    const nextPeople = peopleResults.status === 'fulfilled' ? (peopleResults.value || []) : [];
    const nextRoles = rolesResults.status === 'fulfilled' ? (rolesResults.value || []) : [];
    setPersonResults(nextPeople);
    setRoleResults(nextRoles);
    setShowPersonDropdown(nextPeople.length > 0 || nextRoles.length > 0);
    setSelectedPerson(null);
    setSelectedPersonRole(null);
    setSelectedRole(null);
    setSelectedDropdownIndex(-1);
  }, [searchPeople, searchRoles]);

  const onPersonSelect = useCallback((person: { id: number; name: string; department?: number | null }) => {
    setSelectedPerson(person);
    setSelectedPersonRole(null);
    setSelectedRole(null);
    setNewPersonName(person.name);
    setShowPersonDropdown(false);
    setPersonResults([]);
    setRoleResults([]);
    setSelectedDropdownIndex(-1);
  }, []);

  const onRoleSelect = useCallback((role: ProjectRole & { departmentName?: string }) => {
    setSelectedRole(role);
    setSelectedPerson(null);
    setSelectedPersonRole(null);
    setNewPersonName(role.name);
    setShowPersonDropdown(false);
    setPersonResults([]);
    setRoleResults([]);
    setSelectedDropdownIndex(-1);
  }, []);

  const onPersonRoleSelect = useCallback((role: ProjectRole | null) => {
    setSelectedPersonRole(role);
  }, []);

  const addSelected = useCallback(async (projectId: number) => {
    if (selectedPerson) {
      await onAddPerson(projectId, selectedPerson, selectedPersonRole);
      reset();
      return;
    }
    if (selectedRole) {
      await onAddRole(projectId, selectedRole);
      reset();
    }
  }, [onAddPerson, onAddRole, reset, selectedPerson, selectedRole, selectedPersonRole]);

  const addPerson = useCallback(async (projectId: number, person: { id: number; name: string; department?: number | null }, role?: ProjectRole | null) => {
    await onAddPerson(projectId, person, role);
    reset();
  }, [onAddPerson, reset]);

  const addRole = useCallback(async (projectId: number, role: ProjectRole & { departmentName?: string }) => {
    await onAddRole(projectId, role);
    reset();
  }, [onAddRole, reset]);

  return {
    isAddingFor,
    newPersonName,
    selectedPerson,
    selectedPersonRole,
    selectedRole,
    personResults,
    roleResults,
    showPersonDropdown,
    selectedDropdownIndex,
    setSelectedDropdownIndex,
    setShowPersonDropdown,
    open,
    reset,
    cancel,
    onSearchChange,
    onPersonSelect,
    onPersonRoleSelect,
    onRoleSelect,
    addSelected,
    addPerson,
    addRole,
  } as const;
}

function AddPersonRow({
  weeks,
  gridTemplate,
  newPersonName,
  onSearchChange,
  personResults,
  roleResults,
  selectedDropdownIndex,
  setSelectedDropdownIndex,
  showPersonDropdown,
  setShowPersonDropdown,
  selectedPerson,
  selectedPersonRole,
  selectedRole,
  onPersonSelect,
  onPersonRoleSelect,
  onRoleSelect,
  onAddPerson,
  onAddRole,
  onAddSelected,
  onCancel,
}: {
  weeks: { date: string; display: string; fullDisplay: string }[];
  gridTemplate: string;
  newPersonName: string;
  onSearchChange: (value: string) => void;
  personResults: Array<{ id: number; name: string; department?: number | null }>;
  roleResults: Array<ProjectRole & { departmentName?: string }>;
  selectedDropdownIndex: number;
  setSelectedDropdownIndex: React.Dispatch<React.SetStateAction<number>>;
  showPersonDropdown: boolean;
  setShowPersonDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPerson: { id: number; name: string; department?: number | null } | null;
  selectedPersonRole: ProjectRole | null;
  selectedRole: (ProjectRole & { departmentName?: string }) | null;
  onPersonSelect: (person: { id: number; name: string; department?: number | null }) => void;
  onPersonRoleSelect: (role: ProjectRole | null) => void;
  onRoleSelect: (role: ProjectRole & { departmentName?: string }) => void;
  onAddPerson: (person: { id: number; name: string; department?: number | null }, role?: ProjectRole | null) => void;
  onAddRole: (role: ProjectRole & { departmentName?: string }) => void;
  onAddSelected: () => void;
  onCancel: () => void;
}) {
  const combinedCount = personResults.length + roleResults.length;
  const hasResults = combinedCount > 0;
  const { data: roleOptions = [] } = useProjectRoles(selectedPerson?.department ?? null, { includeInactive: true });
  return (
    <div className="grid gap-px p-1 bg-[var(--card)] border border-[var(--border)]" style={{ gridTemplateColumns: gridTemplate }}>
      <div className="col-span-2 flex flex-col gap-2 py-1 pl-[60px] pr-2 relative">
        <input
          type="text"
          value={newPersonName}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (selectedDropdownIndex >= 0 && selectedDropdownIndex < combinedCount) {
                if (selectedDropdownIndex < personResults.length) {
                  const person = personResults[selectedDropdownIndex];
                  onPersonSelect(person);
                  setShowPersonDropdown(false);
                } else {
                  const roleIndex = selectedDropdownIndex - personResults.length;
                  const role = roleResults[roleIndex];
                  if (role) {
                    onRoleSelect(role);
                    setShowPersonDropdown(false);
                  }
                }
              } else if (selectedPerson || selectedRole) {
                onAddSelected();
              }
            } else if (e.key === 'Escape') {
              onCancel();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (hasResults) {
                setShowPersonDropdown(true);
                setSelectedDropdownIndex((prev) => (prev < combinedCount - 1 ? prev + 1 : prev));
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (showPersonDropdown && hasResults) {
                setSelectedDropdownIndex((prev) => (prev > -1 ? prev - 1 : -1));
              }
            }
          }}
          placeholder="Search people or roles..."
          className="w-full px-2 py-1 text-xs bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--focus)] focus:outline-none"
          autoFocus
        />
        {showPersonDropdown && hasResults && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg z-50 max-h-48 overflow-y-auto">
            {personResults.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                People
              </div>
            )}
            {personResults.map((person, index) => (
              <button
                key={person.id}
                onClick={() => onPersonSelect(person)}
                className={`w-full text-left px-2 py-1 text-xs transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                  selectedDropdownIndex === index ? 'bg-[var(--surfaceHover)] border-[var(--primary)]' : 'hover:bg-[var(--surface)]'
                }`}
              >
                <div className="font-medium">{person.name}</div>
              </button>
            ))}
            {roleResults.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                Roles
              </div>
            )}
            {roleResults.map((role, index) => {
              const combinedIndex = personResults.length + index;
              return (
                <button
                  key={role.id}
                  onClick={() => onRoleSelect(role)}
                  className={`w-full text-left px-2 py-1 text-xs transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                    selectedDropdownIndex === combinedIndex ? 'bg-[var(--surfaceHover)] border-[var(--primary)]' : 'hover:bg-[var(--surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{role.name}</span>
                    {role.departmentName ? (
                      <span className="text-[10px] text-[var(--muted)]">{role.departmentName}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {selectedPerson ? (
          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Role</label>
            <select
              className="flex-1 px-2 py-1 text-xs bg-[var(--surface)] border border-[var(--border)] rounded text-[var(--text)]"
              value={selectedPersonRole?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                const role = roleOptions.find((r) => r.id === id) || null;
                onPersonRoleSelect(role);
              }}
            >
              <option value="">Unassigned</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-center gap-1">
        <button
          className="w-5 h-5 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors flex items-center justify-center"
          title="Save assignment"
          onClick={onAddSelected}
          disabled={!selectedPerson && !selectedRole}
        >
          ✓
        </button>
        <button
          className="w-5 h-5 rounded bg-[var(--surface)] hover:bg-[var(--surfaceHover)] text-[var(--text)] text-xs font-medium transition-colors flex items-center justify-center"
          title="Cancel"
          onClick={onCancel}
        >
          ✕
        </button>
      </div>
      <div></div>
      {weeks.map((week) => (
        <div key={week.date} className="flex items-center justify-center">
          <div className="w-12 h-6" />
        </div>
      ))}
    </div>
  );
}
