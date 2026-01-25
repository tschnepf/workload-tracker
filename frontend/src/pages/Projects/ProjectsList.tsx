import React, { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { Link, useLocation, useNavigate } from 'react-router';
import { Project, Person, Assignment, Department } from '@/types/models';
import { useProjects, useDeleteProject, useUpdateProject } from '@/hooks/useProjects';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePeople } from '@/hooks/usePeople';
import { assignmentsApi, departmentsApi } from '@/services/api';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useProjectFilterMetadata } from '@/hooks/useProjectFilterMetadata';
import type { ProjectFilterMetadataResponse } from '@/types/models';
import { trackPerformanceEvent } from '@/utils/monitoring';

// PersonWithAvailability interface moved into usePersonSearch hook
import Layout from '@/components/layout/Layout';
import ProjectsSkeleton from '@/components/skeletons/ProjectsSkeleton';
import { statusOptions } from '@/components/projects/StatusBadge';
import DeliverablesSectionLoaderComp from '@/pages/Projects/list/components/DeliverablesSectionLoader';
import FiltersBar from '@/pages/Projects/list/components/FiltersBar';
import ProjectsTable from '@/pages/Projects/list/components/ProjectsTable';
import ProjectDetailsPanel from '@/pages/Projects/list/components/ProjectDetailsPanel';
import WarningsBanner from '@/pages/Projects/list/components/WarningsBanner';
import ErrorBanner from '@/pages/Projects/list/components/ErrorBanner';
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

// Lazy load DeliverablesSection for better initial page performance
const DeliverablesSection = React.lazy(() => import('@/components/deliverables/DeliverablesSection'));

// DeliverablesSection fallback moved to list/components/DeliverablesSectionLoader

// Memoized Assignment Row Component for performance (Phase 4 optimization)
// Local memoized components moved to list/components

const ProjectsList: React.FC = () => {
  // React Query hooks for data management
  const { projects, loading, error: projectsError, refetch: refetchProjects } = useProjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { people, peopleVersion } = usePeople();
  const deleteProjectMutation = useDeleteProject();
  const updateProjectMutation = useUpdateProject();

  // Local UI state
  const [error, setError] = useState<string | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const isMobileLayout = useMediaQuery('(max-width: 1023px)');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [detailsPaneOpen, setDetailsPaneOpen] = useState(false);
  const [detailsSplitPct, setDetailsSplitPct] = useState(66);
  const splitDragRef = useRef<{ active: boolean; startX: number; startPct: number }>({ active: false, startX: 0, startPct: 66 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Optimized filter metadata (assignment counts + hasFutureDeliverables)
  const { filterMetadata, loading: filterMetaLoading, error: filterMetaError, invalidate: invalidateFilterMeta, refetch: refetchFilterMeta } = useProjectFilterMetadata();
  // Derived filters/sort/search via hook
  

  // Next Deliverables map for list column + sorting
  const { nextMap: nextDeliverablesMap, prevMap: prevDeliverablesMap, refreshOne: refreshDeliverablesFor } = useProjectDeliverablesBulk(projects);

  // Recompute filters with custom sort getter when needed (stable ID mapping)
  const {
    selectedStatusFilters,
    sortBy,
    sortDirection,
    searchTerm,
    setSearchTerm,
    toggleStatusFilter,
    forceShowAll,
    onSort,
    formatFilterStatus,
    filteredProjects,
    sortedProjects,
  } = useProjectFilters(projects, filterMetadata, {
    customSortGetters: {
      nextDue: (p) => {
        const d = p.id != null ? nextDeliverablesMap.get(p.id) : null;
        return d?.date || null;
      },
      lastDue: (p) => {
        const d = p.id != null ? prevDeliverablesMap.get(p.id) : null;
        return d?.date || null;
      },
    },
  });

  // Selection (single source of truth)
  // Use the enhanced sortedProjects for selection and table
  const { selectedProject, setSelectedProject, selectedIndex, setSelectedIndex, handleProjectClick } = useProjectSelection(sortedProjects);
  const [autoScrollProjectId, setAutoScrollProjectId] = useState<number | null>(null);
  const handleResponsiveProjectClick = useCallback((project: Project, index: number) => {
    handleProjectClick(project, index);
    if (isMobileLayout) {
      setMobileDetailOpen(true);
    }
  }, [handleProjectClick, isMobileLayout]);

  // Assignments + available roles
  const { assignments, availableRoles, reload: reloadAssignments } = useProjectAssignments({ projectId: selectedProject?.id, people });

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
    if (!sortedProjects || sortedProjects.length === 0) return;
    const idx = sortedProjects.findIndex(p => p.id === pendingProjectId);
    if (idx < 0) {
      // Ensure it is visible: clear search + show all once
      setSearchTerm('');
      forceShowAll();
      return;
    }
    setSelectedProject(sortedProjects[idx]);
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
  }, [pendingProjectId, sortedProjects, location.pathname, location.search, navigate, setSelectedProject, setSelectedIndex, setSearchTerm, forceShowAll]);

  // If returning from dashboard without a query param, restore last viewed project.
  useEffect(() => {
    const sp = new URLSearchParams(location.search || '');
    if (sp.get('projectId')) return;
    if (sortedProjects.length === 0) return;
    try {
      const rawId = sessionStorage.getItem('projects.lastViewedProjectId');
      const rawAt = sessionStorage.getItem('projects.lastViewedProjectIdAt');
      if (!rawId || !rawAt) return;
      const pid = Number(rawId);
      const ts = Number(rawAt);
      if (!Number.isFinite(pid) || !Number.isFinite(ts)) return;
      if (Date.now() - ts > 5 * 60_000) return;
      const idx = sortedProjects.findIndex((p) => p.id === pid);
      if (idx < 0) return;
      setSelectedProject(sortedProjects[idx]);
      setSelectedIndex(idx);
      setAutoScrollProjectId(pid);
      sessionStorage.removeItem('projects.lastViewedProjectId');
      sessionStorage.removeItem('projects.lastViewedProjectIdAt');
    } catch {}
  }, [location.search, sortedProjects, setSelectedProject, setSelectedIndex]);

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
  const { state: deptState, backendParams } = useDepartmentFilter();
  const caps = useCapabilities();
  const { availabilityMap } = useProjectAvailability({
    projectId: selectedProject?.id,
    departmentId: deptState?.selectedDepartmentId != null ? Number(deptState.selectedDepartmentId) : undefined,
    includeChildren: deptState?.includeChildren,
    candidatesOnly,
  });

  const { data: leadAssignments = [] } = useQuery<Assignment[], Error>({
    queryKey: ['projectLeadAssignments', backendParams.department ?? null, backendParams.include_children ?? null],
    queryFn: () => assignmentsApi.listAll(backendParams),
    enabled: projects.length > 0,
    staleTime: 30_000,
  });
  const { data: departments = [] } = useQuery<Department[], Error>({
    queryKey: ['departmentsAll'],
    queryFn: () => departmentsApi.listAll(),
    staleTime: 60_000,
  });

  const projectLeadsMap = useMemo(() => {
    const map = new Map<number, string>();
    if (!leadAssignments.length) return map;
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
    leadAssignments.forEach((assignment) => {
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
  }, [leadAssignments, people, departments]);

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
  } = usePersonSearch({ people, availabilityMap, deptState, candidatesOnly, caps });

  const handlePersonSelect = (person: Person) => {
    onPersonSearchSelect(person);
    setNewAssignment(prev => ({
      ...prev,
      selectedPerson: person,
      personSearch: person.name,
    }));
  };

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
    if (!confirm('Are you sure you want to remove this assignment?')) return;
    try {
      await assignmentsApi.delete(assignmentId);
      if (selectedProject?.id) await reloadAssignments(selectedProject.id);
      await invalidateFilterMeta();
    } catch {
      setError('Failed to delete assignment');
    }
  }, [selectedProject?.id, reloadAssignments, invalidateFilterMeta]);

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
      const prevPages: any = queryClient.getQueryData(['projects']);
      if (prevPages && Array.isArray(prevPages.pages)) {
        const nextPages = {
          ...prevPages,
          pages: prevPages.pages.map((page: any) => ({
            ...page,
            results: (page?.results || []).map((p: Project) => (p.id === projectId ? { ...p, status: newStatus } : p))
          }))
        };
        queryClient.setQueryData(['projects'], nextPages);
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
  }, [queryClient, updateStatus, selectedProject, setSelectedProject]);

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
    return (
      <Layout>
        <ProjectsSkeleton />
      </Layout>
    );
  }

  const desktopLayout = (
    <div ref={containerRef} className="h-full min-h-0 flex bg-[var(--bg)] relative">
      <div
        className={`${detailsPaneOpen ? '' : 'w-full'} border-r border-[var(--border)] flex flex-col min-w-0 min-h-0 overflow-y-auto scrollbar-theme relative transition-all`}
        style={detailsPaneOpen ? { width: `${detailsSplitPct}%` } : undefined}
      >
        <div className="p-3 pr-[10px] border-b border-[var(--border)]">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-lg font-semibold text-[var(--text)]">Projects</h1>
            <div className="flex flex-col items-end gap-2">
              <Link to="/projects/new">
                <button
                  className="px-2 py-1 rounded-md border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] transition-colors text-xs sm:text-sm font-medium leading-tight flex items-center justify-center gap-1.5"
                  style={{ minHeight: 32 }}
                >
                  <span>+</span>
                  <span>New</span>
                </button>
              </Link>
            </div>
          </div>
          <FiltersBar
            statusOptions={statusOptions}
            selectedStatusFilters={selectedStatusFilters}
            onToggleStatus={toggleStatusFilter}
            searchTerm={searchTerm}
            onSearchTerm={setSearchTerm}
            formatFilterStatus={formatFilterStatus}
            filterMetaLoading={filterMetaLoading}
            filterMetaError={filterMetaError}
            onRetryFilterMeta={() => { void refetchFilterMeta(); }}
            rightSlot={(
              <button
                type="button"
                aria-label={detailsPaneOpen ? 'Hide project details' : 'Show project details'}
                title={detailsPaneOpen ? 'Hide project details' : 'Show project details'}
                onClick={() => setDetailsPaneOpen((v) => !v)}
                className="px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surfaceHover)] flex items-center justify-center gap-1 text-xs sm:text-sm font-medium text-center leading-tight"
                style={{ minHeight: 32 }}
              >
                {!detailsPaneOpen ? (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                ) : null}
                <span>Details</span>
                {detailsPaneOpen ? (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                ) : null}
              </button>
            )}
          />
        </div>
        {error && (<ErrorBanner message={error} />)}
        {warnings.length > 0 && (<WarningsBanner warnings={warnings} />)}
        <ProjectsTable
          projects={sortedProjects}
          selectedProjectId={selectedProject?.id ?? null}
          onSelect={handleResponsiveProjectClick}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={onSort}
          loading={loading}
          nextDeliverables={nextDeliverablesMap}
          prevDeliverables={prevDeliverablesMap}
          projectLeads={projectLeadsMap}
          onChangeStatus={handleTableStatusChange}
          onRefreshDeliverables={refreshDeliverablesFor}
          onDeliverableEdited={bumpDeliverablesRefresh}
          showDashboardButton={!detailsPaneOpen}
          autoScrollProjectId={autoScrollProjectId}
          onAutoScrollComplete={() => setAutoScrollProjectId(null)}
        />
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
              onProjectRefetch={refetchProjects}
              onDeleteProject={handleDeleteProject}
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
                  await assignmentsApi.update(assignmentId, { roleOnProjectId: roleId });
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
                  await assignmentsApi.update(assignmentId, { weeklyHours: updatedWeeklyHours });
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
              candidatesOnly={candidatesOnly}
              setCandidatesOnly={setCandidatesOnly}
              availabilityMap={availabilityMap}
              deliverablesSlot={
                <Suspense fallback={<DeliverablesSectionLoaderComp />}>
                  <DeliverablesSection
                    project={selectedProject}
                    variant="embedded"
                    refreshToken={deliverablesRefreshTick}
                    onDeliverablesChanged={() => {
                      try { if (selectedProject?.id) refreshDeliverablesFor(selectedProject.id); } catch {}
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
  );

  const mobileLayout = (
    <div className="min-h-0 flex flex-col bg-[var(--bg)]">
      <div className="p-3 border-b border-[var(--border)] bg-[var(--surface)] flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Projects</h1>
          <p className="text-xs text-[var(--muted)]">{sortedProjects.length} results</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 rounded-full border border-[var(--border)] text-xs text-[var(--text)]"
            onClick={() => setMobileFiltersOpen(true)}
          >
            Filters
          </button>
          <Link to="/projects/new">
            <button className="px-3 py-1 rounded-full border border-[var(--border)] text-xs text-[var(--text)]">
              + New
            </button>
          </Link>
        </div>
      </div>
      {error && (<ErrorBanner message={error} />)}
      {warnings.length > 0 && (<WarningsBanner warnings={warnings} />)}
      <ProjectsTable
        projects={sortedProjects}
        selectedProjectId={selectedProject?.id ?? null}
        onSelect={handleResponsiveProjectClick}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSort={onSort}
        loading={loading}
        nextDeliverables={nextDeliverablesMap}
        prevDeliverables={prevDeliverablesMap}
        projectLeads={projectLeadsMap}
        onChangeStatus={handleTableStatusChange}
        onRefreshDeliverables={refreshDeliverablesFor}
        onDeliverableEdited={bumpDeliverablesRefresh}
        isMobileList
        autoScrollProjectId={autoScrollProjectId}
        onAutoScrollComplete={() => setAutoScrollProjectId(null)}
      />
    </div>
  );

  return (
    <Layout>
      {isMobileLayout ? mobileLayout : desktopLayout}
      <MobileFiltersSheet open={isMobileLayout && mobileFiltersOpen} title="Project Filters" onClose={() => setMobileFiltersOpen(false)}>
        <FiltersBar
          statusOptions={statusOptions}
          selectedStatusFilters={selectedStatusFilters}
          onToggleStatus={toggleStatusFilter}
          searchTerm={searchTerm}
          onSearchTerm={setSearchTerm}
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
              setSearchTerm('');
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
            onProjectRefetch={refetchProjects}
            onDeleteProject={handleDeleteProject}
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
                await assignmentsApi.update(assignmentId, { roleOnProjectId: roleId });
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
                await assignmentsApi.update(assignmentId, { weeklyHours: updatedWeeklyHours });
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
            candidatesOnly={candidatesOnly}
            setCandidatesOnly={setCandidatesOnly}
            availabilityMap={availabilityMap}
            deliverablesSlot={
              <Suspense fallback={<DeliverablesSectionLoaderComp />}>
                <DeliverablesSection
                  project={selectedProject}
                  variant="embedded"
                  onDeliverablesChanged={() => {
                    try { if (selectedProject?.id) refreshDeliverablesFor(selectedProject.id); } catch {}
                  }}
                />
              </Suspense>
            }
          />
        ) : (
          <div className="p-4 text-sm text-[var(--muted)]">Select a project to view details</div>
        )}
      </MobileDetailsDrawer>
    </Layout>
  );
};

export default ProjectsList;

// VirtualizedProjectsList moved to list/components/ProjectsTable

const MobileFiltersSheet: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({ open, title, onClose, children }) => {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1100] bg-black/60 flex items-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full bg-[var(--surface)] text-[var(--text)] rounded-t-2xl p-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold">{title}</div>
          <button type="button" className="text-xl text-[var(--muted)]" onClick={onClose} aria-label="Close filters">
            ×
          </button>
        </div>
        <div className="pt-3">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const MobileDetailsDrawer: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({ open, title, onClose, children }) => {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1150] bg-black/60 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md h-full bg-[var(--surface)] text-[var(--text)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold truncate">{title}</div>
          <button type="button" className="text-xl text-[var(--muted)]" onClick={onClose} aria-label="Close details">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
};
