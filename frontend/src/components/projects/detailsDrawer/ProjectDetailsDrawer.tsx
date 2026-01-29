import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Assignment, Person, Project, Department } from '@/types/models';
import { useProject, useDeleteProject } from '@/hooks/useProjects';
import { usePeople } from '@/hooks/usePeople';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useDepartmentFilter } from '@/hooks/useDepartmentFilter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';
import { useProjectAssignments } from '@/pages/Projects/list/hooks/useProjectAssignments';
import { useAssignmentInlineEdit } from '@/pages/Projects/list/hooks/useAssignmentInlineEdit';
import { useProjectAssignmentAdd } from '@/pages/Projects/list/hooks/useProjectAssignmentAdd';
import { usePersonSearch } from '@/pages/Projects/list/hooks/usePersonSearch';
import { useProjectAvailability } from '@/pages/Projects/list/hooks/useProjectAvailability';
import ProjectDetailsPanel from '@/pages/Projects/list/components/ProjectDetailsPanel';
import DeliverablesSectionLoader from '@/pages/Projects/list/components/DeliverablesSectionLoader';
import DeliverablesSection from '@/components/deliverables/DeliverablesSection';
import { assignmentsApi, departmentsApi } from '@/services/api';
import { updateAssignment, deleteAssignment } from '@/lib/mutations/assignments';
import { useUpdateProjectStatus } from '@/hooks/useUpdateProjectStatus';

type Props = {
  open: boolean;
  projectId: number | null;
  onClose: () => void;
};

const ProjectDetailsDrawer: React.FC<Props> = ({ open, projectId, onClose }) => {
  if (!open || !projectId || typeof document === 'undefined') return null;
  return <ProjectDetailsDrawerContent open={open} projectId={projectId} onClose={onClose} />;
};

const ProjectDetailsDrawerContent: React.FC<Props> = ({ open, projectId, onClose }) => {
  const enabled = open && !!projectId;
  const { state: deptState } = useDepartmentFilter();
  const { project, loading, error: projectError } = useProject(projectId ?? 0);
  const { people } = usePeople();
  const caps = useCapabilities();
  const queryClient = useQueryClient();
  const deleteProjectMutation = useDeleteProject();
  const { updateStatus } = useUpdateProjectStatus();

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [showAddAssignment, setShowAddAssignment] = useState(false);
  const [candidatesOnly, setCandidatesOnly] = useState<boolean>(true);
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    if (project) setSelectedProject(project as Project);
  }, [project]);

  useEffect(() => {
    setStatusDropdownOpen(false);
  }, [selectedProject?.id]);

  useEffect(() => {
    if (!open) {
      setSelectedProject(null);
      setShowAddAssignment(false);
      setPanelError(null);
    }
  }, [open]);

  const invalidateFilterMeta = useCallback(async () => {
    try { await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY }); } catch {}
  }, [queryClient]);

  const refetchProject = useCallback(async () => {
    if (!selectedProject?.id) return;
    try { await queryClient.invalidateQueries({ queryKey: ['projects', selectedProject.id] }); } catch {}
  }, [queryClient, selectedProject?.id]);

  const { assignments, availableRoles, reload: reloadAssignments } = useProjectAssignments({
    projectId: selectedProject?.id,
    people,
  });

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

  const {
    editingAssignment,
    editData,
    warnings: editWarnings,
    setEditData,
    getCurrentWeekHours,
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

  const currentWeekKey = useMemo(() => getCurrentWeekKey(), [getCurrentWeekKey]);

  const checkAssignmentConflicts = useCallback(async (
    personId: number,
    projId: number,
    weekKey: string,
    newHours: number
  ): Promise<string[]> => {
    try {
      const conflictResponse = await assignmentsApi.checkConflicts(personId, projId, weekKey, newHours);
      return conflictResponse.warnings;
    } catch (err) {
      console.error('Failed to check assignment conflicts:', err);
      return [];
    }
  }, []);

  const {
    state: newAssignment,
    setState: setNewAssignment,
    save: saveAddAssignment,
    cancel: cancelAddAssignment,
    warnings: addWarnings,
  } = useProjectAssignmentAdd({
    projectId: selectedProject?.id ?? null,
    invalidateFilterMeta,
    reloadAssignments,
    checkAssignmentConflicts,
  });

  const { availabilityMap } = useProjectAvailability({
    projectId: selectedProject?.id,
    departmentId: deptState?.selectedDepartmentId != null ? Number(deptState.selectedDepartmentId) : undefined,
    includeChildren: deptState?.includeChildren,
    candidatesOnly,
  });
  const { data: departments = [] } = useQuery<Department[], Error>({
    queryKey: ['departmentsAll'],
    queryFn: () => departmentsApi.listAll(),
    staleTime: 60_000,
  });

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
      weeklyHours: {},
    });
  };

  const handleSaveAssignment = async () => {
    try {
      await saveAddAssignment();
      setShowAddAssignment(false);
    } catch {
      setPanelError('Failed to create assignment');
    }
  };

  const handleCancelAddAssignment = () => {
    cancelAddAssignment();
    setShowAddAssignment(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedProject?.id) return;
    const prev = selectedProject;
    try {
      setSelectedProject({ ...prev, status: newStatus } as Project);
      setStatusDropdownOpen(false);
      await updateStatus(prev.id!, newStatus);
    } catch (err) {
      setSelectedProject(prev);
      setPanelError('Failed to update project status');
    }
  };

  const handleDeleteProject = useCallback(async (id: number) => {
    try {
      await deleteProjectMutation.mutateAsync(id);
      setSelectedProject(null);
      setStatusDropdownOpen(false);
      onClose();
    } catch (err) {
      console.error('Failed to delete project', err);
      setPanelError('Failed to delete project');
    }
  }, [deleteProjectMutation, onClose]);

  const handleDeleteAssignment = useCallback(async (assignmentId: number) => {
    if (!confirm('Are you sure you want to remove this assignment?')) return;
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
      setPanelError('Failed to delete assignment');
    }
  }, [assignments, selectedProject?.id, reloadAssignments, invalidateFilterMeta]);

  const handleChangeAssignmentRole = useCallback(async (assignmentId: number, roleId: number | null, roleName: string | null) => {
    try {
      await updateAssignment(assignmentId, { roleOnProjectId: roleId }, assignmentsApi);
      if (selectedProject?.id) await reloadAssignments(selectedProject.id);
      await invalidateFilterMeta();
    } catch (e) {
      console.error('Failed to update role on project', e);
    }
  }, [selectedProject?.id, reloadAssignments, invalidateFilterMeta]);

  const handleUpdateWeekHours = useCallback(async (assignmentId: number, weekKey: string, hours: number) => {
    try {
      const asn = assignments.find(a => a.id === assignmentId);
      if (!asn) return;
      const updatedWeeklyHours = { ...(asn.weeklyHours || {}) } as Record<string, number>;
      updatedWeeklyHours[weekKey] = hours;
      await updateAssignment(assignmentId, { weeklyHours: updatedWeeklyHours }, assignmentsApi);
    } catch (e) {
      console.error('Failed to update hours', e);
    }
  }, [assignments]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] bg-black/60 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl h-full bg-[var(--surface)] text-[var(--text)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold truncate">Project Details</div>
          <button type="button" className="text-xl text-[var(--muted)]" onClick={onClose} aria-label="Close project details">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {selectedProject ? (
            <ProjectDetailsPanel
              project={selectedProject}
              statusDropdownOpen={statusDropdownOpen}
              setStatusDropdownOpen={setStatusDropdownOpen}
              onStatusChange={handleStatusChange}
              onProjectRefetch={refetchProject}
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
              onChangeAssignmentRole={handleChangeAssignmentRole}
              onUpdateWeekHours={handleUpdateWeekHours}
              reloadAssignments={reloadAssignments}
              invalidateFilterMeta={invalidateFilterMeta}
              getPersonDepartmentId={(personId) => {
                const p = people.find(pp => pp.id === personId);
                return (p?.department ?? null) as any;
              }}
              getPersonDepartmentName={(personId) => {
                const p = people.find(pp => pp.id === personId);
                return (p as any)?.departmentName ?? null;
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
                } catch (e) {
                  console.error('Failed to replace placeholder', e);
                }
              }}
              candidatesOnly={candidatesOnly}
              setCandidatesOnly={setCandidatesOnly}
              availabilityMap={availabilityMap}
              deliverablesSlot={
                <Suspense fallback={<DeliverablesSectionLoader />}>
                  <DeliverablesSection
                    project={selectedProject}
                    variant="embedded"
                    onDeliverablesChanged={() => {
                      try { if (selectedProject?.id) invalidateFilterMeta(); } catch {}
                    }}
                  />
                </Suspense>
              }
            />
          ) : (
            <div className="p-6 text-[var(--muted)]">
              {loading ? 'Loading project...' : (panelError || projectError || 'Project not found')}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProjectDetailsDrawer;
