import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import { Link } from 'react-router';
import { Project, Person, Assignment } from '@/types/models';
import { useProjects, useDeleteProject, useUpdateProject } from '@/hooks/useProjects';
import { usePeople } from '@/hooks/usePeople';
import { assignmentsApi } from '@/services/api';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useProjectFilterMetadata } from '@/hooks/useProjectFilterMetadata';
import type { ProjectFilterMetadataResponse } from '@/types/models';
import { trackPerformanceEvent } from '@/utils/monitoring';

// PersonWithAvailability interface moved into usePersonSearch hook
import Layout from '@/components/layout/Layout';
import ProjectsSkeleton from '@/components/skeletons/ProjectsSkeleton';
import StatusBadge, { getStatusColor, formatStatus, editableStatusOptions, statusOptions } from '@/components/projects/StatusBadge';
import Skeleton from '@/components/ui/Skeleton';
import DeliverablesSectionLoaderComp from '@/pages/Projects/list/components/DeliverablesSectionLoader';
import FiltersBar from '@/pages/Projects/list/components/FiltersBar';
import ProjectsTable from '@/pages/Projects/list/components/ProjectsTable';
import ProjectDetailsPanel from '@/pages/Projects/list/components/ProjectDetailsPanel';
import WarningsBanner from '@/pages/Projects/list/components/WarningsBanner';
import ErrorBanner from '@/pages/Projects/list/components/ErrorBanner';
import { useProjectFilters } from '@/pages/Projects/list/hooks/useProjectFilters';
import { useProjectSelection } from '@/pages/Projects/list/hooks/useProjectSelection';
import { useAssignmentInlineEdit } from '@/pages/Projects/list/hooks/useAssignmentInlineEdit';
import { useRoleSearch } from '@/pages/Projects/list/hooks/useRoleSearch';
import { useProjectAssignments } from '@/pages/Projects/list/hooks/useProjectAssignments';
import { useProjectAvailability } from '@/pages/Projects/list/hooks/useProjectAvailability';
import { usePersonSearch } from '@/pages/Projects/list/hooks/usePersonSearch';
import { useProjectAssignmentAdd } from '@/pages/Projects/list/hooks/useProjectAssignmentAdd';
import { useProjectStatusMutation } from '@/pages/Projects/list/hooks/useProjectStatusMutation';

// Lazy load DeliverablesSection for better initial page performance
const DeliverablesSection = React.lazy(() => import('@/components/deliverables/DeliverablesSection'));

// DeliverablesSection fallback moved to list/components/DeliverablesSectionLoader

// Memoized Assignment Row Component for performance (Phase 4 optimization)
// Local memoized components moved to list/components

const ProjectsList: React.FC = () => {
  // React Query hooks for data management
  const { projects, loading, error: projectsError } = useProjects();
  const { people, peopleVersion } = usePeople();
  const deleteProjectMutation = useDeleteProject();
  const updateProjectMutation = useUpdateProject();

  // Local UI state
  const [error, setError] = useState<string | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  // Optimized filter metadata (assignment counts + hasFutureDeliverables)
  const { filterMetadata, loading: filterMetaLoading, error: filterMetaError, invalidate: invalidateFilterMeta, refetch: refetchFilterMeta } = useProjectFilterMetadata();
  // Derived filters/sort/search via hook
  const {
    selectedStatusFilters,
    sortBy,
    sortDirection,
    searchTerm,
    setSearchTerm,
    toggleStatusFilter,
    onSort,
    formatFilterStatus,
    filteredProjects,
    sortedProjects,
  } = useProjectFilters(projects, filterMetadata);

  // Selection (single source of truth)
  const { selectedProject, setSelectedProject, selectedIndex, setSelectedIndex, handleProjectClick } = useProjectSelection(sortedProjects);

  // Assignments + available roles
  const { assignments, availableRoles, reload: reloadAssignments } = useProjectAssignments({ projectId: selectedProject?.id, people });

  const [showAddAssignment, setShowAddAssignment] = useState(false);

  // Pre-computed skills mapping for performance
  const [personSkillsMap, setPersonSkillsMap] = useState<Map<number, string[]>>(new Map());

  // New assignment role search
  const { roleSearchResults: roleSearchResultsNew, setRoleSearchResults: setRoleSearchResultsNew, handleNewAssignmentRoleSearch, handleNewAssignmentRoleSelect } = useRoleSearch(
    availableRoles,
    (person: Person | null) => getSkillBasedRoleSuggestions(person)
  );
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
  const { state: deptState } = useDepartmentFilter();
  const caps = useCapabilities();
  const { availabilityMap } = useProjectAvailability({
    projectId: selectedProject?.id,
    departmentId: deptState?.selectedDepartmentId != null ? Number(deptState.selectedDepartmentId) : undefined,
    includeChildren: deptState?.includeChildren,
    candidatesOnly,
  });

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
    roleSearchResults,
    warnings: editWarnings,
    setEditData,
    getCurrentWeekHours: getCurrentWeekHoursFromHook,
    handleEditAssignment,
    handleRoleSearch,
    handleRoleSelect,
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
      roleOnProject: '',
      roleSearch: '',
      weeklyHours: {}
    });
    setRoleSearchResultsNew([]);
  };

  const getCurrentWeekHours = (assignment: Assignment): number => getCurrentWeekHoursFromHook(assignment);

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
    updateProjectMutation,
    invalidateFilterMeta,
    setSelectedProject,
    setStatusDropdownOpen,
    setError,
  });

  const handleSort = onSort;

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

  if (loading) {
    return (
      <Layout>
        <ProjectsSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-full min-h-0 flex bg-[var(--bg)]">
        {/* Left Panel - Projects List */}
        <div className="w-1/2 border-r border-[var(--border)] flex flex-col min-w-0 min-h-0 overflow-y-auto">
          {/* Header */}
          <div className="p-3 border-b border-[var(--border)]">
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-lg font-semibold text-[var(--text)]">Projects</h1>
              <Link to="/projects/new">
                <button className="px-2 py-0.5 text-xs rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] transition-colors">
                  + New
                </button>
              </Link>
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
              onRetryFilterMeta={() => refetchFilterMeta()}
            />
          </div>

          {/* Error Message */}
          {error && (<ErrorBanner message={error} />)}

          {/* Warnings */}
          {warnings.length > 0 && (<WarningsBanner warnings={warnings} />)}

          {/* Projects Table */}
          <ProjectsTable
            projects={sortedProjects}
            selectedProjectId={selectedProject?.id ?? null}
            onSelect={handleProjectClick}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={onSort}
            loading={loading}
          />
        </div>

        {/* Right Panel - Project Details */}
        <div className="w-1/2 flex flex-col bg-[var(--surface)] min-w-0 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              <Skeleton rows={6} className="h-5" />
            </div>
          ) : selectedProject ? (
            <ProjectDetailsPanel
              project={selectedProject}
              statusDropdownOpen={statusDropdownOpen}
              setStatusDropdownOpen={setStatusDropdownOpen}
              onStatusChange={handleStatusChange}
              assignments={assignments}
              editingAssignmentId={editingAssignment}
              editData={editData}
              roleSearchResults={roleSearchResults}
              warnings={warnings}
              onEditAssignment={handleEditAssignment}
              onDeleteAssignment={handleDeleteAssignment}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onRoleSearch={(term) => handleRoleSearch(term)}
              onRoleSelect={(role) => handleRoleSelect(role)}
              onHoursChange={(h) => setEditData((prev) => ({ ...prev, currentWeekHours: h }))}
              getCurrentWeekHours={getCurrentWeekHours}
              onChangeAssignmentRole={async (assignmentId, roleId, roleName) => {
                try {
                  await assignmentsApi.update(assignmentId, { roleOnProjectId: roleId });
                  if (selectedProject?.id) await reloadAssignments(selectedProject.id);
                  await invalidateFilterMeta();
                } catch (e) {
                  console.error('Failed to update role on project', e);
                }
              }}
              getPersonDepartmentId={(personId) => {
                const p = people.find(pp => pp.id === personId);
                return (p?.department ?? null) as any;
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
              roleSearchResultsNew={roleSearchResultsNew}
              onRoleSearchNew={(term) => handleNewAssignmentRoleSearch(term, newAssignment.selectedPerson, (role) => setNewAssignment(prev => ({ ...prev, roleSearch: role, roleOnProject: role })))}
              onRoleSelectNew={(role) => handleNewAssignmentRoleSelect(role, (r) => setNewAssignment(prev => ({ ...prev, roleSearch: r, roleOnProject: r })))}
              candidatesOnly={candidatesOnly}
              setCandidatesOnly={setCandidatesOnly}
              availabilityMap={availabilityMap}
              deliverablesSlot={
                <Suspense fallback={<DeliverablesSectionLoaderComp />}>
                  <DeliverablesSection project={selectedProject} />
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
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ProjectsList;

// VirtualizedProjectsList moved to list/components/ProjectsTable



