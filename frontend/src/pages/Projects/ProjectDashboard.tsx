import React, { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import { useProject } from '@/hooks/useProjects';
import { assignmentsApi, departmentsApi, projectRisksApi } from '@/services/api';
import { formatUtcToLocal } from '@/utils/dates';
import StatusBadge from '@/components/projects/StatusBadge';
import DeliverablesSection, { type DeliverablesSectionHandle } from '@/components/deliverables/DeliverablesSection';
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor';
import { useAuth } from '@/hooks/useAuth';
import { usePeopleAutocomplete } from '@/hooks/usePeople';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import RoleDropdown from '@/roles/components/RoleDropdown';
import { listProjectRoles } from '@/roles/api';
import { sortAssignmentsByProjectRole } from '@/roles/utils/sortByProjectRole';
import type { Department, Person, Project, ProjectRisk } from '@/types/models';

const ProjectDashboard: React.FC = () => {
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const queryId = searchParams.get('projectId');
  const idValue = params.id ?? queryId ?? '';
  const projectId = Number(idValue);
  const hasValidId = Number.isFinite(projectId) && projectId > 0;

  const auth = useAuth();
  const queryClient = useQueryClient();
  const { project, loading: projectLoading, error: projectError } = useProject(hasValidId ? projectId : 0);

  const assignmentsQuery = useQuery({
    queryKey: ['project-dashboard', 'assignments', projectId],
    queryFn: () => assignmentsApi.list({ project: projectId, page_size: 200 }),
    enabled: hasValidId,
    staleTime: 30_000,
  });
  const assignments = assignmentsQuery.data?.results ?? [];
  const assignmentsTotal = assignmentsQuery.data?.count ?? assignments.length;
  const hasMoreAssignments = !!assignmentsQuery.data?.next;
  const departmentsQuery = useQuery({
    queryKey: ['project-dashboard', 'departments'],
    queryFn: () => departmentsApi.listAll(),
    enabled: hasValidId,
    staleTime: 5 * 60_000,
  });
  const risksQuery = useQuery({
    queryKey: ['project-risks', projectId],
    queryFn: () => projectRisksApi.list(projectId),
    enabled: hasValidId,
    staleTime: 30_000,
  });
  const departmentIds = useMemo(() => {
    const ids = new Set<number>();
    assignments.forEach((assignment) => {
      const deptId = assignment.personDepartmentId;
      if (typeof deptId === 'number' && deptId > 0) ids.add(deptId);
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [assignments]);
  const rolesByDeptQuery = useQuery({
    queryKey: ['project-dashboard', 'project-roles', departmentIds.join(',')],
    queryFn: async () => {
      const entries = await Promise.all(
        departmentIds.map(async (deptId) => {
          try {
            const roles = await listProjectRoles(deptId);
            return [deptId, roles] as const;
          } catch {
            return [deptId, []] as const;
          }
        })
      );
      return Object.fromEntries(entries);
    },
    enabled: hasValidId && departmentIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const formattedStartDate = project?.startDate
    ? (formatUtcToLocal(project.startDate, { dateStyle: 'medium' }) || project.startDate)
    : '-';
  const formattedEndDate = project?.endDate
    ? (formatUtcToLocal(project.endDate, { dateStyle: 'medium' }) || project.endDate)
    : '-';
  const [showAddAssignment, setShowAddAssignment] = React.useState(false);
  const [personSearch, setPersonSearch] = React.useState('');
  const [selectedPerson, setSelectedPerson] = React.useState<Person | null>(null);
  const [roleOpen, setRoleOpen] = React.useState(false);
  const [roleSelection, setRoleSelection] = React.useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const roleButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const { people: peopleResults } = usePeopleAutocomplete(personSearch);
  const { data: projectRoles = [] } = useProjectRoles(selectedPerson?.department ?? null);
  const [personDropdownOpen, setPersonDropdownOpen] = React.useState(false);
  const personBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [savingAssignment, setSavingAssignment] = React.useState(false);
  const [deletingAssignmentId, setDeletingAssignmentId] = React.useState<number | null>(null);
  const deliverablesRef = React.useRef<DeliverablesSectionHandle | null>(null);
  const [showAddRisk, setShowAddRisk] = React.useState(false);
  const [riskDescription, setRiskDescription] = React.useState('');
  const [riskDepartments, setRiskDepartments] = React.useState<number[]>([]);
  const [riskFile, setRiskFile] = React.useState<File | null>(null);
  const [editingRiskId, setEditingRiskId] = React.useState<number | null>(null);
  const [riskEditDescription, setRiskEditDescription] = React.useState('');
  const [riskEditDepartments, setRiskEditDepartments] = React.useState<number[]>([]);
  const [riskEditFile, setRiskEditFile] = React.useState<File | null>(null);
  const [savingRisk, setSavingRisk] = React.useState(false);
  const [deletingRiskId, setDeletingRiskId] = React.useState<number | null>(null);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (personBoxRef.current && !personBoxRef.current.contains(target)) {
        setPersonDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);
  const assignmentsCountLabel = assignmentsQuery.isLoading ? '-' : String(assignmentsTotal);
  const departmentNameById = useMemo(() => {
    const map = new Map<number, string>();
    (departmentsQuery.data ?? []).forEach((dept: Department) => {
      if (dept.id != null) map.set(dept.id, dept.name);
    });
    return map;
  }, [departmentsQuery.data]);
  const assignmentGroups = useMemo(() => {
    const groups = new Map<string, typeof assignments>();
    assignments.forEach((assignment) => {
      const deptId = assignment.personDepartmentId ?? null;
      const deptName = deptId != null ? (departmentNameById.get(deptId) || `Dept #${deptId}`) : 'Unassigned';
      if (!groups.has(deptName)) groups.set(deptName, []);
      groups.get(deptName)!.push(assignment);
    });
    const rolesByDept = rolesByDeptQuery.data ?? {};
    const entries = Array.from(groups.entries()).map(([name, items]) => {
      const sorted = sortAssignmentsByProjectRole(items, rolesByDept);
      return { name, items: sorted };
    });
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, departmentNameById, rolesByDeptQuery.data]);

  const resetAddAssignment = () => {
    setPersonSearch('');
    setSelectedPerson(null);
    setRoleSelection({ id: null, name: null });
    setRoleOpen(false);
    setPersonDropdownOpen(false);
  };

  const handleSelectPerson = (person: Person) => {
    setSelectedPerson(person);
    setPersonSearch(person.name);
    setPersonDropdownOpen(false);
    setRoleSelection({ id: null, name: null });
  };

  const handleSaveAssignment = async () => {
    if (!projectId || !selectedPerson?.id || savingAssignment) return;
    try {
      setSavingAssignment(true);
      await assignmentsApi.create({
        person: selectedPerson.id,
        project: projectId,
        roleOnProjectId: roleSelection.id ?? null,
        weeklyHours: {},
        startDate: new Date().toISOString().slice(0, 10),
      } as any);
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'assignments', projectId] });
      resetAddAssignment();
      setShowAddAssignment(false);
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: number) => {
    if (deletingAssignmentId) return;
    const ok = window.confirm('Remove this assignment?');
    if (!ok) return;
    try {
      setDeletingAssignmentId(assignmentId);
      await assignmentsApi.delete(assignmentId);
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'assignments', projectId] });
    } finally {
      setDeletingAssignmentId(null);
    }
  };

  const risks = (risksQuery.data?.results || []) as ProjectRisk[];

  const toggleDepartment = (deptId: number, current: number[], setNext: (v: number[]) => void) => {
    if (current.includes(deptId)) {
      setNext(current.filter((id) => id !== deptId));
    } else {
      setNext([...current, deptId]);
    }
  };

  const resetRiskForm = () => {
    setRiskDescription('');
    setRiskDepartments([]);
    setRiskFile(null);
  };

  const resetRiskEdit = () => {
    setEditingRiskId(null);
    setRiskEditDescription('');
    setRiskEditDepartments([]);
    setRiskEditFile(null);
  };

  const handleAddRisk = async () => {
    if (!projectId || savingRisk || !riskDescription.trim()) return;
    try {
      setSavingRisk(true);
      const formData = new FormData();
      formData.append('description', riskDescription.trim());
      formData.append('departments', JSON.stringify(riskDepartments));
      if (riskFile) formData.append('attachment', riskFile);
      await projectRisksApi.create(projectId, formData);
      await queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
      resetRiskForm();
      setShowAddRisk(false);
    } finally {
      setSavingRisk(false);
    }
  };

  const handleEditRisk = (risk: ProjectRisk) => {
    setEditingRiskId(risk.id ?? null);
    setRiskEditDescription(risk.description || '');
    setRiskEditDepartments(risk.departments ? [...risk.departments] : []);
    setRiskEditFile(null);
  };

  const handleUpdateRisk = async (riskId: number) => {
    if (!projectId || savingRisk) return;
    try {
      setSavingRisk(true);
      const formData = new FormData();
      formData.append('description', riskEditDescription.trim());
      formData.append('departments', JSON.stringify(riskEditDepartments));
      if (riskEditFile) formData.append('attachment', riskEditFile);
      await projectRisksApi.update(projectId, riskId, formData);
      await queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
      resetRiskEdit();
    } finally {
      setSavingRisk(false);
    }
  };

  const handleDeleteRisk = async (riskId: number) => {
    if (!projectId || deletingRiskId) return;
    const ok = window.confirm('Delete this risk?');
    if (!ok) return;
    try {
      setDeletingRiskId(riskId);
      await projectRisksApi.delete(projectId, riskId);
      await queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
    } finally {
      setDeletingRiskId(null);
    }
  };

  const handleDownloadAttachment = async (risk: ProjectRisk) => {
    if (!projectId || !risk.id) return;
    const blob = await projectRisksApi.downloadAttachment(projectId, risk.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = (risk.attachmentUrl?.split('/').pop() || 'attachment');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Project Dashboard</div>
            <h1 className="text-lg font-semibold text-[var(--text)] truncate">
              {project?.name || (hasValidId ? 'Project' : 'Select a project')}
            </h1>
          </div>
          <Link
            to={hasValidId ? `/projects?projectId=${projectId}` : '/projects'}
            className="inline-flex items-center text-xs text-[var(--muted)] hover:text-[var(--text)]"
          >
            Back to Projects
          </Link>
        </div>

        {!hasValidId ? (
          <Card>
            <div className="text-[var(--text)] font-medium mb-2">No project selected</div>
            <div className="text-sm text-[var(--muted)]">
              Open a project from the Projects list to view its dashboard.
            </div>
          </Card>
        ) : projectError ? (
          <Card>
            <div className="text-red-300 font-medium mb-2">Unable to load project</div>
            <div className="text-sm text-[var(--muted)]">{projectError}</div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-4 space-y-4">
              <Card className="p-3">
              {projectLoading ? (
                <div className="space-y-3">
                  <div className="h-4 bg-[var(--surfaceOverlay)] rounded w-2/3" />
                  <div className="h-4 bg-[var(--surfaceOverlay)] rounded w-1/2" />
                  <div className="h-4 bg-[var(--surfaceOverlay)] rounded w-3/5" />
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="relative flex items-center justify-center">
                    <div className="text-sm font-semibold text-[var(--text)] text-center">Project Info</div>
                    <div className="absolute right-0">
                      <StatusBadge status={project?.status || null} size="xs" />
                    </div>
                  </div>
                  <div className="border-t border-[#4a4f57]/60 mt-2" />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <div className="text-[11px] text-[var(--muted)]">Project Title</div>
                      <div className="text-[var(--text)]">{project?.name || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--muted)]">Project Number</div>
                      <div className="text-[var(--text)]">{project?.projectNumber || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--muted)]">Client</div>
                      <div className="text-[var(--text)]">{project?.client || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--muted)]">Client Start</div>
                      <div className="text-[var(--text)]">{formattedStartDate}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--muted)]">Target End</div>
                      <div className="text-[var(--text)]">{formattedEndDate}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-[var(--muted)]">Assignments</div>
                      <div className="text-[var(--text)]">{assignmentsCountLabel}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--muted)]">Description</div>
                    <div className="text-[var(--text)]">{project?.description || '-'}</div>
                  </div>
                </div>
              )}
              </Card>

              <Card className="p-3">
                <div className="relative flex items-center justify-center">
                  <div className="text-sm font-semibold text-[var(--text)] text-center">Deliverable Schedule</div>
                  <button
                    type="button"
                    onClick={() => deliverablesRef.current?.openAdd()}
                    className="absolute right-0 text-[11px] w-6 h-6 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)] flex items-center justify-center"
                    aria-label="Add deliverable"
                  >
                    +
                  </button>
                </div>
                <div className="border-t border-[#4a4f57]/60 mt-2 mb-2" />
                {project ? (
                  <DeliverablesSection
                    ref={deliverablesRef}
                    project={project as Project}
                    variant="embedded"
                    appearance="presentation"
                    showHeader={false}
                  />
                ) : null}
              </Card>
            </div>

            <Card className="p-3 xl:col-span-3">
              <div className="relative flex items-center justify-center mb-2">
                <div className="text-sm font-semibold text-[var(--text)] text-center">Assignments</div>
                <button
                  type="button"
                  onClick={() => setShowAddAssignment((prev) => !prev)}
                  className="absolute right-0 text-[11px] w-6 h-6 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)] flex items-center justify-center"
                  aria-label={showAddAssignment ? 'Close add assignment' : 'Add assignment'}
                >
                  {showAddAssignment ? '×' : '+'}
                </button>
              </div>
              {showAddAssignment && (
                <div className="mb-3 rounded border border-[var(--border)] bg-[var(--surfaceOverlay)]/40 p-2 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">New Assignment</div>
                  <div className="space-y-2">
                    <div className="relative" ref={personBoxRef}>
                      <input
                        type="text"
                        placeholder="Search people (min 2 chars)"
                        value={personSearch}
                        onChange={(e) => {
                          setPersonSearch(e.target.value);
                          setPersonDropdownOpen(true);
                          setSelectedPerson(null);
                        }}
                        onFocus={() => setPersonDropdownOpen(true)}
                        className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                      />
                      {personDropdownOpen && personSearch.trim().length >= 2 && peopleResults.length > 0 && (
                        <div className="absolute z-20 mt-1 left-0 right-0 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg max-h-40 overflow-auto">
                          {peopleResults.map((person) => (
                            <button
                              key={person.id}
                              type="button"
                              className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--surfaceHover)]"
                              onClick={() => handleSelectPerson(person)}
                            >
                              <div className="text-[var(--text)]">{person.name}</div>
                              <div className="text-[11px] text-[var(--muted)]">{person.roleName || 'Role not set'}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        ref={roleButtonRef}
                        type="button"
                        onClick={() => setRoleOpen((prev) => !prev)}
                        className="flex-1 text-left px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                        disabled={!selectedPerson}
                      >
                        {roleSelection.name || 'Select role (optional)'}
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAssignment}
                        disabled={!selectedPerson || savingAssignment}
                        className="text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--primary)] text-white disabled:opacity-50"
                      >
                        {savingAssignment ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                    {roleOpen && selectedPerson && (
                      <RoleDropdown
                        roles={projectRoles}
                        currentId={roleSelection.id}
                        onSelect={(id, name) => setRoleSelection({ id, name })}
                        onClose={() => setRoleOpen(false)}
                        anchorRef={roleButtonRef}
                      />
                    )}
                  </div>
                </div>
              )}
              {assignmentsQuery.isLoading ? (
                <div className="text-xs text-[var(--muted)]">Loading assignments...</div>
              ) : assignmentsQuery.isError ? (
                <div className="text-xs text-red-300">Failed to load assignments.</div>
              ) : assignments.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">No assignments yet.</div>
              ) : (
                <div className="space-y-2">
                  <div className="border-t border-[#4a4f57]/60 mx-2" />
                  {assignmentGroups.map((group, index) => (
                    <div key={group.name} className="rounded bg-transparent">
                      <div className="px-2 py-1 text-xs font-bold text-[var(--text)]">
                        {group.name}
                      </div>
                      <div className="px-2 pb-1.5">
                        <ul className="space-y-1">
                          {group.items.map((assignment) => {
                            const personId = Number.isFinite(assignment.person) ? assignment.person : null;
                            const personLabel = assignment.personName || (personId != null ? `Person #${personId}` : 'Unassigned');
                            const roleLabel = assignment.roleName || null;
                            return (
                              <li key={assignment.id} className="py-1.5 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 items-center pl-3">
                                <div className="min-w-0">
                                  <div className="text-xs text-[var(--text)] truncate">{personLabel}</div>
                                  {assignment.isActive === false ? (
                                    <div className="text-[11px] text-[var(--muted)]">Inactive</div>
                                  ) : null}
                                </div>
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <div className="text-[11px] text-[var(--muted)] truncate">{roleLabel || 'Role not set'}</div>
                                  {assignment.id && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAssignment(assignment.id!)}
                                      disabled={deletingAssignmentId === assignment.id}
                                      className="text-[11px] text-red-300 hover:text-red-200 disabled:opacity-50"
                                      aria-label="Remove assignment"
                                      title="Remove assignment"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      {index < assignmentGroups.length - 1 && (
                        <div className="border-t border-[#4a4f57]/60 mx-2 my-1" />
                      )}
                    </div>
                  ))}
                  {hasMoreAssignments && (
                    <div className="text-[11px] text-[var(--muted)]">Showing first 200 assignments.</div>
                  )}
                </div>
              )}
            </Card>

            <div className="xl:col-span-5">
              {project?.id ? (
                <ProjectNotesEditor
                  projectId={project.id}
                  initialJson={project.notesJson}
                  initialHtml={project.notes}
                  canEdit={!!auth?.accessToken}
                  compact
                />
              ) : null}
            </div>

            <Card className="p-3 xl:col-span-12">
              <div className="relative flex items-center justify-center mb-2">
                <div className="text-sm font-semibold text-[var(--text)] text-center">Risk Log</div>
                <button
                  type="button"
                  onClick={() => setShowAddRisk((prev) => !prev)}
                  className="absolute right-0 text-[11px] w-6 h-6 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)] flex items-center justify-center"
                  aria-label={showAddRisk ? 'Close add risk' : 'Add risk'}
                >
                  {showAddRisk ? '×' : '+'}
                </button>
              </div>
              <div className="border-t border-[#4a4f57]/60 mb-2" />

              {showAddRisk && (
                <div className="mb-3 rounded border border-[var(--border)] bg-[var(--surfaceOverlay)]/40 p-2 space-y-2">
                  <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">New Risk</div>
                  <div className="space-y-2">
                    <textarea
                      value={riskDescription}
                      onChange={(e) => setRiskDescription(e.target.value)}
                      placeholder="Describe the risk..."
                      className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                      rows={2}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="text-[11px] text-[var(--muted)]">Affected Departments</div>
                      <div className="flex flex-wrap gap-2">
                        {(departmentsQuery.data ?? []).map((dept) => (
                          <label key={dept.id} className="text-[11px] text-[var(--text)] flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={riskDepartments.includes(dept.id!)}
                              onChange={() => toggleDepartment(dept.id!, riskDepartments, setRiskDepartments)}
                              className="w-3 h-3"
                            />
                            {dept.name}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="file"
                        onChange={(e) => setRiskFile(e.target.files?.[0] || null)}
                        className="text-xs text-[var(--muted)]"
                      />
                      <button
                        type="button"
                        onClick={handleAddRisk}
                        disabled={!riskDescription.trim() || savingRisk}
                        className="text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--primary)] text-white disabled:opacity-50"
                      >
                        {savingRisk ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {risksQuery.isLoading ? (
                <div className="text-xs text-[var(--muted)]">Loading risks...</div>
              ) : risksQuery.isError ? (
                <div className="text-xs text-red-300">Failed to load risks.</div>
              ) : risks.length === 0 ? (
                <div className="text-xs text-[var(--muted)]">No risks logged yet.</div>
              ) : (
                <div className="space-y-2">
                  {risks.map((risk) => (
                    <div key={risk.id} className="rounded border border-[var(--border)] bg-[var(--surfaceOverlay)]/20 p-2">
                      {editingRiskId === risk.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={riskEditDescription}
                            onChange={(e) => setRiskEditDescription(e.target.value)}
                            className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)]"
                            rows={2}
                          />
                          <div className="flex flex-wrap gap-2">
                            {(departmentsQuery.data ?? []).map((dept) => (
                              <label key={dept.id} className="text-[11px] text-[var(--text)] flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={riskEditDepartments.includes(dept.id!)}
                                  onChange={() => toggleDepartment(dept.id!, riskEditDepartments, setRiskEditDepartments)}
                                  className="w-3 h-3"
                                />
                                {dept.name}
                              </label>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="file"
                              onChange={(e) => setRiskEditFile(e.target.files?.[0] || null)}
                              className="text-xs text-[var(--muted)]"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => risk.id && handleUpdateRisk(risk.id)}
                                disabled={!riskEditDescription.trim() || savingRisk}
                                className="text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--primary)] text-white disabled:opacity-50"
                              >
                                {savingRisk ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={resetRiskEdit}
                                className="text-[11px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-xs text-[var(--text)]">{risk.description}</div>
                            <div className="flex items-center gap-2">
                              {risk.attachmentUrl && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadAttachment(risk)}
                                  className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
                                >
                                  Download
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleEditRisk(risk)}
                                className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => risk.id && handleDeleteRisk(risk.id)}
                                disabled={deletingRiskId === risk.id}
                                className="text-[11px] text-red-300 hover:text-red-200 disabled:opacity-50"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                          <div className="text-[11px] text-[var(--muted)]">
                            {(risk.departmentNames || []).join(', ') || 'No departments'}
                          </div>
                          <div className="text-[11px] text-[var(--muted)]">
                            {risk.createdByName || 'Unknown'} · {formatUtcToLocal(risk.createdAt)}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ProjectDashboard;
