import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Project, Person, Assignment, Department } from '@/types/models';
import { useProjects, useDeleteProject, useUpdateProject } from '@/hooks/useProjects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePeople } from '@/hooks/usePeople';
import { assignmentsApi, departmentsApi, projectsApi, projectTasksApi } from '@/services/api';
import { deleteAssignment, updateAssignment } from '@/lib/mutations/assignments';
import { showToast } from '@/lib/toastBus';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useProjectFilterMetadata } from '@/hooks/useProjectFilterMetadata';
import { trackPerformanceEvent } from '@/utils/monitoring';

// PersonWithAvailability interface moved into usePersonSearch hook
import Layout from '@/components/layout/Layout';
import ProjectsSkeleton from '@/components/skeletons/ProjectsSkeleton';
import PageState from '@/components/ui/PageState';
import DeliverablesSectionLoaderComp from '@/pages/Projects/list/components/DeliverablesSectionLoader';
import FiltersBar from '@/pages/Projects/list/components/FiltersBar';
import ProjectsTable from '@/pages/Projects/list/components/ProjectsTable';
import ProjectDetailsPanel from '@/pages/Projects/list/components/ProjectDetailsPanel';
import WarningsBanner from '@/pages/Projects/list/components/WarningsBanner';
import ErrorBanner from '@/pages/Projects/list/components/ErrorBanner';
import TopBarPortal from '@/components/layout/TopBarPortal';
import StatusFilterMenu from '@/components/compact/StatusFilterMenu';
import { useProjectFilters } from '@/pages/Projects/list/hooks/useProjectFilters';
import { useProjectSelection } from '@/pages/Projects/list/hooks/useProjectSelection';
import { useAssignmentInlineEdit } from '@/pages/Projects/list/hooks/useAssignmentInlineEdit';
import { useProjectAssignments } from '@/pages/Projects/list/hooks/useProjectAssignments';
import { useProjectAvailability } from '@/pages/Projects/list/hooks/useProjectAvailability';
import { usePersonSearch } from '@/pages/Projects/list/hooks/usePersonSearch';
import { useProjectAssignmentAdd } from '@/pages/Projects/list/hooks/useProjectAssignmentAdd';
import { useProjectStatusMutation } from '@/pages/Projects/list/hooks/useProjectStatusMutation';
import { useUpdateProjectStatus } from '@/hooks/useUpdateProjectStatus';
import { useProjectDeliverablesBulk } from '@/pages/Projects/list/hooks/useProjectDeliverablesBulk';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ProjectForm from '@/pages/Projects/ProjectForm';
import { confirmAction } from '@/lib/confirmAction';
import { useRouteUiState } from '@/hooks/useRouteUiState';
import { usePageShortcuts } from '@/hooks/usePageShortcuts';
import { buildAssignmentsLink } from '@/pages/Assignments/grid/linkUtils';
import WorkPlanningSearchBar from '@/features/work-planning/search/WorkPlanningSearchBar';
import { MobileDetailsDrawer, MobileFiltersSheet, ProjectCreateDrawer } from '@/pages/Projects/list/components/ProjectsListOverlays';
import ProjectsListDesktopLayout from '@/pages/Projects/list/components/ProjectsListDesktopLayout';
import ProjectsListMobileLayout from '@/pages/Projects/list/components/ProjectsListMobileLayout';
import { useProjectsListController } from '@/pages/Projects/list/hooks/useProjectsListController';
import { useAuth } from '@/hooks/useAuth';
import { isAdminOrManager } from '@/utils/roleAccess';

// Lazy load DeliverablesSection for better initial page performance
const DeliverablesSection = React.lazy(() => import('@/components/deliverables/DeliverablesSection'));

// DeliverablesSection fallback moved to list/components/DeliverablesSectionLoader

// Memoized Assignment Row Component for performance (Phase 4 optimization)
// Local memoized components moved to list/components

const ProjectsList: React.FC = () => {
  // React Query hooks for data management
  const [ordering, setOrdering] = useState<string | null>('client,name');
  const pageStateEnabled = true;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state: routeUiState, update: updateRouteUiState } = useRouteUiState('projects');
  const { state: verticalState } = useVerticalFilter();
  const auth = useAuth();
  const hasLinkedPerson = auth?.person?.id != null;
  const [myProjectsOnly, setMyProjectsOnly] = useState(false);
  const canManageProjectLifecycle = isAdminOrManager(auth?.user);
  const canManageTaskTracking = isAdminOrManager(auth?.user);
  const { people } = usePeople({ vertical: verticalState.selectedVerticalId ?? undefined });
  const deleteProjectMutation = useDeleteProject();
  const updateProjectMutation = useUpdateProject();

  // Local UI state
  const [error, setError] = useState<string | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');
  const isNarrowHeaderLayout = useMediaQuery('(max-width: 1700px)');
  const useAbbrevHeaderLabels = !isMobileLayout && isNarrowHeaderLayout;
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [detailsPaneOpen, setDetailsPaneOpen] = useState(routeUiState.paneOpen ?? false);
  const [detailsSplitPct, setDetailsSplitPct] = useState(routeUiState.splitPct ?? 66);
  const splitDragRef = useRef<{ active: boolean; startX: number; startPct: number }>({ active: false, startX: 0, startPct: 66 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Derived filters/sort/search via hook
  const { state: deptState, backendParams } = useDepartmentFilter();

  const {
    selectedStatusFilters,
    sortBy,
    sortDirection,
    toggleStatusFilter,
    forceShowAll,
    onSort,
    formatFilterStatus,
    statusOptions: projectStatusOptions,
  } = useProjectFilters([], null, { serverSide: true });

  const {
    searchInput,
    setSearchInput,
    searchTokens,
    searchOp,
    activeTokenId,
    setActiveTokenId,
    searchTokensForApi,
    handleSearchOpChange,
    handleSearchKeyDown,
    removeSearchToken,
    clearSearchTokens,
    focusProjectsSearch,
  } = useProjectsListController();

  const serverOrdering = useMemo(() => {
    const direction = sortDirection === 'desc' ? '-' : '';
    switch (sortBy) {
      case 'client':
        return `${direction}client,name`;
      case 'name':
        return `${direction}name`;
      case 'number':
      case 'projectNumber':
        return `${direction}project_number`;
      case 'status':
        return `${direction}status,name`;
      case 'lastDue':
        return `${direction}lastDue`;
      case 'nextDue':
        return `${direction}nextDue`;
      default:
        return null;
    }
  }, [sortBy, sortDirection]);
  useEffect(() => {
    if (!serverOrdering) return;
    setOrdering((prev) => (prev === serverOrdering ? prev : serverOrdering));
  }, [serverOrdering]);

  const statusIn = useMemo(() => {
    const items = Array.from(selectedStatusFilters);
    if (!items.length || items.includes('Show All')) return null;
    return items
      .filter((s) => s && s !== 'Show All')
      .sort()
      .join(',');
  }, [selectedStatusFilters]);
  const departmentFilters = useMemo(() => (deptState.filters ?? [])
    .map((f) => ({
      departmentId: Number(f.departmentId),
      op: f.op,
    }))
    .filter((f) => Number.isFinite(f.departmentId) && f.departmentId > 0), [deptState.filters]);
  const includeChildren = useMemo(
    () => (deptState.selectedDepartmentId != null && deptState.includeChildren ? 1 : 0),
    [deptState.includeChildren, deptState.selectedDepartmentId]
  );

  const filterMetadataParams = useMemo(() => {
    const params: {
      department?: number;
      include_children?: 0 | 1;
      status_in?: string;
      vertical?: number;
      mine_only?: 0 | 1;
      search_tokens?: Array<{ term: string; op: 'or' | 'and' | 'not' }>;
      department_filters?: Array<{ departmentId: number; op: 'or' | 'and' | 'not' }>;
    } = {};
    if (verticalState.selectedVerticalId != null) params.vertical = Number(verticalState.selectedVerticalId);
    if (myProjectsOnly) params.mine_only = 1;
    if (departmentFilters.length) params.department_filters = departmentFilters;
    if (deptState.selectedDepartmentId != null) {
      params.department = Number(deptState.selectedDepartmentId);
      params.include_children = includeChildren;
    }
    if (statusIn) params.status_in = statusIn;
    if (searchTokensForApi.length) params.search_tokens = searchTokensForApi;
    return Object.keys(params).length ? params : undefined;
  }, [departmentFilters, deptState.selectedDepartmentId, includeChildren, myProjectsOnly, statusIn, searchTokensForApi, verticalState.selectedVerticalId]);

  // Optimized filter metadata (assignment counts + hasFutureDeliverables)
  const { filterMetadata, loading: filterMetaLoading, error: filterMetaError, invalidate: invalidateFilterMeta, refetch: refetchFilterMeta } = useProjectFilterMetadata(filterMetadataParams);

  const {
    projects,
    totalCount,
    loading,
    error: projectsError,
    refetch: refetchProjects,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    queryKey: projectsQueryKey,
  } = useProjects({
    ordering,
    statusIn,
    searchTokens: searchTokensForApi,
    departmentFilters,
    includeChildren,
    mineOnly: myProjectsOnly,
    vertical: verticalState.selectedVerticalId ?? undefined,
  });

  // Next Deliverables map for list column + sorting
  const { nextMap: nextDeliverablesMap, prevMap: prevDeliverablesMap, refreshOne: refreshDeliverablesFor } = useProjectDeliverablesBulk(projects);

  const leadAssignmentsDepartmentFilters = useMemo(() => {
    if (deptState.selectedDepartmentId != null) return undefined;
    if (!departmentFilters.length) return undefined;
    // Assignment rows should match selected departments by membership (union),
    // while project-level AND matching remains handled by the projects query.
    return departmentFilters.map((filter) => ({
      departmentId: filter.departmentId,
      op: filter.op === 'not' ? 'not' as const : 'or' as const,
    }));
  }, [deptState.selectedDepartmentId, departmentFilters]);
  const leadAssignmentsDepartmentFiltersKey = useMemo(
    () => JSON.stringify(leadAssignmentsDepartmentFilters ?? []),
    [leadAssignmentsDepartmentFilters]
  );
  const leadAssignmentsQueryFilters = useMemo(
    () => ({
      ...backendParams,
      include_placeholders: 1 as const,
      vertical: verticalState.selectedVerticalId ?? undefined,
      department_filters: leadAssignmentsDepartmentFilters,
    }),
    [backendParams, verticalState.selectedVerticalId, leadAssignmentsDepartmentFilters]
  );
  const leadAssignmentsKey = useMemo(
    () => [
      'projectLeadAssignments',
      backendParams.department ?? null,
      backendParams.include_children ?? null,
      leadAssignmentsDepartmentFiltersKey,
      verticalState.selectedVerticalId ?? null,
    ],
    [backendParams.department, backendParams.include_children, leadAssignmentsDepartmentFiltersKey, verticalState.selectedVerticalId]
  );
  const leadAssignmentsQuery = useQuery<Assignment[], Error>({
    queryKey: leadAssignmentsKey,
    queryFn: () => assignmentsApi.listAll(leadAssignmentsQueryFilters),
    enabled: projects.length > 0,
    staleTime: 30_000,
  });
  const leadAssignments = useMemo(() => leadAssignmentsQuery.data ?? [], [leadAssignmentsQuery.data]);
  const leadAssignmentsForList = useMemo(() => {
    if (deptState.selectedDepartmentId != null || departmentFilters.length === 0) return leadAssignments;
    const include = new Set<number>();
    const exclude = new Set<number>();
    departmentFilters.forEach((filter) => {
      if (filter.op === 'not') exclude.add(filter.departmentId);
      else include.add(filter.departmentId);
    });
    return leadAssignments.filter((assignment) => {
      const deptId = assignment.personDepartmentId ?? null;
      if (deptId != null && exclude.has(deptId)) return false;
      if (include.size > 0) return deptId != null && include.has(deptId);
      return true;
    });
  }, [leadAssignments, deptState.selectedDepartmentId, departmentFilters]);
  const departmentFilterId = deptState?.selectedDepartmentId != null ? Number(deptState.selectedDepartmentId) : null;
  const refetchProjectsSafe = useCallback(async () => {
    try { await refetchProjects(); } catch {}
  }, [refetchProjects]);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const handleForceRefresh = useCallback(async () => {
    if (forceRefreshing) return;
    setForceRefreshing(true);
    try {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['projects'], refetchType: 'active' }),
        invalidateFilterMeta(),
      ]);
    } finally {
      setForceRefreshing(false);
    }
  }, [forceRefreshing, queryClient, invalidateFilterMeta]);

  const { data: departments = [] } = useQuery<Department[], Error>({
    queryKey: ['departmentsAll', verticalState.selectedVerticalId ?? null],
    queryFn: () => departmentsApi.listAll({ vertical: verticalState.selectedVerticalId ?? undefined }),
    staleTime: 60_000,
  });

  const departmentLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => {
      if (dept.id != null) {
        map.set(dept.id, dept.shortName || dept.name || '');
      }
    });
    return map;
  }, [departments]);

  const projectAssignmentDepartments = useMemo(() => {
    const map = new Map<number, Set<number>>();
    leadAssignmentsForList.forEach((assignment) => {
      const projectId = assignment.project;
      const deptId = assignment.personDepartmentId;
      if (!projectId || deptId == null) return;
      const deptSet = map.get(projectId) ?? new Set<number>();
      deptSet.add(deptId);
      map.set(projectId, deptSet);
    });
    return map;
  }, [leadAssignmentsForList]);

  const deptFilteredSortedProjects = useMemo(() => projects, [projects]);
  const resultsCount = totalCount || deptFilteredSortedProjects.length;

  // Selection (single source of truth)
  // Use the dept-filtered list for selection and table
  const { selectedProject, setSelectedProject, selectedIndex, setSelectedIndex, handleProjectClick } = useProjectSelection(
    deptFilteredSortedProjects,
    { autoSelectFirst: false, enabled: !createDrawerOpen },
  );
  const [autoScrollProjectId, setAutoScrollProjectId] = useState<number | null>(null);
  const handleResponsiveProjectClick = useCallback((project: Project, index: number) => {
    handleProjectClick(project, index);
    if (isMobileLayout) {
      setMobileDetailOpen(true);
    }
  }, [handleProjectClick, isMobileLayout]);
  const selectRelativeProject = useCallback((delta: number) => {
    if (!deptFilteredSortedProjects.length) return;
    const fallbackIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = Math.max(0, Math.min(deptFilteredSortedProjects.length - 1, fallbackIndex + delta));
    const nextProject = deptFilteredSortedProjects[nextIndex];
    if (!nextProject) return;
    handleProjectClick(nextProject, nextIndex);
    if (isMobileLayout) setMobileDetailOpen(true);
  }, [deptFilteredSortedProjects, selectedIndex, handleProjectClick, isMobileLayout]);

  useEffect(() => {
    const savedId = routeUiState.selectedId;
    if (savedId == null || selectedProject?.id != null) return;
    const idx = deptFilteredSortedProjects.findIndex((project) => project.id === savedId);
    if (idx < 0) return;
    const project = deptFilteredSortedProjects[idx];
    if (!project) return;
    setSelectedProject(project);
    setSelectedIndex(idx);
  }, [routeUiState.selectedId, selectedProject?.id, deptFilteredSortedProjects, setSelectedProject, setSelectedIndex]);

  useEffect(() => {
    updateRouteUiState({
      paneOpen: detailsPaneOpen,
      splitPct: Math.round(detailsSplitPct),
      selectedId: selectedProject?.id ?? null,
    });
  }, [detailsPaneOpen, detailsSplitPct, selectedProject?.id, updateRouteUiState]);

  usePageShortcuts({
    bindings: [
      {
        id: 'projects-focus-search',
        keys: ['/'],
        description: 'Focus project search',
        action: focusProjectsSearch,
      },
      {
        id: 'projects-next',
        keys: ['j'],
        description: 'Select next project',
        when: () => !isMobileLayout,
        action: () => selectRelativeProject(1),
      },
      {
        id: 'projects-prev',
        keys: ['k'],
        description: 'Select previous project',
        when: () => !isMobileLayout,
        action: () => selectRelativeProject(-1),
      },
      {
        id: 'projects-open-selected',
        keys: ['enter'],
        description: 'Open selected project details',
        when: () => Boolean(selectedProject),
        action: () => {
          if (!selectedProject) return;
          if (isMobileLayout) {
            setMobileDetailOpen(true);
            return;
          }
          setDetailsPaneOpen(true);
        },
      },
      {
        id: 'projects-escape',
        keys: ['escape'],
        description: 'Close open panels',
        action: () => {
          setStatusDropdownOpen(false);
          setMobileFiltersOpen(false);
          setMobileDetailOpen(false);
          setCreateDrawerOpen(false);
        },
      },
    ],
  });

  // Assignments + available roles
  const { assignments, availableRoles, reload: reloadAssignments } = useProjectAssignments({ projectId: selectedProject?.id, people });
  const taskTrackingQuery = useQuery({
    queryKey: ['projects', 'task-tracking', selectedProject?.id ?? null],
    queryFn: () => projectsApi.tasks(selectedProject?.id as number),
    enabled: !!selectedProject?.id && (detailsPaneOpen || mobileDetailOpen),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const taskProjectMembers = useMemo(() => {
    const map = new Map<number, string>();
    const today = new Date().toISOString().slice(0, 10);
    assignments.forEach((assignment) => {
      const startOk = !assignment.startDate || assignment.startDate <= today;
      const endOk = !assignment.endDate || assignment.endDate >= today;
      if (!startOk || !endOk) return;
      if (assignment.person && assignment.personName) {
        map.set(assignment.person, assignment.personName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments]);
  const handleTaskUpdate = useCallback(async (taskId: number, patch: { completionPercent?: number; assigneeIds?: number[] }) => {
    await projectTasksApi.update(taskId, patch);
    await taskTrackingQuery.refetch();
  }, [taskTrackingQuery]);
  const handleTaskSync = useCallback(async () => {
    if (!selectedProject?.id) return;
    await projectsApi.syncTasks(selectedProject.id);
    await taskTrackingQuery.refetch();
  }, [selectedProject?.id, taskTrackingQuery]);
  const attemptedTaskSyncRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const projectId = selectedProject?.id;
    const data = taskTrackingQuery.data;
    if (!projectId || !data || !canManageTaskTracking) return;
    if (!data.enabled) return;
    if (attemptedTaskSyncRef.current.has(projectId)) return;
    attemptedTaskSyncRef.current.add(projectId);
    void (async () => {
      try {
        await projectsApi.syncTasks(projectId);
        await taskTrackingQuery.refetch();
      } catch {
        // best-effort sync
      }
    })();
  }, [selectedProject?.id, taskTrackingQuery.data, taskTrackingQuery, canManageTaskTracking]);

  const [showAddAssignment, setShowAddAssignment] = useState(false);

  // Pre-computed skills mapping for performance
  const [personSkillsMap, setPersonSkillsMap] = useState<Map<number, string[]>>(new Map());

  // Role search removed: add-assignment uses department-scoped dropdown only.
  // Toggle to restrict availability to candidate departments
  const [candidatesOnly, setCandidatesOnly] = useState<boolean>(true);

  // Optional: log filter metadata status in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && filterMetadata) {
      const size = Object.keys(filterMetadata.projectFilters || {}).length;
      console.debug('Projects filter metadata loaded:', { entries: size });
    }
  }, [filterMetadata]);

  // Set error from React Query if needed
  useEffect(() => {
    if (projectsError) {
      setError(projectsError);
    } else {
      setError(null);
    }
  }, [projectsError]);

  // Close status dropdown when the selected project changes to avoid stale menu interactions
  useEffect(() => {
    setStatusDropdownOpen(false);
  }, [selectedProject?.id]);

  // Deep-link selection: /projects?projectId=123
  const location = useLocation();
  const openCreateFromQuery = useMemo(() => {
    const sp = new URLSearchParams(location.search || '');
    return sp.get('new') === '1';
  }, [location.search]);
  useEffect(() => {
    if (!canManageProjectLifecycle) {
      setCreateDrawerOpen(false);
      if (openCreateFromQuery) {
        const sp = new URLSearchParams(location.search || '');
        sp.delete('new');
        const nextSearch = sp.toString();
        navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
      }
      return;
    }
    setCreateDrawerOpen(openCreateFromQuery);
  }, [canManageProjectLifecycle, openCreateFromQuery, location.pathname, location.search, navigate]);
  const openCreateDrawer = useCallback(() => {
    if (!canManageProjectLifecycle) return;
    setCreateDrawerOpen(true);
    setMobileDetailOpen(false);
    const sp = new URLSearchParams(location.search || '');
    sp.set('new', '1');
    const nextSearch = sp.toString();
    const currentSearch = location.search?.replace(/^\?/, '') || '';
    if (nextSearch !== currentSearch) {
      navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
    }
  }, [canManageProjectLifecycle, location.pathname, location.search, navigate]);
  const closeCreateDrawer = useCallback(() => {
    setCreateDrawerOpen(false);
    const sp = new URLSearchParams(location.search || '');
    if (!sp.has('new')) return;
    sp.delete('new');
    const nextSearch = sp.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
  }, [location.pathname, location.search, navigate]);
  const handleProjectCreated = useCallback(() => {
    closeCreateDrawer();
    void refetchProjectsSafe();
    void invalidateFilterMeta();
  }, [closeCreateDrawer, refetchProjectsSafe, invalidateFilterMeta]);
  const [pendingProjectId, setPendingProjectId] = useState<number | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(location.search || '');
    const idStr = sp.get('projectId');
    if (!idStr) return;
    const pid = Number(idStr);
    if (!Number.isFinite(pid)) return;
    setPendingProjectId(pid);
  }, [location.search]);

  useEffect(() => {
    if (!pendingProjectId) return;
    if (!deptFilteredSortedProjects || deptFilteredSortedProjects.length === 0) return;
    const idx = deptFilteredSortedProjects.findIndex(p => p.id === pendingProjectId);
    if (idx < 0) {
      // Ensure it is visible: clear search + show all once
      clearSearchTokens();
      forceShowAll();
      return;
    }
    setSelectedProject(deptFilteredSortedProjects[idx]);
    setSelectedIndex(idx);
    setAutoScrollProjectId(pendingProjectId);
    setPendingProjectId(null);
    try {
      sessionStorage.removeItem('projects.lastViewedProjectId');
      sessionStorage.removeItem('projects.lastViewedProjectIdAt');
    } catch {}
    // Strip projectId from URL so manual selection isn't overridden and refresh doesn't reselect.
    const sp = new URLSearchParams(location.search || '');
    sp.delete('projectId');
    const nextSearch = sp.toString();
    const currentSearch = location.search?.replace(/^\?/, '') || '';
    if (nextSearch !== currentSearch) {
      navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
    }
  }, [pendingProjectId, deptFilteredSortedProjects, location.pathname, location.search, navigate, setSelectedProject, setSelectedIndex, clearSearchTokens, forceShowAll]);

  // If returning from dashboard without a query param, restore last viewed project.
  useEffect(() => {
    const sp = new URLSearchParams(location.search || '');
    if (sp.get('projectId')) return;
    if (deptFilteredSortedProjects.length === 0) return;
    try {
      const rawId = sessionStorage.getItem('projects.lastViewedProjectId');
      const rawAt = sessionStorage.getItem('projects.lastViewedProjectIdAt');
      if (!rawId || !rawAt) return;
      const pid = Number(rawId);
      const ts = Number(rawAt);
      if (!Number.isFinite(pid) || !Number.isFinite(ts)) return;
      if (Date.now() - ts > 5 * 60_000) return;
      const idx = deptFilteredSortedProjects.findIndex((p) => p.id === pid);
      if (idx < 0) return;
      setSelectedProject(deptFilteredSortedProjects[idx]);
      setSelectedIndex(idx);
      setAutoScrollProjectId(pid);
      sessionStorage.removeItem('projects.lastViewedProjectId');
      sessionStorage.removeItem('projects.lastViewedProjectIdAt');
    } catch {}
  }, [location.search, deptFilteredSortedProjects, setSelectedProject, setSelectedIndex]);

  // Pre-compute person skills map for performance
  const precomputePersonSkills = useCallback(() => {
    const newSkillsMap = new Map<number, string[]>();
    assignments.forEach(assignment => {
      if (assignment.person && assignment.personSkills) {
        const personId = assignment.person;
        const existingSkills = newSkillsMap.get(personId) || [];
        const assignmentSkills = assignment.personSkills
          .filter(skill => skill.skillType === 'strength')
          .map(skill => skill.skillTagName?.toLowerCase() || '')
          .filter(skill => skill.length > 0);
        const combinedSkills = [...new Set([...existingSkills, ...assignmentSkills])];
        newSkillsMap.set(personId, combinedSkills);
      }
    });
    setPersonSkillsMap(newSkillsMap);
  }, [assignments]);

  useEffect(() => {
    if (assignments.length > 0) precomputePersonSkills();
  }, [assignments, precomputePersonSkills]);

  // Availability snapshot via hook (preserves Monday anchor)
  const caps = useCapabilities();
  const { availabilityMap } = useProjectAvailability({
    projectId: selectedProject?.id,
    departmentId: deptState?.selectedDepartmentId != null ? Number(deptState.selectedDepartmentId) : undefined,
    includeChildren: deptState?.includeChildren,
    candidatesOnly,
    vertical: verticalState.selectedVerticalId ?? null,
  });

  const qaPrefetchByDept = useMemo(() => {
    const map = new Map<number, Array<{ id: number; name: string; roleName?: string | null; department?: number | null }>>();
    people.forEach((person) => {
      if (person.id == null) return;
      const deptId = person.department ?? null;
      if (deptId == null) return;
      const list = map.get(deptId) || [];
      list.push({ id: person.id, name: person.name, roleName: person.roleName ?? null, department: deptId });
      map.set(deptId, list);
    });
    map.forEach((list, deptId) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (list.length > 12) map.set(deptId, list.slice(0, 12));
    });
    return map;
  }, [people]);

  const qaPrefetchAll = useMemo(() => {
    const list = people
      .filter((person) => person.id != null)
      .map((person) => ({
        id: person.id as number,
        name: person.name,
        roleName: person.roleName ?? null,
        department: person.department ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return list.slice(0, 12);
  }, [people]);

  const projectLeadsMap = useMemo(() => {
    const map = new Map<number, string>();
    if (!leadAssignmentsForList.length) return map;
    const peopleById = new Map<number, { name: string; departmentId?: number | null; departmentName?: string | null }>();
    const deptById = new Map<number, { name?: string; shortName?: string }>();
    people.forEach(p => {
      if (p.id != null) {
        peopleById.set(p.id, { name: p.name, departmentId: p.department ?? null, departmentName: p.departmentName ?? null });
      }
    });
    departments.forEach(d => {
      if (d.id != null) deptById.set(d.id, { name: d.name, shortName: d.shortName });
    });
    const leadsByProject = new Map<number, Map<number | string, { name: string; deptLabel: string }>>();
    leadAssignmentsForList.forEach((assignment) => {
      if (!assignment.project) return;
      const roleName = (assignment.roleName || '').toLowerCase();
      if (!roleName.includes('lead')) return;
      const personMeta = assignment.person != null ? peopleById.get(assignment.person) : undefined;
      const personName = assignment.personName || personMeta?.name;
      if (!personName) return;
      const deptId = assignment.personDepartmentId ?? personMeta?.departmentId ?? null;
      const deptMeta = deptId != null ? deptById.get(deptId) : undefined;
      const deptLabel =
        deptMeta?.shortName ||
        deptMeta?.name ||
        personMeta?.departmentName ||
        (deptId != null ? `Dept ${deptId}` : '');
      const perProject = leadsByProject.get(assignment.project) ?? new Map<number | string, { name: string; deptLabel: string }>();
      const personKey = assignment.person ?? personName;
      perProject.set(personKey, { name: personName, deptLabel });
      leadsByProject.set(assignment.project, perProject);
    });
    leadsByProject.forEach((entries, projectId) => {
      const sorted = Array.from(entries.values())
        .sort((a, b) => {
          const deptA = (a.deptLabel || 'zzzz').toLowerCase();
          const deptB = (b.deptLabel || 'zzzz').toLowerCase();
          if (deptA !== deptB) return deptA.localeCompare(deptB);
          return a.name.localeCompare(b.name);
        })
        .map(item => (item.deptLabel ? `${item.name} (${item.deptLabel})` : item.name));
      map.set(projectId, sorted.join('\n'));
    });
    return map;
  }, [leadAssignmentsForList, people, departments]);

  const projectAssignmentsTooltipMap = useMemo(() => {
    const map = new Map<number, Array<{ deptLabel: string; items: Array<{ name: string; role: string }> }>>();
    if (!leadAssignmentsForList.length) return map;
    const peopleById = new Map<number, { name: string; departmentId?: number | null; departmentName?: string | null }>();
    const deptById = new Map<number, { name?: string; shortName?: string }>();
    people.forEach(p => {
      if (p.id != null) {
        peopleById.set(p.id, { name: p.name, departmentId: p.department ?? null, departmentName: p.departmentName ?? null });
      }
    });
    departments.forEach(d => {
      if (d.id != null) deptById.set(d.id, { name: d.name, shortName: d.shortName });
    });
    const grouped = new Map<number, Map<string, Array<{ name: string; role: string }>>>();
    leadAssignmentsForList.forEach((assignment) => {
      if (!assignment.project) return;
      const personMeta = assignment.person != null ? peopleById.get(assignment.person) : undefined;
      const personName = assignment.personName
        || personMeta?.name
        || (assignment.person == null && assignment.roleName ? `<${assignment.roleName}>` : 'Unknown');
      const deptId = assignment.personDepartmentId ?? personMeta?.departmentId ?? null;
      const deptMeta = deptId != null ? deptById.get(deptId) : undefined;
      const deptLabel =
        deptMeta?.shortName ||
        deptMeta?.name ||
        personMeta?.departmentName ||
        'Unassigned';
      const roleLabel = assignment.roleName || '';
      const byDept = grouped.get(assignment.project) || new Map<string, Array<{ name: string; role: string }>>();
      const list = byDept.get(deptLabel) || [];
      if (!list.some((item) => item.name === personName && item.role === roleLabel)) {
        list.push({ name: personName, role: roleLabel });
      }
      byDept.set(deptLabel, list);
      grouped.set(assignment.project, byDept);
    });
    grouped.forEach((byDept, projectId) => {
      const entries = Array.from(byDept.entries()).map(([deptLabel, items]) => ({
        deptLabel,
        items: items.slice().sort((a, b) => {
          const nameCmp = a.name.localeCompare(b.name);
          if (nameCmp !== 0) return nameCmp;
          return a.role.localeCompare(b.role);
        }),
      }));
      entries.sort((a, b) => a.deptLabel.localeCompare(b.deptLabel));
      map.set(projectId, entries);
    });
    return map;
  }, [leadAssignmentsForList, people, departments]);

  const projectQaAssignmentsMap = useMemo(() => {
    const map = new Map<number, Assignment[]>();
    if (!leadAssignmentsForList.length) return map;
    const grouped = new Map<number, Map<string, Assignment[]>>();
    leadAssignmentsForList.forEach((assignment) => {
      if (!assignment.project) return;
      const roleName = (assignment.roleName || '').toLowerCase();
      if (!roleName.includes('qa') && !roleName.includes('quality')) return;
      const deptLabel = assignment.personDepartmentId != null
        ? (departmentLabelMap.get(assignment.personDepartmentId) || `Dept ${assignment.personDepartmentId}`)
        : 'Unassigned';
      const byDept = grouped.get(assignment.project) ?? new Map<string, Assignment[]>();
      const list = byDept.get(deptLabel) || [];
      list.push(assignment);
      byDept.set(deptLabel, list);
      grouped.set(assignment.project, byDept);
    });
    grouped.forEach((byDept, projectId) => {
      const entries = Array.from(byDept.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      const ordered: Assignment[] = [];
      entries.forEach(([_, items]) => {
        items.sort((a, b) => {
          const an = (a.personName || '').toLowerCase();
          const bn = (b.personName || '').toLowerCase();
          if (an !== bn) return an.localeCompare(bn);
          return (a.id || 0) - (b.id || 0);
        });
        ordered.push(...items);
      });
      map.set(projectId, ordered);
    });
    return map;
  }, [leadAssignmentsForList, departmentLabelMap]);

  // Conflict checker for add-assignment flow
  const checkAssignmentConflicts = useCallback(async (
    personId: number,
    projectId: number,
    weekKey: string,
    newHours: number
  ): Promise<string[]> => {
    try {
      const conflictResponse = await assignmentsApi.checkConflicts(personId, projectId, weekKey, newHours);
      return conflictResponse.warnings;
    } catch (error) {
      console.error('Failed to check assignment conflicts:', error);
      return [];
    }
  }, []);

  // Add-assignment state and ops
  const { state: newAssignment, setState: setNewAssignment, save: saveAddAssignment, cancel: cancelAddAssignment, warnings: addWarnings } = useProjectAssignmentAdd({
    projectId: selectedProject?.id ?? null,
    invalidateFilterMeta,
    reloadAssignments,
    checkAssignmentConflicts,
  });

  // Person search consolidated into hook
  const {
    results: personSearchResults,
    selectedIndex: selectedPersonIndex,
    setSelectedIndex: setSelectedPersonIndex,
    srAnnouncement,
    onChange: onPersonSearchChange,
    onFocus: onPersonSearchFocus,
    onKeyDown: onPersonSearchKeyDown,
    onSelect: onPersonSearchSelect,
  } = usePersonSearch({ people, availabilityMap, deptState, candidatesOnly, caps, vertical: verticalState.selectedVerticalId ?? null });

  const handlePersonSelect = (person: Person) => {
    onPersonSearchSelect(person);
    setNewAssignment(prev => ({
      ...prev,
      selectedPerson: person,
      personSearch: person.name,
    }));
  };

  const handleQaAssignmentUpdated = useCallback(async (projectId: number) => {
    try {
      const fresh = await assignmentsApi.listAll(leadAssignmentsQueryFilters, { noCache: true });
      queryClient.setQueryData(leadAssignmentsKey, fresh);
    } catch {
      try { await leadAssignmentsQuery.refetch(); } catch {}
    }
    if (selectedProject?.id && selectedProject.id === projectId) {
      try { await reloadAssignments(projectId); } catch {}
    }
  }, [leadAssignmentsQueryFilters, leadAssignmentsKey, leadAssignmentsQuery, queryClient, reloadAssignments, selectedProject?.id]);

  // Memoized role suggestions based on person skills
  const getSkillBasedRoleSuggestions = useCallback((person: Person | null): string[] => {
    if (!person || !assignments) return [];
    const personAssignments = assignments.filter(a => a.person === person.id);
    const personSkills = personAssignments
      .flatMap(a => a.personSkills || [])
      .filter(skill => skill.skillType === 'strength')
      .map(skill => skill.skillTagName?.toLowerCase() || '');
    const skillBasedRoles: string[] = [];
    if (personSkills.some(skill => skill.includes('heat') || skill.includes('hvac'))) {
      skillBasedRoles.push('HVAC Engineer', 'Mechanical Designer', 'Heat Calc Specialist');
    }
    if (personSkills.some(skill => skill.includes('lighting') || skill.includes('electrical'))) {
      skillBasedRoles.push('Lighting Designer', 'Electrical Engineer', 'Photometric Specialist');
    }
    if (personSkills.some(skill => skill.includes('autocad') || skill.includes('cad'))) {
      skillBasedRoles.push('CAD Designer', 'Technical Drafter', 'Design Engineer');
    }
    if (personSkills.some(skill => skill.includes('python') || skill.includes('programming'))) {
      skillBasedRoles.push('Automation Engineer', 'Technical Developer', 'Data Analyst');
    }
    if (personSkills.some(skill => skill.includes('project') || skill.includes('management'))) {
      skillBasedRoles.push('Project Manager', 'Team Lead', 'Coordinator');
    }
    return skillBasedRoles;
  }, [assignments]);

  // Inline edit hook wiring
  const {
    editingAssignment,
    editData,
    warnings: editWarnings,
    setEditData,
    getCurrentWeekHours: getCurrentWeekHoursFromHook,
    getCurrentWeekKey,
    handleEditAssignment,
    handleSaveEdit,
    handleCancelEdit,
  } = useAssignmentInlineEdit({
    assignments,
    people,
    availableRoles,
    selectedProjectId: selectedProject?.id,
    invalidateFilterMeta,
    reloadAssignments,
    getSkillBasedRoleSuggestions,
  });

  const warnings = useMemo(() => {
    const merged = new Set<string>([...editWarnings, ...addWarnings]);
    return Array.from(merged);
  }, [editWarnings, addWarnings]);

  const handleAddAssignment = () => {
    setShowAddAssignment(true);
    setNewAssignment({
      personSearch: '',
      selectedPerson: null,
      roleOnProjectId: null,
      roleOnProject: '',
      roleSearch: '',
      weeklyHours: {}
    });
  };

  const handleSaveAssignment = async () => {
    try {
      await saveAddAssignment();
      setShowAddAssignment(false);
    } catch {
      setError('Failed to create assignment');
    }
  };

  const handleCancelAddAssignment = () => {
    setShowAddAssignment(false);
    cancelAddAssignment();
    setNewAssignment({
      personSearch: '',
      selectedPerson: null,
      roleOnProjectId: null,
      roleOnProject: '',
      roleSearch: '',
      weeklyHours: {}
    });
    // no role search state to clear
  };

  const getCurrentWeekHours = (assignment: Assignment): number => getCurrentWeekHoursFromHook(assignment);
  const currentWeekKey = useMemo(() => getCurrentWeekKey(), [getCurrentWeekKey]);

  const handleDeleteAssignment = useCallback(async (assignmentId: number) => {
    const confirmed = await confirmAction({
      title: 'Remove Assignment',
      message: 'Are you sure you want to remove this assignment?',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const assignment = assignments.find(a => a.id === assignmentId);
      await deleteAssignment(assignmentId, assignmentsApi, {
        projectId: assignment?.project ?? selectedProject?.id ?? null,
        personId: assignment?.person ?? null,
        updatedAt: assignment?.updatedAt ?? new Date().toISOString(),
      });
      if (selectedProject?.id) await reloadAssignments(selectedProject.id);
      await invalidateFilterMeta();
    } catch {
      setError('Failed to delete assignment');
    }
  }, [selectedProject?.id, reloadAssignments, invalidateFilterMeta, assignments]);

  const { onChangeStatus: handleStatusChange } = useProjectStatusMutation({
    selectedProject,
    // unified hook handles mutation/invalidation internally
    // updateProjectMutation, // no longer needed here
    // invalidateFilterMeta,  // handled in unified hook
    setSelectedProject,
    setStatusDropdownOpen,
    setError,
  } as any);

  const { updateStatus } = useUpdateProjectStatus();
  const [deliverablesRefreshTick, setDeliverablesRefreshTick] = useState(0);
  const bumpDeliverablesRefresh = useCallback((projectId: number) => {
    if (selectedProject?.id === projectId) {
      setDeliverablesRefreshTick(t => t + 1);
    }
  }, [selectedProject?.id]);

  // Table-level status update for any project row
  const handleTableStatusChange = useCallback(async (projectId: number, newStatus: string) => {
    // Immediate optimistic update for the list cache so the row reflects the change
    try {
      // Optimistically update infinite pages cache
      const prevPages: any = queryClient.getQueryData(projectsQueryKey);
      if (prevPages && Array.isArray(prevPages.pages)) {
        const nextPages = {
          ...prevPages,
          pages: prevPages.pages.map((page: any) => ({
            ...page,
            results: (page?.results || []).map((p: Project) => (p.id === projectId ? { ...p, status: newStatus } : p))
          }))
        };
        queryClient.setQueryData(projectsQueryKey, nextPages);
      }
      // Optimistically update detail cache for the project
      const prevDetail = queryClient.getQueryData<Project>(['projects', projectId]);
      if (prevDetail) {
        queryClient.setQueryData(['projects', projectId], { ...prevDetail, status: newStatus });
      }
      // Keep right panel selection in sync if it's the same project
      if (selectedProject?.id === projectId) {
        setSelectedProject({ ...selectedProject, status: newStatus } as Project);
      }

      // Persist to backend + normalized caches via shared hook
      await updateStatus(projectId, newStatus);
    } catch (e) {
      console.error('Failed to update project status from table', e);
      setError('Failed to update project status');
    }
  }, [queryClient, updateStatus, selectedProject, setSelectedProject, projectsQueryKey]);

  // Sorting handled via onSort2 in enhanced filters (next deliverable support)

  // Delete the selected project (two-step confirm is handled in panel)
  const handleDeleteProject = useCallback(async (id: number) => {
    try {
      await deleteProjectMutation.mutateAsync(id);
      // Clear current selection; effect will select first available project when data refreshes
      setSelectedProject(null);
      setSelectedIndex(-1);
      setStatusDropdownOpen(false);
    } catch (e) {
      console.error('Failed to delete project', e);
      setError('Failed to delete project');
    }
  }, [deleteProjectMutation, setSelectedProject, setSelectedIndex]);
  const handleCopyProjectLink = useCallback(async (project: Project) => {
    if (project.id == null || typeof window === 'undefined') return;
    const url = `${window.location.origin}/projects?projectId=${project.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Project link copied', 'success');
    } catch {
      showToast('Unable to copy link', 'warning');
    }
  }, []);

  // Page ready timing
  const [pageStart] = useState(() => performance.now());
  useEffect(() => {
    if (!loading && !filterMetaLoading) {
      const readyDuration = performance.now() - pageStart;
      trackPerformanceEvent('projects.page.ready', readyDuration, 'ms', {
        projectsCount: projects.length,
        hasMetadata: Boolean(filterMetadata),
      });
    }
  }, [loading, filterMetaLoading, pageStart, projects.length, filterMetadata]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownOpen) {
        const target = event.target as Element;
        const dropdownContainer = target.closest('.status-dropdown-container');
        if (!dropdownContainer) setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen]);

  useEffect(() => {
    if (!isMobileLayout) {
      setMobileFiltersOpen(false);
      setMobileDetailOpen(false);
    } else if (selectedProject) {
      setMobileDetailOpen(true);
    }
  }, [isMobileLayout, selectedProject?.id]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!splitDragRef.current.active) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const deltaX = e.clientX - splitDragRef.current.startX;
      const deltaPct = (deltaX / rect.width) * 100;
      const next = Math.min(80, Math.max(50, splitDragRef.current.startPct + deltaPct));
      setDetailsSplitPct(next);
    };
    const onUp = () => { splitDragRef.current.active = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (loading) {
    if (pageStateEnabled) {
      return (
        <Layout>
          <PageState isLoading skeleton={<ProjectsSkeleton />} />
        </Layout>
      );
    }
    return (
      <Layout>
        <ProjectsSkeleton />
      </Layout>
    );
  }

  if (pageStateEnabled && error && deptFilteredSortedProjects.length === 0) {
    return (
      <Layout>
        <PageState error={error} onRetry={() => { void refetchProjectsSafe(); }} />
      </Layout>
    );
  }

  const searchBar = (
    <div className={isMobileLayout ? 'w-full min-w-0' : 'w-[340px] min-w-[240px] max-w-[36vw] shrink-0'}>
      <WorkPlanningSearchBar
        id="projects-search"
        label="Search projects"
        tokens={searchTokens}
        activeTokenId={activeTokenId}
        searchOp={searchOp}
        searchInput={searchInput}
        onInputChange={setSearchInput}
        onInputKeyDown={handleSearchKeyDown}
        onTokenSelect={setActiveTokenId}
        onTokenRemove={removeSearchToken}
        onSearchOpChange={handleSearchOpChange}
        placeholder={searchTokens.length ? 'Add another filter...' : 'Search projects by client, name, or number (Enter)'}
        tokenLayout="scroll"
      />
    </div>
  );

  const topBarHeader = (
    <div className="flex items-center gap-1 min-w-0">
      {searchBar}
      <button
        type="button"
        className="h-10 inline-flex items-center px-3 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
        onClick={() => { void handleForceRefresh(); }}
        title="Force refresh projects list"
        disabled={forceRefreshing}
      >
        {forceRefreshing ? 'Refreshing...' : 'Refresh'}
      </button>
      {canManageProjectLifecycle && (
        <button
          type="button"
          className="h-10 inline-flex items-center px-3 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] shrink-0"
          onClick={openCreateDrawer}
          title="Create new project"
        >
          + New
        </button>
      )}
      <button
        type="button"
        className="h-10 inline-flex items-center px-3 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] shrink-0"
        onClick={() => setDetailsPaneOpen((v) => !v)}
        title={detailsPaneOpen ? 'Hide project details panel' : 'Show project details panel'}
      >
        {detailsPaneOpen ? 'Hide Details' : 'Show Details'}
      </button>
      <StatusFilterMenu
        statusOptions={projectStatusOptions}
        selectedStatuses={selectedStatusFilters}
        formatStatus={formatFilterStatus}
        onToggleStatus={toggleStatusFilter}
        buttonLabel="Filter"
        buttonTitle="Filter projects"
      />
      <button
        type="button"
        className={`h-10 inline-flex items-center px-3 rounded border text-xs shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${
          myProjectsOnly
            ? 'border-[var(--primary)] bg-[var(--primary)]/15 text-[var(--text)]'
            : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
        }`}
        onClick={() => setMyProjectsOnly((prev) => !prev)}
        disabled={!hasLinkedPerson}
        aria-pressed={myProjectsOnly}
        title="Show only projects where you are assigned"
      >
        My Projects
      </button>
      <a
        href={buildAssignmentsLink({ weeks: 20, statuses: (Array.from(selectedStatusFilters) || []).filter((s) => s !== 'Show All') })}
        className="h-10 inline-flex items-center px-2 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] shrink-0"
        title="Assignments View"
      >
        {useAbbrevHeaderLabels ? 'AV' : 'Assignments View'}
      </a>
    </div>
  );

  const leftTopBarContent = !isMobileLayout ? (
    <TopBarPortal side="left">
      <div className="text-base font-semibold text-[var(--text)] leading-tight whitespace-nowrap">Projects</div>
    </TopBarPortal>
  ) : null;

  const desktopLayout = (
    <ProjectsListDesktopLayout>
      <div ref={containerRef} className="h-full min-h-0 flex bg-[var(--bg)] relative">
        <div
        className={`${detailsPaneOpen ? '' : 'w-full'} border-r border-[var(--border)] flex flex-col min-w-0 min-h-0 overflow-y-auto scrollbar-theme relative transition-all`}
        style={detailsPaneOpen ? { width: `${detailsSplitPct}%` } : undefined}
      >
        {error && (<ErrorBanner message={error} />)}
        {warnings.length > 0 && (<WarningsBanner warnings={warnings} />)}
        <ProjectsTable
          projects={deptFilteredSortedProjects}
          selectedProjectId={selectedProject?.id ?? null}
          onSelect={handleResponsiveProjectClick}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={onSort}
          loading={loading}
          nextDeliverables={nextDeliverablesMap}
          prevDeliverables={prevDeliverablesMap}
          projectLeads={projectLeadsMap}
          projectAssignmentsTooltip={projectAssignmentsTooltipMap}
          projectQaAssignments={projectQaAssignmentsMap}
          projectAssignmentDepartments={projectAssignmentDepartments}
          departmentLabels={departmentLabelMap}
          qaPrefetchByDept={qaPrefetchByDept}
          qaPrefetchAll={qaPrefetchAll}
          departmentFilterId={departmentFilterId}
          onQaAssignmentUpdated={handleQaAssignmentUpdated}
          onChangeStatus={handleTableStatusChange}
          onRefreshDeliverables={refreshDeliverablesFor}
          onDeliverableEdited={bumpDeliverablesRefresh}
          showDashboardButton
          onCopyProjectLink={handleCopyProjectLink}
          onOpenDetails={(project, index) => {
            handleResponsiveProjectClick(project, index);
            if (!isMobileLayout) setDetailsPaneOpen(true);
          }}
          autoScrollProjectId={autoScrollProjectId}
          onAutoScrollComplete={() => setAutoScrollProjectId(null)}
          hasMore={!!hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={() => fetchNextPage()}
        />
        {hasNextPage && (
          <div className="p-3 flex justify-center border-t border-[var(--border)] bg-[var(--surface)]">
            <button
              type="button"
              className="px-3 py-1 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
      {detailsPaneOpen && (
        <div
          role="separator"
          aria-orientation="vertical"
          className="absolute top-0 bottom-0 w-2 -ml-1 bg-transparent hover:bg-[var(--border)] cursor-col-resize z-20"
          style={{ left: `calc(${detailsSplitPct}% - 1px)` }}
          onMouseDown={(e) => {
            splitDragRef.current.active = true;
            splitDragRef.current.startX = e.clientX;
            splitDragRef.current.startPct = detailsSplitPct;
            e.preventDefault();
          }}
        />
      )}
      <div
        className={`${detailsPaneOpen ? 'translate-x-0' : 'w-0 translate-x-full'} flex flex-col bg-[var(--surface)] min-w-0 min-h-0 overflow-y-auto transition-all`}
        style={detailsPaneOpen ? { width: `${100 - detailsSplitPct}%` } : undefined}
      >
        {detailsPaneOpen ? (
          selectedProject ? (
            <ProjectDetailsPanel
              project={selectedProject}
              statusDropdownOpen={statusDropdownOpen}
              setStatusDropdownOpen={setStatusDropdownOpen}
              onStatusChange={handleStatusChange}
              onProjectRefetch={refetchProjectsSafe}
              onDeleteProject={canManageProjectLifecycle ? handleDeleteProject : undefined}
              assignments={assignments}
              editingAssignmentId={editingAssignment}
              editData={editData}
              warnings={warnings}
              onEditAssignment={handleEditAssignment}
              onDeleteAssignment={handleDeleteAssignment}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onHoursChange={(h) => setEditData((prev) => ({ ...prev, currentWeekHours: h }))}
              getCurrentWeekHours={getCurrentWeekHours}
              currentWeekKey={currentWeekKey}
              onChangeAssignmentRole={async (assignmentId, roleId, roleName) => {
                try {
                  await updateAssignment(assignmentId, { roleOnProjectId: roleId }, assignmentsApi);
                  if (selectedProject?.id) await reloadAssignments(selectedProject.id);
                  await invalidateFilterMeta();
                } catch (e) {
                  console.error('Failed to update role on project', e);
                }
              }}
              onUpdateWeekHours={async (assignmentId, weekKey, hours) => {
                try {
                  const asn = assignments.find(a => a.id === assignmentId);
                  if (!asn) return;
                  const updatedWeeklyHours = { ...(asn.weeklyHours || {}) } as Record<string, number>;
                  updatedWeeklyHours[weekKey] = hours;
                  await updateAssignment(assignmentId, { weeklyHours: updatedWeeklyHours }, assignmentsApi);
                } catch (e) {
                  console.error('Failed to update hours', e);
                }
              }}
              reloadAssignments={reloadAssignments}
              invalidateFilterMeta={invalidateFilterMeta}
              getPersonDepartmentId={(personId) => {
                const p = people.find(pp => pp.id === personId);
                return (p?.department ?? null) as any;
              }}
              getPersonDepartmentName={(personId) => {
                const p = people.find(pp => pp.id === personId);
                return p?.departmentName ?? null;
              }}
              showAddAssignment={showAddAssignment}
              onAddAssignment={handleAddAssignment}
              onSaveAssignment={handleSaveAssignment}
              onCancelAddAssignment={handleCancelAddAssignment}
              addAssignmentState={newAssignment as any}
              onPersonSearch={(term) => { onPersonSearchChange(term); setNewAssignment(prev => ({ ...prev, personSearch: term })); }}
              onPersonSearchFocus={() => onPersonSearchFocus()}
              onPersonSearchKeyDown={onPersonSearchKeyDown}
              srAnnouncement={srAnnouncement}
              personSearchResults={personSearchResults as any}
              selectedPersonIndex={selectedPersonIndex}
              onPersonSelect={handlePersonSelect}
              onRoleSelectNew={(roleId, roleName) => {
                const name = roleName || '';
                setNewAssignment(prev => ({ ...prev, roleOnProjectId: roleId ?? null, roleOnProject: name, roleSearch: name }));
              }}
              onRolePlaceholderSelect={(role) => {
                const name = role?.name || '';
                setNewAssignment(prev => ({
                  ...prev,
                  selectedPerson: null,
                  personSearch: `<${name}>`,
                  roleOnProjectId: role?.id ?? null,
                  roleOnProject: name,
                  roleSearch: name,
                }));
                onPersonSearchChange(`<${name}>`);
              }}
              departments={departments}
              onSwapPlaceholder={async (assignmentId, person) => {
                try {
                  await updateAssignment(assignmentId, { person: person.id }, assignmentsApi);
                  if (selectedProject?.id) await reloadAssignments(selectedProject.id);
                  await invalidateFilterMeta();
                  showToast('Assignment updated', 'success');
                } catch (e) {
                  showToast((e as any)?.message || 'Failed to replace placeholder', 'error');
                  if (selectedProject?.id) await reloadAssignments(selectedProject.id);
                }
              }}
              candidatesOnly={candidatesOnly}
              setCandidatesOnly={setCandidatesOnly}
              availabilityMap={availabilityMap}
              taskTracking={taskTrackingQuery.data}
              taskTrackingLoading={taskTrackingQuery.isLoading}
              canManageTaskTracking={canManageTaskTracking}
              taskProjectMembers={taskProjectMembers}
              onTaskUpdate={handleTaskUpdate}
              onTaskSync={handleTaskSync}
              deliverablesSlot={
                <Suspense fallback={<DeliverablesSectionLoaderComp />}>
                  <DeliverablesSection
                    project={selectedProject}
                    variant="embedded"
                    refreshToken={deliverablesRefreshTick}
                    onDeliverablesChanged={() => {
                      try { if (selectedProject?.id) refreshDeliverablesFor(selectedProject.id); } catch {}
                      void taskTrackingQuery.refetch();
                    }}
                  />
                </Suspense>
              }
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-[var(--muted)]">
                <div className="text-lg mb-2">Select a project</div>
                <div className="text-sm">Choose a project from the list to view details</div>
              </div>
            </div>
          )
        ) : null}
        </div>
      </div>
    </ProjectsListDesktopLayout>
  );

  const mobileLayout = (
    <ProjectsListMobileLayout>
      <div className="p-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="ux-page-hero flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-[var(--text)]">Projects</h1>
            <p className="text-xs text-[var(--muted)]">{resultsCount} results</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-full border border-[var(--border)] text-xs text-[var(--text)]"
              onClick={() => setMobileFiltersOpen(true)}
            >
              Filters
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-full border border-[var(--border)] text-xs text-[var(--text)] disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={() => { void handleForceRefresh(); }}
              disabled={forceRefreshing}
            >
              {forceRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            {canManageProjectLifecycle && (
              <button
                type="button"
                className="px-3 py-1 rounded-full border border-[var(--border)] text-xs text-[var(--text)]"
                onClick={openCreateDrawer}
              >
                + New
              </button>
            )}
          </div>
        </div>
      </div>
      {error && (<ErrorBanner message={error} />)}
      {warnings.length > 0 && (<WarningsBanner warnings={warnings} />)}
      <ProjectsTable
        projects={deptFilteredSortedProjects}
        selectedProjectId={selectedProject?.id ?? null}
        onSelect={handleResponsiveProjectClick}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={onSort}
        loading={loading}
        nextDeliverables={nextDeliverablesMap}
        prevDeliverables={prevDeliverablesMap}
        projectLeads={projectLeadsMap}
        projectAssignmentsTooltip={projectAssignmentsTooltipMap}
        projectQaAssignments={projectQaAssignmentsMap}
        projectAssignmentDepartments={projectAssignmentDepartments}
        departmentLabels={departmentLabelMap}
        qaPrefetchByDept={qaPrefetchByDept}
        qaPrefetchAll={qaPrefetchAll}
        departmentFilterId={departmentFilterId}
        onQaAssignmentUpdated={handleQaAssignmentUpdated}
        onChangeStatus={handleTableStatusChange}
        onRefreshDeliverables={refreshDeliverablesFor}
        onDeliverableEdited={bumpDeliverablesRefresh}
        onCopyProjectLink={handleCopyProjectLink}
        onOpenDetails={(project, index) => {
          handleResponsiveProjectClick(project, index);
          setMobileDetailOpen(true);
        }}
        isMobileList
        autoScrollProjectId={autoScrollProjectId}
        onAutoScrollComplete={() => setAutoScrollProjectId(null)}
        hasMore={!!hasNextPage}
        isLoadingMore={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
      />
      {hasNextPage && (
        <div className="p-3 flex justify-center border-t border-[var(--border)] bg-[var(--surface)]">
          <button
            type="button"
            className="px-3 py-1 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] disabled:opacity-60 disabled:cursor-not-allowed"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </ProjectsListMobileLayout>
  );

  return (
    <Layout>
      {leftTopBarContent}
      {!isMobileLayout ? <TopBarPortal side="right">{topBarHeader}</TopBarPortal> : null}
      {isMobileLayout ? mobileLayout : desktopLayout}
      <MobileFiltersSheet open={isMobileLayout && mobileFiltersOpen} title="Project Filters" onClose={() => setMobileFiltersOpen(false)}>
        <FiltersBar
          myProjectsOnly={myProjectsOnly}
          onToggleMyProjectsOnly={() => setMyProjectsOnly((prev) => !prev)}
          disableMyProjectsOnly={!hasLinkedPerson}
          statusOptions={projectStatusOptions}
          selectedStatusFilters={selectedStatusFilters}
          onToggleStatus={toggleStatusFilter}
          searchTokens={searchTokens}
          searchInput={searchInput}
          searchOp={searchOp}
          activeTokenId={activeTokenId}
          onSearchInput={setSearchInput}
          onSearchKeyDown={handleSearchKeyDown}
          onSearchOpChange={handleSearchOpChange}
          onSelectToken={setActiveTokenId}
          onRemoveToken={removeSearchToken}
          formatFilterStatus={formatFilterStatus}
          filterMetaLoading={filterMetaLoading}
          filterMetaError={filterMetaError}
          onRetryFilterMeta={() => { void refetchFilterMeta(); }}
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="flex-1 px-3 py-2 rounded border border-[var(--border)] text-[var(--text)]"
            onClick={() => {
              forceShowAll();
              clearSearchTokens();
              setMyProjectsOnly(false);
            }}
          >
            Reset Filters
          </button>
          <button
            type="button"
            className="flex-1 px-3 py-2 rounded bg-[var(--primary)] text-white"
            onClick={() => setMobileFiltersOpen(false)}
          >
            Close
          </button>
        </div>
      </MobileFiltersSheet>
      <MobileDetailsDrawer open={isMobileLayout && mobileDetailOpen && !!selectedProject} title={selectedProject?.name || 'Project'} onClose={() => setMobileDetailOpen(false)}>
        {selectedProject ? (
          <ProjectDetailsPanel
            project={selectedProject}
            statusDropdownOpen={statusDropdownOpen}
            setStatusDropdownOpen={setStatusDropdownOpen}
            onStatusChange={handleStatusChange}
            onProjectRefetch={refetchProjectsSafe}
            onDeleteProject={canManageProjectLifecycle ? handleDeleteProject : undefined}
            assignments={assignments}
            editingAssignmentId={editingAssignment}
            editData={editData}
            warnings={warnings}
            onEditAssignment={handleEditAssignment}
            onDeleteAssignment={handleDeleteAssignment}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onHoursChange={(h) => setEditData((prev) => ({ ...prev, currentWeekHours: h }))}
            getCurrentWeekHours={getCurrentWeekHours}
            currentWeekKey={currentWeekKey}
            onChangeAssignmentRole={async (assignmentId, roleId, roleName) => {
              try {
                await updateAssignment(assignmentId, { roleOnProjectId: roleId }, assignmentsApi);
                if (selectedProject?.id) await reloadAssignments(selectedProject.id);
                await invalidateFilterMeta();
              } catch (e) {
                console.error('Failed to update role on project', e);
              }
            }}
            onUpdateWeekHours={async (assignmentId, weekKey, hours) => {
              try {
                const asn = assignments.find(a => a.id === assignmentId);
                if (!asn) return;
                const updatedWeeklyHours = { ...(asn.weeklyHours || {}) } as Record<string, number>;
                updatedWeeklyHours[weekKey] = hours;
                await updateAssignment(assignmentId, { weeklyHours: updatedWeeklyHours }, assignmentsApi);
              } catch (e) {
                console.error('Failed to update hours', e);
              }
            }}
            reloadAssignments={reloadAssignments}
            invalidateFilterMeta={invalidateFilterMeta}
            getPersonDepartmentId={(personId) => {
              const p = people.find(pp => pp.id === personId);
              return (p?.department ?? null) as any;
            }}
            getPersonDepartmentName={(personId) => {
              const p = people.find(pp => pp.id === personId);
              return p?.departmentName ?? null;
            }}
            showAddAssignment={showAddAssignment}
            onAddAssignment={handleAddAssignment}
            onSaveAssignment={handleSaveAssignment}
            onCancelAddAssignment={handleCancelAddAssignment}
            addAssignmentState={newAssignment as any}
            onPersonSearch={(term) => { onPersonSearchChange(term); setNewAssignment(prev => ({ ...prev, personSearch: term })); }}
            onPersonSearchFocus={() => onPersonSearchFocus()}
            onPersonSearchKeyDown={onPersonSearchKeyDown}
            srAnnouncement={srAnnouncement}
            personSearchResults={personSearchResults as any}
            selectedPersonIndex={selectedPersonIndex}
            onPersonSelect={handlePersonSelect}
            onRoleSelectNew={(roleId, roleName) => {
              const name = roleName || '';
              setNewAssignment(prev => ({ ...prev, roleOnProjectId: roleId ?? null, roleOnProject: name, roleSearch: name }));
            }}
            onRolePlaceholderSelect={(role) => {
              const name = role?.name || '';
              setNewAssignment(prev => ({
                ...prev,
                selectedPerson: null,
                personSearch: `<${name}>`,
                roleOnProjectId: role?.id ?? null,
                roleOnProject: name,
                roleSearch: name,
              }));
              onPersonSearchChange(`<${name}>`);
            }}
            departments={departments}
            onSwapPlaceholder={async (assignmentId, person) => {
              try {
                await updateAssignment(assignmentId, { person: person.id }, assignmentsApi);
                if (selectedProject?.id) await reloadAssignments(selectedProject.id);
                await invalidateFilterMeta();
                showToast('Assignment updated', 'success');
              } catch (e) {
                showToast((e as any)?.message || 'Failed to replace placeholder', 'error');
                if (selectedProject?.id) await reloadAssignments(selectedProject.id);
              }
            }}
            candidatesOnly={candidatesOnly}
            setCandidatesOnly={setCandidatesOnly}
            availabilityMap={availabilityMap}
            taskTracking={taskTrackingQuery.data}
            taskTrackingLoading={taskTrackingQuery.isLoading}
            canManageTaskTracking={canManageTaskTracking}
            taskProjectMembers={taskProjectMembers}
            onTaskUpdate={handleTaskUpdate}
            onTaskSync={handleTaskSync}
            deliverablesSlot={
              <Suspense fallback={<DeliverablesSectionLoaderComp />}>
                <DeliverablesSection
                  project={selectedProject}
                  variant="embedded"
                  onDeliverablesChanged={() => {
                    try { if (selectedProject?.id) refreshDeliverablesFor(selectedProject.id); } catch {}
                    void taskTrackingQuery.refetch();
                  }}
                />
              </Suspense>
            }
          />
        ) : (
          <div className="p-4 text-sm text-[var(--muted)]">Select a project to view details</div>
        )}
      </MobileDetailsDrawer>
      {canManageProjectLifecycle && (
        <ProjectCreateDrawer open={createDrawerOpen} onClose={closeCreateDrawer}>
          <ProjectForm embedded onCancel={closeCreateDrawer} onSuccess={handleProjectCreated} />
        </ProjectCreateDrawer>
      )}
    </Layout>
  );
};

export default ProjectsList;
