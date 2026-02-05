import React, { useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import { useProject } from '@/hooks/useProjects';
import { assignmentsApi, departmentsApi, projectRisksApi, projectsApi, deliverableTasksApi, deliverableQaTasksApi, peopleApi } from '@/services/api';
import { fetchProjectStaffingTimeline } from '@/services/experienceApi';
import { createAssignment, deleteAssignment, updateAssignment } from '@/lib/mutations/assignments';
import { formatUtcToLocal } from '@/utils/dates';
import StatusBadge from '@/components/projects/StatusBadge';
import DeliverablesSection, { type DeliverablesSectionHandle } from '@/components/deliverables/DeliverablesSection';
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor';
import { useAuth } from '@/hooks/useAuth';
import { usePeopleAutocomplete } from '@/hooks/usePeople';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import RoleDropdown from '@/roles/components/RoleDropdown';
import { listProjectRoles, type ProjectRole } from '@/roles/api';
import { sortAssignmentsByProjectRole } from '@/roles/utils/sortByProjectRole';
import { subscribeDeliverablesRefresh } from '@/lib/deliverablesRefreshBus';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';
import PlaceholderPersonSwap from '@/components/assignments/PlaceholderPersonSwap';
import TooltipPortal from '@/components/ui/TooltipPortal';
import type { Assignment, Department, Person, Project, ProjectRisk, DeliverableTask, DeliverableQATask, DeliverableTaskCompletionStatus, DeliverableTaskQaStatus } from '@/types/models';

type AssignmentListItem = Assignment & { isHistorical?: boolean };
type ProjectChangeLogEntry = {
  id: number;
  action: string;
  detail?: any;
  createdAt: string;
  actor?: { id?: number; username?: string; email?: string } | null;
  actorName?: string | null;
};

const ProjectDashboard: React.FC = () => {
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const queryId = searchParams.get('projectId');
  const idValue = params.id ?? queryId ?? '';
  const projectId = Number(idValue);
  const hasValidId = Number.isFinite(projectId) && projectId > 0;
  React.useEffect(() => {
    if (!hasValidId) return;
    try {
      sessionStorage.setItem('projects.lastViewedProjectId', String(projectId));
      sessionStorage.setItem('projects.lastViewedProjectIdAt', String(Date.now()));
    } catch {}
  }, [hasValidId, projectId]);

  const auth = useAuth();
  const queryClient = useQueryClient();
  const { project, loading: projectLoading, error: projectError } = useProject(hasValidId ? projectId : 0);

  const assignmentsQuery = useQuery({
    queryKey: ['project-dashboard', 'assignments', projectId],
    queryFn: () => assignmentsApi.list({ project: projectId, page_size: 200, include_placeholders: 1 }),
    enabled: hasValidId,
    staleTime: 30_000,
  });
  const staffingTimelineQuery = useQuery({
    queryKey: ['project-dashboard', 'staffing-timeline', projectId],
    queryFn: () => fetchProjectStaffingTimeline({ projectId }),
    enabled: hasValidId,
    staleTime: 5 * 60_000,
  });
  const deliverableTasksQuery = useQuery({
    queryKey: ['project-dashboard', 'deliverable-tasks', projectId],
    queryFn: () => projectsApi.deliverableTasks(projectId),
    enabled: hasValidId,
    staleTime: 30_000,
  });
  const qaTasksQuery = useQuery({
    queryKey: ['project-dashboard', 'qa-tasks', projectId],
    queryFn: () => projectsApi.qaTasks(projectId),
    enabled: hasValidId,
    staleTime: 30_000,
  });
  const assignments = assignmentsQuery.data?.results ?? [];
  const staffingTimeline = staffingTimelineQuery.data;
  const deliverableTasks = deliverableTasksQuery.data ?? [];
  const qaTasks = qaTasksQuery.data ?? [];
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
  const changeLogQuery = useQuery({
    queryKey: ['project-dashboard', 'change-log', projectId],
    queryFn: () => projectsApi.listProjectChangeLog(projectId, 50),
    enabled: hasValidId,
    staleTime: 30_000,
  });
  const historicalDepartmentIds = useMemo(() => {
    const ids = new Set<number>();
    staffingTimeline?.people?.forEach((person) => {
      if (person.departmentId != null) ids.add(person.departmentId);
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [staffingTimeline?.people]);
  const departmentIds = useMemo(() => {
    const ids = new Set<number>();
    assignments.forEach((assignment) => {
      const deptId = assignment.personDepartmentId;
      if (typeof deptId === 'number' && deptId > 0) ids.add(deptId);
    });
    historicalDepartmentIds.forEach((deptId) => ids.add(deptId));
    return Array.from(ids).sort((a, b) => a - b);
  }, [assignments, historicalDepartmentIds]);
  const rolesByDeptQuery = useQuery<Record<number, ProjectRole[]>, Error>({
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
      return Object.fromEntries(entries) as Record<number, ProjectRole[]>;
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
  const [assignmentMode, setAssignmentMode] = React.useState<'person' | 'role'>('person');
  const [personSearch, setPersonSearch] = React.useState('');
  const [selectedPerson, setSelectedPerson] = React.useState<Person | null>(null);
  const [roleOpen, setRoleOpen] = React.useState(false);
  const [roleSelection, setRoleSelection] = React.useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const roleButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const { people: peopleResults } = usePeopleAutocomplete(personSearch);
  const { data: projectRoles = [] } = useProjectRoles(selectedPerson?.department ?? null);
  const [placeholderDeptId, setPlaceholderDeptId] = React.useState<number | null>(null);
  const [roleSearch, setRoleSearch] = React.useState('');
  const [roleDropdownOpen, setRoleDropdownOpen] = React.useState(false);
  const [placeholderRole, setPlaceholderRole] = React.useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const roleBoxRef = React.useRef<HTMLDivElement | null>(null);
  const { data: placeholderRoles = [] } = useProjectRoles(placeholderDeptId);
  const [personDropdownOpen, setPersonDropdownOpen] = React.useState(false);
  const personBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [savingAssignment, setSavingAssignment] = React.useState(false);
  const [deletingAssignmentId, setDeletingAssignmentId] = React.useState<number | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = React.useState<number | null>(null);
  const [updatingQaTaskId, setUpdatingQaTaskId] = React.useState<number | null>(null);
  const deliverablesRef = React.useRef<DeliverablesSectionHandle | null>(null);
  const [deliverablesRefreshToken, setDeliverablesRefreshToken] = React.useState(0);
  const dashboardRefreshQueueRef = React.useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    inFlight: boolean;
    pending: boolean;
    deliverables: boolean;
    project: boolean;
    changeLog: boolean;
  }>({ timer: null, inFlight: false, pending: false, deliverables: false, project: false, changeLog: false });
  const scheduleDashboardRefresh = React.useCallback(() => {
    if (!hasValidId) return;
    const queue = dashboardRefreshQueueRef.current;
    if (queue.timer) return;
    queue.timer = setTimeout(async () => {
      queue.timer = null;
      if (queue.inFlight) {
        queue.pending = true;
        return;
      }
      queue.inFlight = true;
      queue.pending = false;
      const refreshDeliverables = queue.deliverables;
      const refreshProject = queue.project;
      const refreshChangeLog = queue.changeLog;
      queue.deliverables = false;
      queue.project = false;
      queue.changeLog = false;
      try {
        const tasks: Array<Promise<unknown>> = [];
        if (refreshDeliverables) {
          setDeliverablesRefreshToken((t) => t + 1);
          tasks.push(queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'deliverable-tasks', projectId] }));
          tasks.push(queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'qa-tasks', projectId] }));
        }
        if (refreshProject) {
          tasks.push(queryClient.invalidateQueries({ queryKey: ['projects', projectId] }));
        }
        if (refreshChangeLog) {
          tasks.push(queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'change-log', projectId] }));
        }
        if (tasks.length) await Promise.all(tasks);
      } finally {
        queue.inFlight = false;
        if (queue.pending) scheduleDashboardRefresh();
      }
    }, 250);
  }, [hasValidId, projectId, queryClient]);
  const [showAddRisk, setShowAddRisk] = React.useState(false);
  const [riskDescription, setRiskDescription] = React.useState('');
  const [riskPriority, setRiskPriority] = React.useState<'high' | 'medium' | 'low'>('medium');
  const [riskStatus, setRiskStatus] = React.useState<'open' | 'closed'>('open');
  const [riskDepartments, setRiskDepartments] = React.useState<number[]>([]);
  const [riskFile, setRiskFile] = React.useState<File | null>(null);
  const [editingRiskId, setEditingRiskId] = React.useState<number | null>(null);
  const [riskEditDescription, setRiskEditDescription] = React.useState('');
  const [riskEditPriority, setRiskEditPriority] = React.useState<'high' | 'medium' | 'low'>('medium');
  const [riskEditStatus, setRiskEditStatus] = React.useState<'open' | 'closed'>('open');
  const [riskEditDepartments, setRiskEditDepartments] = React.useState<number[]>([]);
  const [riskEditFile, setRiskEditFile] = React.useState<File | null>(null);
  const [riskEditDeptOpen, setRiskEditDeptOpen] = React.useState(false);
  const riskEditDeptRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (assignmentMode !== 'role') return;
    if (placeholderDeptId != null) return;
    const firstDept = departmentsQuery.data?.[0]?.id;
    if (firstDept) setPlaceholderDeptId(firstDept);
  }, [assignmentMode, placeholderDeptId, departmentsQuery.data]);

  const filteredPlaceholderRoles = React.useMemo(() => {
    const query = roleSearch.trim().toLowerCase();
    if (!query) return placeholderRoles;
    return placeholderRoles.filter((role) => role.name.toLowerCase().includes(query));
  }, [placeholderRoles, roleSearch]);
  const riskFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const riskEditFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [savingRisk, setSavingRisk] = React.useState(false);
  const [deletingRiskId, setDeletingRiskId] = React.useState<number | null>(null);
  const [expandedRiskIds, setExpandedRiskIds] = React.useState<Set<number>>(new Set());
  const [openAttachmentMenuId, setOpenAttachmentMenuId] = React.useState<number | null>(null);
  const attachmentMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [qaSearchByTaskId, setQaSearchByTaskId] = React.useState<Record<number, string>>({});
  const [qaDropdownOpenId, setQaDropdownOpenId] = React.useState<number | null>(null);
  const qaBoxRefs = React.useRef(new Map<number, HTMLDivElement | null>());

  React.useEffect(() => {
    if (!hasValidId) return;
    const unsubscribeDeliverables = subscribeDeliverablesRefresh(() => {
      const queue = dashboardRefreshQueueRef.current;
      queue.deliverables = true;
      queue.changeLog = true;
      scheduleDashboardRefresh();
    });
    const unsubscribeProjects = subscribeProjectsRefresh(() => {
      const queue = dashboardRefreshQueueRef.current;
      queue.project = true;
      scheduleDashboardRefresh();
    });
    return () => {
      unsubscribeDeliverables();
      unsubscribeProjects();
      const queue = dashboardRefreshQueueRef.current;
      if (queue.timer) clearTimeout(queue.timer);
      queue.timer = null;
      queue.inFlight = false;
      queue.pending = false;
      queue.deliverables = false;
      queue.project = false;
      queue.changeLog = false;
    };
  }, [hasValidId, projectId, scheduleDashboardRefresh]);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (personBoxRef.current && !personBoxRef.current.contains(target)) {
        setPersonDropdownOpen(false);
      }
      if (roleBoxRef.current && !roleBoxRef.current.contains(target)) {
        setRoleDropdownOpen(false);
      }
      if (riskEditDeptOpen && riskEditDeptRef.current && !riskEditDeptRef.current.contains(target)) {
        setRiskEditDeptOpen(false);
      }
      if (openAttachmentMenuId && attachmentMenuRef.current && !attachmentMenuRef.current.contains(target)) {
        setOpenAttachmentMenuId(null);
      }
      if (qaDropdownOpenId != null) {
        const qaBox = qaBoxRefs.current.get(qaDropdownOpenId);
        if (qaBox && !qaBox.contains(target)) {
          setQaDropdownOpenId(null);
          setQaSearchByTaskId((prev) => {
            const next = { ...prev };
            delete next[qaDropdownOpenId];
            return next;
          });
          setQaSearchState({ taskId: null, value: '', departmentId: null });
        }
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [openAttachmentMenuId, riskEditDeptOpen, qaDropdownOpenId]);
  const assignmentsCountLabel = assignmentsQuery.isLoading ? '-' : String(assignmentsTotal);
  const departmentNameById = useMemo(() => {
    const map = new Map<number, string>();
    (departmentsQuery.data ?? []).forEach((dept: Department) => {
      if (dept.id != null) map.set(dept.id, dept.name);
    });
    return map;
  }, [departmentsQuery.data]);
  const assignmentGroups = useMemo(() => {
    const roleNameById = new Map<number, string>();
    Object.values(rolesByDeptQuery.data ?? {}).forEach((roles) => {
      roles.forEach((role) => {
        roleNameById.set(role.id, role.name);
      });
    });

    const activePersonIds = new Set<number>();
    assignments.forEach((assignment) => {
      if (assignment.person != null) activePersonIds.add(assignment.person);
    });

    const historicalAssignments: AssignmentListItem[] = [];
    staffingTimeline?.people?.forEach((person) => {
      if (person.personId == null || activePersonIds.has(person.personId)) return;
      const topRole = [...(person.roles || [])].sort((a, b) => (b.hours || 0) - (a.hours || 0))[0];
      const roleId = topRole?.roleId ?? null;
      const roleName = roleId != null ? roleNameById.get(roleId) ?? null : null;
      historicalAssignments.push({
        person: person.personId,
        personName: person.personName || '',
        personDepartmentId: person.departmentId ?? null,
        roleOnProjectId: roleId ?? null,
        roleName,
        weeklyHours: {},
        isHistorical: true,
      });
    });

    const groups = new Map<string, { active: AssignmentListItem[]; historical: AssignmentListItem[] }>();
    assignments.forEach((assignment) => {
      const deptId = assignment.personDepartmentId ?? null;
      const deptName = deptId != null ? (departmentNameById.get(deptId) || `Dept #${deptId}`) : 'Unassigned';
      if (!groups.has(deptName)) groups.set(deptName, { active: [], historical: [] });
      groups.get(deptName)!.active.push(assignment);
    });
    historicalAssignments.forEach((assignment) => {
      const deptId = assignment.personDepartmentId ?? null;
      const deptName = deptId != null ? (departmentNameById.get(deptId) || `Dept #${deptId}`) : 'Unassigned';
      if (!groups.has(deptName)) groups.set(deptName, { active: [], historical: [] });
      groups.get(deptName)!.historical.push(assignment);
    });
    const rolesByDept = rolesByDeptQuery.data ?? {};
    const entries = Array.from(groups.entries()).map(([name, group]) => {
      const sortedActive = sortAssignmentsByProjectRole(group.active, rolesByDept);
      const sortedHistorical = [...group.historical].sort((a, b) => {
        const an = (a.personName || '').toLowerCase();
        const bn = (b.personName || '').toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return (a.person || 0) - (b.person || 0);
      });
      return { name, items: [...sortedActive, ...sortedHistorical] };
    });
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, departmentNameById, rolesByDeptQuery.data, staffingTimeline?.people]);

  const historicalTooltipByPersonId = useMemo(() => {
    const map = new Map<number, { title: string; description: string }>();
    staffingTimeline?.people?.forEach((person) => {
      const events = [...(person.events || [])].sort((a, b) => a.week_start.localeCompare(b.week_start));
      let currentStart: string | null = null;
      const ranges: Array<{ start: string; end: string; weeks: number }> = [];
      let lastLeft: string | null = null;
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const calcWeeks = (start: string, end: string) => {
        const s = Date.parse(`${start}T00:00:00Z`);
        const e = Date.parse(`${end}T00:00:00Z`);
        if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
        const diff = Math.round((e - s) / weekMs);
        return Math.max(1, diff + 1);
      };
      events.forEach((event) => {
        if (event.event_type === 'joined') {
          currentStart = event.week_start;
          return;
        }
        if (event.event_type === 'left') {
          const start = currentStart ?? event.week_start;
          ranges.push({ start, end: event.week_start, weeks: calcWeeks(start, event.week_start) });
          currentStart = null;
          lastLeft = event.week_start;
        }
      });
      if (!ranges.length && person.firstWeek && person.lastWeek) {
        const weeks = person.totalWeeks ?? calcWeeks(person.firstWeek, person.lastWeek);
        ranges.push({ start: person.firstWeek, end: person.lastWeek, weeks });
      }
      const removedAt = lastLeft ?? person.lastWeek ?? null;
      const totalWeeks = person.totalWeeks ?? (person.roles || []).reduce((sum, role) => sum + (role.weeks || 0), 0);
      const formatWeek = (week?: string | null) => (week ? (formatUtcToLocal(week, { dateStyle: 'medium' }) || week) : 'Unknown');
      const lines: string[] = [];
      if (ranges.length) {
        ranges.forEach((range) => {
          const weeksLabel = range.weeks ? ` (${range.weeks} week${range.weeks === 1 ? '' : 's'})` : '';
          lines.push(`Assigned: ${formatWeek(range.start)} → ${formatWeek(range.end)}${weeksLabel}`);
        });
      } else if (totalWeeks) {
        lines.push(`Assigned: ${totalWeeks} week${totalWeeks === 1 ? '' : 's'}`);
      }
      if (removedAt) {
        lines.push(`Removed: ${formatWeek(removedAt)}`);
      }
      if (!lines.length) return;
      map.set(person.personId, { title: 'Historical assignment', description: lines.join('\n') });
    });
    return map;
  }, [staffingTimeline?.people]);

  const projectMembers = useMemo(() => {
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

  const taskGroups = useMemo(() => {
    const groups = new Map<number, { deliverable: DeliverableTask['deliverableInfo']; tasks: DeliverableTask[] }>();
    deliverableTasks.forEach((task) => {
      const info = task.deliverableInfo;
      if (!info) return;
      if (!groups.has(info.id)) {
        groups.set(info.id, { deliverable: info, tasks: [] });
      }
      groups.get(info.id)!.tasks.push(task);
    });
    const entries = Array.from(groups.values());
    entries.forEach((group) => {
      group.tasks.sort((a, b) => (a.departmentName || '').localeCompare(b.departmentName || ''));
    });
    return entries.sort((a, b) => {
      const aDate = a.deliverable?.date || '';
      const bDate = b.deliverable?.date || '';
      if (aDate && bDate) return aDate.localeCompare(bDate);
      if (aDate) return -1;
      if (bDate) return 1;
      return (a.deliverable?.description || '').localeCompare(b.deliverable?.description || '');
    });
  }, [deliverableTasks]);

  const qaTaskGroups = useMemo(() => {
    const groups = new Map<number, { deliverable: DeliverableQATask['deliverableInfo']; tasks: DeliverableQATask[] }>();
    qaTasks.forEach((task) => {
      const info = task.deliverableInfo;
      if (!info) return;
      if (!groups.has(info.id)) {
        groups.set(info.id, { deliverable: info, tasks: [] });
      }
      groups.get(info.id)!.tasks.push(task);
    });
    const entries = Array.from(groups.values());
    entries.forEach((group) => {
      group.tasks.sort((a, b) => (a.departmentName || '').localeCompare(b.departmentName || ''));
    });
    return entries.sort((a, b) => {
      const aDate = a.deliverable?.date || '';
      const bDate = b.deliverable?.date || '';
      if (aDate && bDate) return aDate.localeCompare(bDate);
      if (aDate) return -1;
      if (bDate) return 1;
      return (a.deliverable?.description || '').localeCompare(b.deliverable?.description || '');
    });
  }, [qaTasks]);

  const completionOptions: DeliverableTaskCompletionStatus[] = ['not_started', 'in_progress', 'complete'];
  const qaOptions: DeliverableTaskQaStatus[] = ['not_reviewed', 'in_review', 'approved', 'changes_required'];
  const [qaSearchState, setQaSearchState] = React.useState<{ taskId: number | null; value: string; departmentId: number | null }>({
    taskId: null,
    value: '',
    departmentId: null,
  });
  const qaPeopleQuery = useQuery({
    queryKey: ['project-dashboard', 'qa-people-search', qaSearchState.value, qaSearchState.departmentId],
    queryFn: () =>
      peopleApi.search(qaSearchState.value.trim(), 20, qaSearchState.departmentId != null ? { department: qaSearchState.departmentId } : undefined),
    enabled: qaSearchState.value.trim().length >= 2 && qaSearchState.departmentId != null,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const resetAddAssignment = () => {
    setAssignmentMode('person');
    setPersonSearch('');
    setSelectedPerson(null);
    setRoleSelection({ id: null, name: null });
    setRoleOpen(false);
    setPersonDropdownOpen(false);
    setPlaceholderDeptId(null);
    setRoleSearch('');
    setRoleDropdownOpen(false);
    setPlaceholderRole({ id: null, name: null });
  };

  const handleSelectPerson = (person: Person) => {
    setSelectedPerson(person);
    setPersonSearch(person.name);
    setPersonDropdownOpen(false);
    setRoleSelection({ id: null, name: null });
  };

  const handleSelectPlaceholderRole = (role: { id: number; name: string }) => {
    setPlaceholderRole({ id: role.id, name: role.name });
    setRoleSearch(role.name);
    setRoleDropdownOpen(false);
  };

  const handleSaveAssignment = async () => {
    if (!projectId || savingAssignment) return;
    if (assignmentMode === 'person' && !selectedPerson?.id) return;
    if (assignmentMode === 'role' && !placeholderRole.id) return;
    try {
      setSavingAssignment(true);
      if (assignmentMode === 'person') {
        await createAssignment({
          person: selectedPerson?.id ?? null,
          project: projectId,
          roleOnProjectId: roleSelection.id ?? null,
          weeklyHours: {},
          startDate: new Date().toISOString().slice(0, 10),
        } as any, assignmentsApi);
      } else {
        await createAssignment({
          person: null,
          project: projectId,
          roleOnProjectId: placeholderRole.id ?? null,
          weeklyHours: {},
          startDate: new Date().toISOString().slice(0, 10),
        } as any, assignmentsApi);
      }
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'assignments', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'change-log', projectId] });
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
      const assignment = assignments.find((a) => a.id === assignmentId);
      await deleteAssignment(assignmentId, assignmentsApi, {
        projectId: projectId ?? null,
        personId: assignment?.person ?? null,
        updatedAt: assignment?.updatedAt ?? new Date().toISOString(),
      });
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'assignments', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'change-log', projectId] });
    } finally {
      setDeletingAssignmentId(null);
    }
  };

  const handleSwapPlaceholder = async (assignmentId: number, person: { id: number; name: string }) => {
    try {
      await updateAssignment(assignmentId, { person: person.id }, assignmentsApi);
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'assignments', projectId] });
    } catch (e) {
      console.error('Failed to replace placeholder', e);
    }
  };

  const handleTaskUpdate = async (taskId: number, patch: Partial<DeliverableTask>) => {
    if (updatingTaskId) return;
    try {
      setUpdatingTaskId(taskId);
      await deliverableTasksApi.update(taskId, patch);
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'deliverable-tasks', projectId] });
    } catch (e) {
      console.error('Failed to update deliverable task', e);
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const handleQaTaskUpdate = async (taskId: number, patch: Partial<DeliverableQATask>) => {
    if (updatingQaTaskId) return;
    try {
      setUpdatingQaTaskId(taskId);
      await deliverableQaTasksApi.update(taskId, patch);
      await queryClient.invalidateQueries({ queryKey: ['project-dashboard', 'qa-tasks', projectId] });
    } catch (e) {
      console.error('Failed to update QA task', e);
    } finally {
      setUpdatingQaTaskId(null);
    }
  };

  const risks = (risksQuery.data?.results || []) as ProjectRisk[];
  const changeLogEntries = (changeLogQuery.data || []) as ProjectChangeLogEntry[];

  const toggleDepartment = (deptId: number, current: number[], setNext: (v: number[]) => void) => {
    if (current.includes(deptId)) {
      setNext(current.filter((id) => id !== deptId));
    } else {
      setNext([...current, deptId]);
    }
  };

  const resetRiskForm = () => {
    setRiskDescription('');
    setRiskPriority('medium');
    setRiskStatus('open');
    setRiskDepartments([]);
    setRiskFile(null);
  };

  const resetRiskEdit = () => {
    setEditingRiskId(null);
    setRiskEditDescription('');
    setRiskEditPriority('medium');
    setRiskEditStatus('open');
    setRiskEditDepartments([]);
    setRiskEditFile(null);
  };

  const handleAddRisk = async () => {
    if (!projectId || savingRisk || !riskDescription.trim()) return;
    try {
      setSavingRisk(true);
      const formData = new FormData();
      formData.append('description', riskDescription.trim());
      formData.append('priority', riskPriority);
      formData.append('status', riskStatus);
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
    setRiskEditPriority((risk.priority as 'high' | 'medium' | 'low') || 'medium');
    setRiskEditStatus((risk.status as 'open' | 'closed') || 'open');
    setRiskEditDepartments(risk.departments ? [...risk.departments] : []);
    setRiskEditFile(null);
  };

  const handleUpdateRisk = async (riskId: number) => {
    if (!projectId || savingRisk) return;
    try {
      setSavingRisk(true);
      const formData = new FormData();
      formData.append('description', riskEditDescription.trim());
      formData.append('priority', riskEditPriority);
      formData.append('status', riskEditStatus);
      formData.append('departments', JSON.stringify(riskEditDepartments));
      if (riskEditFile) formData.append('attachment', riskEditFile);
      await projectRisksApi.update(projectId, riskId, formData);
      await queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
      resetRiskEdit();
    } finally {
      setSavingRisk(false);
    }
  };

  const handleInlineRiskUpdate = async (
    riskId: number,
    field: 'priority' | 'status',
    value: 'high' | 'medium' | 'low' | 'open' | 'closed'
  ) => {
    if (!projectId || savingRisk) return;
    try {
      setSavingRisk(true);
      const formData = new FormData();
      formData.append(field, value);
      await projectRisksApi.update(projectId, riskId, formData);
      await queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
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

  const handleInlineRiskAttachment = async (riskId: number, file: File | null) => {
    if (!projectId || savingRisk || !file) return;
    try {
      setSavingRisk(true);
      const formData = new FormData();
      formData.append('attachment', file);
      await projectRisksApi.update(projectId, riskId, formData);
      await queryClient.invalidateQueries({ queryKey: ['project-risks', projectId] });
    } finally {
      setSavingRisk(false);
    }
  };

  const toggleRiskExpanded = (riskId: number) => {
    setExpandedRiskIds((prev) => {
      const next = new Set(prev);
      if (next.has(riskId)) {
        next.delete(riskId);
      } else {
        next.add(riskId);
      }
      return next;
    });
  };

  const formatRiskEditLines = (
    edit?: ProjectRisk['edits'] extends Array<infer T> ? T : any
  ): Array<{ key: string; text: string }> => {
    if (!edit) return [];
    if (edit.action === 'created') {
      return [{ key: `${edit.id}-created`, text: 'Created risk' }];
    }
    const changes = edit.changes || {};
    const fields = Object.keys(changes || {}).filter((k) => k !== 'fields');
    const titleCase = (value?: string | null) => {
      if (!value) return '';
      return value.charAt(0).toUpperCase() + value.slice(1);
    };
    const formatValue = (field: string, value: any) => {
      if (field === 'priority' || field === 'status') {
        return titleCase(String(value || '').toLowerCase()) || '—';
      }
      if (field === 'departments') {
        const ids = Array.isArray(value) ? value : [];
        const names = ids.map((id: number) => departmentNameById.get(id) || `Dept #${id}`);
        return names.join(', ') || 'None';
      }
      if (field === 'attachment') {
        if (!value) return 'None';
        const parts = String(value).split('/');
        return parts[parts.length - 1] || value;
      }
      if (value === null || value === undefined || value === '') return '—';
      return String(value);
    };
    return fields.map((field: string) => {
      const label = field === 'departments' ? 'Disciplines' : titleCase(field) || field;
      const entry = changes[field] || {};
      const from = formatValue(field, entry.from);
      const to = formatValue(field, entry.to);
      return {
        key: `${edit.id}-${field}`,
        text: `Updated ${label} from ${from} to ${to}`,
      };
    });
  };

  const formatChangeLogLines = (entry: ProjectChangeLogEntry): Array<{ key: string; text: string }> => {
    const action = entry.action;
    const detail = entry.detail || {};

    const formatDeliverableValue = (field: string, value: any) => {
      if (field === 'date') {
        if (!value) return '—';
        return formatUtcToLocal(String(value), { dateStyle: 'medium' }) || String(value);
      }
      if (field === 'percentage') {
        if (value === null || value === undefined || value === '') return '—';
        return `${value}%`;
      }
      if (value === null || value === undefined || value === '') return '—';
      return String(value);
    };

    if (action.startsWith('assignment.')) {
      const assignment = detail.assignment || {};
      const personLabel = assignment.personName || (assignment.personId ? `Person #${assignment.personId}` : null);
      const roleLabel = assignment.roleName || (assignment.roleId ? `Role #${assignment.roleId}` : null);
      let label = personLabel || roleLabel || 'Assignment';
      if (personLabel && roleLabel) {
        label = `${personLabel} (${roleLabel})`;
      }
      const verb = action === 'assignment.added' ? 'Added' : action === 'assignment.removed' ? 'Removed' : 'Updated';
      return [{ key: `${entry.id}-assignment`, text: `${verb} assignment: ${label}` }];
    }

    if (action.startsWith('deliverable.')) {
      const deliverable = detail.deliverable || {};
      const label = deliverable.description
        || (deliverable.percentage != null ? `${deliverable.percentage}%` : null)
        || (deliverable.id ? `Deliverable #${deliverable.id}` : 'Deliverable');
      const dateLabel = deliverable.date
        ? (formatUtcToLocal(String(deliverable.date), { dateStyle: 'medium' }) || String(deliverable.date))
        : '';

      if (action === 'deliverable.created') {
        const suffix = dateLabel ? ` (${dateLabel})` : '';
        return [{ key: `${entry.id}-deliverable-created`, text: `Added deliverable ${label}${suffix}` }];
      }
      if (action === 'deliverable.deleted') {
        const suffix = dateLabel ? ` (${dateLabel})` : '';
        return [{ key: `${entry.id}-deliverable-deleted`, text: `Removed deliverable ${label}${suffix}` }];
      }
      if (action === 'deliverable.updated') {
        const changes = detail.changes || {};
        const fields = Object.keys(changes || {});
        if (fields.length === 0) {
          return [{ key: `${entry.id}-deliverable-updated`, text: `Updated deliverable ${label}` }];
        }
        return fields.map((field) => {
          const entryChange = changes[field] || {};
          const from = formatDeliverableValue(field, entryChange.from);
          const to = formatDeliverableValue(field, entryChange.to);
          const fieldLabel = field === 'percentage' ? 'Percent' : field === 'description' ? 'Description' : 'Date';
          return {
            key: `${entry.id}-deliverable-${field}`,
            text: `Deliverable ${label}: Updated ${fieldLabel} from ${from} to ${to}`,
          };
        });
      }
    }

    return [{ key: `${entry.id}-fallback`, text: action || 'Updated item' }];
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

  const handleViewAttachment = async (risk: ProjectRisk) => {
    if (!projectId || !risk.id) return;
    const blob = await projectRisksApi.downloadAttachment(projectId, risk.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
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
                    refreshToken={deliverablesRefreshToken}
                  />
                ) : null}
              </Card>

              <Card className="p-3">
                <div className="relative flex items-center justify-center">
                  <div className="text-sm font-semibold text-[var(--text)] text-center">Deliverable Tasks</div>
                </div>
                <div className="border-t border-[#4a4f57]/60 mt-2 mb-2" />
                {deliverableTasksQuery.isLoading ? (
                  <div className="text-[11px] text-[var(--muted)]">Loading tasks…</div>
                ) : taskGroups.length === 0 ? (
                  <div className="text-[11px] text-[var(--muted)]">No tasks generated yet.</div>
                ) : (
                  <div className="space-y-3">
                    {taskGroups.map((group) => {
                      const deliverableLabel = group.deliverable?.description
                        || (group.deliverable?.percentage != null ? `${group.deliverable.percentage}%` : 'Milestone');
                      const dateLabel = group.deliverable?.date
                        ? formatUtcToLocal(group.deliverable.date, { dateStyle: 'medium' })
                        : null;
                      return (
                        <div key={group.deliverable?.id} className="space-y-1">
                          <div className="text-[11px] text-[var(--muted)]">
                            {deliverableLabel}{dateLabel ? ` · ${dateLabel}` : ''}
                          </div>
                          <div className="grid grid-cols-[1fr_1fr_2fr_0.9fr_0.9fr_1fr] gap-2 text-[10px] text-[var(--muted)] mb-1">
                            <div>Department</div>
                            <div>Sheet</div>
                            <div>Scope</div>
                            <div>Completion</div>
                            <div>QA</div>
                            <div>Assignee</div>
                          </div>
                          <div className="space-y-1">
                            {group.tasks.map((task) => (
                              <div key={task.id} className="grid grid-cols-[1fr_1fr_2fr_0.9fr_0.9fr_1fr] gap-2 items-center text-[11px]">
                                <div className="truncate">{task.departmentName || `Dept #${task.departmentId}`}</div>
                                <div className="truncate">
                                  {[task.sheetNumber, task.sheetName].filter(Boolean).join(' · ') || '—'}
                                </div>
                                <div className="truncate">{task.scopeDescription || '—'}</div>
                                <div>
                                  <select
                                    value={task.completionStatus}
                                    disabled={updatingTaskId === task.id}
                                    onChange={(e) =>
                                      task.id &&
                                      handleTaskUpdate(task.id, { completionStatus: e.currentTarget.value as DeliverableTaskCompletionStatus })
                                    }
                                    className="w-full bg-transparent border border-transparent text-[11px] focus:border-[var(--border)] focus:bg-[var(--card)] rounded px-0 py-0 appearance-none cursor-pointer"
                                  >
                                    {completionOptions.map((opt) => (
                                      <option key={opt} value={opt}>{opt.replace('_', ' ')}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <select
                                    value={task.qaStatus}
                                    disabled={updatingTaskId === task.id}
                                    onChange={(e) =>
                                      task.id &&
                                      handleTaskUpdate(task.id, { qaStatus: e.currentTarget.value as DeliverableTaskQaStatus })
                                    }
                                    className="w-full bg-transparent border border-transparent text-[11px] focus:border-[var(--border)] focus:bg-[var(--card)] rounded px-0 py-0 appearance-none cursor-pointer"
                                  >
                                    {qaOptions.map((opt) => (
                                      <option key={opt} value={opt}>{opt.replace('_', ' ')}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  {task.completionStatus === 'complete' ? (
                                    <div className="truncate text-[11px] text-[var(--muted)]">{task.assignedToName || '—'}</div>
                                  ) : (
                                    <select
                                      value={task.assignedTo ?? ''}
                                      disabled={updatingTaskId === task.id}
                                      onChange={(e) =>
                                        task.id &&
                                        handleTaskUpdate(task.id, { assignedTo: e.currentTarget.value ? Number(e.currentTarget.value) : null })
                                      }
                                      className="w-full bg-transparent border border-transparent text-[11px] focus:border-[var(--border)] focus:bg-[var(--card)] rounded px-0 py-0 appearance-none cursor-pointer"
                                    >
                                      <option value="">Unassigned</option>
                                      {projectMembers.map((member) => (
                                        <option key={member.id} value={member.id}>{member.name}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card className="p-3">
                <div className="relative flex items-center justify-center">
                  <div className="text-sm font-semibold text-[var(--text)] text-center">QA Check List</div>
                </div>
                <div className="border-t border-[#4a4f57]/60 mt-2 mb-2" />
                {qaTasksQuery.isLoading ? (
                  <div className="text-[11px] text-[var(--muted)]">Loading QA checklist…</div>
                ) : qaTaskGroups.length === 0 ? (
                  <div className="text-[11px] text-[var(--muted)]">No QA items yet.</div>
                ) : (
                  <div className="space-y-3">
                    {qaTaskGroups.map((group) => {
                      const deliverableLabel = group.deliverable?.description
                        || (group.deliverable?.percentage != null ? `${group.deliverable.percentage}%` : 'Milestone');
                      const dateLabel = group.deliverable?.date
                        ? formatUtcToLocal(group.deliverable.date, { dateStyle: 'medium' })
                        : null;
                      return (
                        <div key={group.deliverable?.id} className="space-y-1">
                          <div className="text-[11px] text-[var(--muted)]">
                            {deliverableLabel}{dateLabel ? ` · ${dateLabel}` : ''}
                          </div>
                          <div className="grid grid-cols-[1.2fr_0.7fr_1.2fr_0.9fr_0.9fr] gap-2 text-[10px] text-[var(--muted)] mb-1">
                            <div>Department</div>
                            <div>Reviewed</div>
                            <div>QA Assignee</div>
                            <div>QA Due</div>
                            <div>Reviewed On</div>
                          </div>
                          <div className="space-y-1">
                            {group.tasks.map((task) => (
                              <div key={task.id} className="grid grid-cols-[1.2fr_0.7fr_1.2fr_0.9fr_0.9fr] gap-2 items-center text-[11px]">
                                <div className="truncate">{task.departmentName || `Dept #${task.departmentId}`}</div>
                                <div>
                                  <label className="inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={task.qaStatus === 'reviewed'}
                                      disabled={updatingQaTaskId === task.id}
                                      onChange={(e) =>
                                        task.id &&
                                        handleQaTaskUpdate(task.id, { qaStatus: e.currentTarget.checked ? 'reviewed' : 'not_reviewed' })
                                      }
                                      className="h-3 w-3 accent-[var(--primary)]"
                                    />
                                    <span className="text-[11px] text-[var(--muted)]">Done</span>
                                  </label>
                                </div>
                                <div>
                                  {task.id ? (
                                    <div className="relative" ref={(el) => {
                                      if (el) {
                                        qaBoxRefs.current.set(task.id as number, el);
                                      } else {
                                        qaBoxRefs.current.delete(task.id as number);
                                      }
                                    }}>
                                      <input
                                        type="text"
                                        placeholder="Search Name/Role"
                                        value={
                                          Object.prototype.hasOwnProperty.call(qaSearchByTaskId, task.id)
                                            ? qaSearchByTaskId[task.id]
                                            : (task.qaAssignedToName || '')
                                        }
                                        disabled={updatingQaTaskId === task.id}
                                        onChange={(e) => {
                                          const nextValue = e.target.value;
                                          setQaSearchByTaskId((prev) => ({ ...prev, [task.id as number]: nextValue }));
                                          setQaDropdownOpenId(task.id as number);
                                          setQaSearchState({
                                            taskId: task.id as number,
                                            value: nextValue,
                                            departmentId: task.departmentId ?? null,
                                          });
                                        }}
                                        onFocus={() => {
                                          setQaDropdownOpenId(task.id as number);
                                          const existingValue = Object.prototype.hasOwnProperty.call(qaSearchByTaskId, task.id)
                                            ? qaSearchByTaskId[task.id]
                                            : '';
                                          setQaSearchState({
                                            taskId: task.id as number,
                                            value: existingValue,
                                            departmentId: task.departmentId ?? null,
                                          });
                                        }}
                                        className="w-full px-2 py-1 text-[11px] bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                                      />
                                      {qaDropdownOpenId === task.id && (
                                        <div className="absolute z-20 mt-1 left-0 right-0 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg max-h-40 overflow-auto">
                                          {(() => {
                                            const typedValue = (qaSearchByTaskId[task.id] || '').trim().toLowerCase();
                                            const matches =
                                              qaSearchState.taskId === task.id ? (qaPeopleQuery.data || []) : [];
                                            return (
                                              <div className="py-1">
                                                {task.qaAssignedTo ? (
                                                  <button
                                                    type="button"
                                                    className="w-full text-left px-2 py-1 text-[11px] text-[var(--muted)] hover:bg-[var(--surfaceHover)]"
                                                    onClick={() => {
                                                      handleQaTaskUpdate(task.id as number, { qaAssignedTo: null });
                                                      setQaSearchByTaskId((prev) => ({ ...prev, [task.id as number]: '' }));
                                                      setQaDropdownOpenId(null);
                                                      setQaSearchState({ taskId: null, value: '', departmentId: null });
                                                    }}
                                                  >
                                                    Unassigned
                                                  </button>
                                                ) : null}
                                                {typedValue.length < 2 ? (
                                                  <div className="px-2 py-1 text-[11px] text-[var(--muted)]">Type at least 2 characters to search</div>
                                                ) : qaPeopleQuery.isLoading ? (
                                                  <div className="px-2 py-1 text-[11px] text-[var(--muted)]">Searching…</div>
                                                ) : matches.length === 0 ? (
                                                  <div className="px-2 py-1 text-[11px] text-[var(--muted)]">No matches</div>
                                                ) : (
                                                  matches.map((person) => (
                                                    <button
                                                      key={person.id}
                                                      type="button"
                                                      className="w-full text-left px-2 py-1 text-[11px] hover:bg-[var(--surfaceHover)]"
                                                      onClick={() => {
                                                        handleQaTaskUpdate(task.id as number, { qaAssignedTo: person.id ?? null });
                                                        setQaSearchByTaskId((prev) => ({ ...prev, [task.id as number]: person.name }));
                                                        setQaDropdownOpenId(null);
                                                        setQaSearchState({ taskId: null, value: '', departmentId: null });
                                                      }}
                                                    >
                                                      <div className="text-[var(--text)]">{person.name}</div>
                                                      <div className="text-[10px] text-[var(--muted)]">{person.roleName || 'Role not set'}</div>
                                                    </button>
                                                  ))
                                                )}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-[var(--muted)]">—</div>
                                  )}
                                </div>
                                <div className="truncate text-[11px] text-[var(--muted)]">
                                  {task.dueDate ? (formatUtcToLocal(task.dueDate, { dateStyle: 'medium' }) || task.dueDate) : '—'}
                                </div>
                                <div className="truncate text-[11px] text-[var(--muted)]">
                                  {task.reviewedAt ? (formatUtcToLocal(task.reviewedAt, { dateStyle: 'medium' }) || task.reviewedAt) : '—'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">New Assignment</div>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          setAssignmentMode('person');
                          setRoleDropdownOpen(false);
                        }}
                        className={`px-2 py-0.5 rounded border border-[var(--border)] ${assignmentMode === 'person' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
                      >
                        Person
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignmentMode('role');
                          setPersonDropdownOpen(false);
                          setRoleOpen(false);
                        }}
                        className={`px-2 py-0.5 rounded border border-[var(--border)] ${assignmentMode === 'role' ? 'bg-[var(--primary)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
                      >
                        Role
                      </button>
                    </div>
                  </div>

                  {assignmentMode === 'person' ? (
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
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={placeholderDeptId ?? ''}
                          onChange={(e) => {
                            const next = e.target.value ? Number(e.target.value) : null;
                            setPlaceholderDeptId(next);
                            setRoleSearch('');
                            setPlaceholderRole({ id: null, name: null });
                            setRoleDropdownOpen(false);
                          }}
                          className="px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)]"
                        >
                          <option value="">Select department</option>
                          {(departmentsQuery.data || []).map((dept) => (
                            <option key={dept.id} value={dept.id ?? ''}>{dept.name}</option>
                          ))}
                        </select>
                        <div className="relative flex-1" ref={roleBoxRef}>
                          <input
                            type="text"
                            placeholder={placeholderDeptId ? 'Search roles...' : 'Select a department first'}
                            value={roleSearch}
                            onChange={(e) => {
                              setRoleSearch(e.target.value);
                              setRoleDropdownOpen(true);
                              setPlaceholderRole({ id: null, name: null });
                            }}
                            onFocus={() => {
                              if (placeholderDeptId) setRoleDropdownOpen(true);
                            }}
                            disabled={!placeholderDeptId}
                            className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
                          />
                          {roleDropdownOpen && roleSearch.trim().length >= 1 && (
                            <div className="absolute z-20 mt-1 left-0 right-0 bg-[var(--card)] border border-[var(--border)] rounded shadow-lg max-h-40 overflow-auto">
                              {filteredPlaceholderRoles.length === 0 ? (
                                <div className="px-2 py-1 text-[11px] text-[var(--muted)]">No matches</div>
                              ) : (
                                filteredPlaceholderRoles.map((role) => (
                                  <button
                                    key={role.id}
                                    type="button"
                                    className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--surfaceHover)]"
                                    onClick={() => handleSelectPlaceholderRole(role)}
                                  >
                                    <div className="text-[var(--text)]">{role.name}</div>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleSaveAssignment}
                          disabled={!placeholderRole.id || savingAssignment}
                          className="text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--primary)] text-white disabled:opacity-50"
                        >
                          {savingAssignment ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {assignmentsQuery.isLoading ? (
                <div className="text-xs text-[var(--muted)]">Loading assignments...</div>
              ) : assignmentsQuery.isError ? (
                <div className="text-xs text-red-300">Failed to load assignments.</div>
              ) : assignmentGroups.length === 0 ? (
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
                            const isHistorical = (assignment as AssignmentListItem).isHistorical;
                            const rowKey = assignment.id ?? `hist-${assignment.person ?? 'none'}-${assignment.roleOnProjectId ?? 'none'}`;
                            const personId = Number.isFinite(assignment.person) ? assignment.person : null;
                            const roleLabel = assignment.roleName || null;
                            const personLabel = assignment.personName
                              || (personId != null ? `Person #${personId}` : (roleLabel ? `<${roleLabel}>` : 'Unassigned'));
                            const canSwapPlaceholder = !isHistorical && personId == null && !!roleLabel;
                            const showTooltip = (isHistorical || assignment.isActive === false) && personId != null;
                            const tooltip = showTooltip ? historicalTooltipByPersonId.get(personId as number) : null;
                            return (
                              <li key={rowKey} className="py-1.5 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 items-center pl-3">
                                <div className="min-w-0">
                                  <div className={`text-xs truncate ${isHistorical ? 'text-[var(--muted)] italic' : 'text-[var(--text)]'}`}>
                                    {canSwapPlaceholder ? (
                                      <PlaceholderPersonSwap
                                        label={personLabel}
                                        deptId={(assignment as any).personDepartmentId ?? null}
                                        className="text-xs text-[var(--text)] truncate"
                                        onSelect={(person) => handleSwapPlaceholder(assignment.id!, person)}
                                      />
                                    ) : (
                                      tooltip ? (
                                        <TooltipPortal title={tooltip.title} description={tooltip.description} placement="right">
                                          <span className="inline-flex cursor-help">{personLabel}</span>
                                        </TooltipPortal>
                                      ) : (
                                        personLabel
                                      )
                                    )}
                                  </div>
                                  {!isHistorical && assignment.isActive === false ? (
                                    <div className="text-[11px] text-[var(--muted)]">Inactive</div>
                                  ) : null}
                                </div>
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <div className={`text-[11px] truncate ${isHistorical ? 'text-[var(--muted)] italic' : 'text-[var(--muted)]'}`}>{roleLabel || 'Role not set'}</div>
                                  {assignment.id && !isHistorical && (
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

            <div className="xl:col-span-5 space-y-4">
              {project?.id ? (
                <ProjectNotesEditor
                  projectId={project.id}
                  initialJson={project.notesJson}
                  initialHtml={project.notes}
                  canEdit={!!auth?.accessToken}
                  compact
                />
              ) : null}

              <Card className="p-3">
                <div className="relative flex items-center justify-center mb-2">
                  <div className="text-[13px] font-semibold text-[var(--text)] text-center">Change Log</div>
                  <button
                    type="button"
                    onClick={() => changeLogQuery.refetch()}
                    className="absolute right-0 text-[11px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                  >
                    Refresh
                  </button>
                </div>
                <div className="border-t border-[#4a4f57]/60 mb-2" />

                {changeLogQuery.isLoading ? (
                  <div className="text-[11px] text-[var(--muted)]">Loading change log…</div>
                ) : changeLogQuery.isError ? (
                  <div className="text-[11px] text-red-300">Unable to load change log.</div>
                ) : changeLogEntries.length === 0 ? (
                  <div className="text-[11px] text-[var(--muted)]">No recent changes.</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="min-w-full text-[11px] text-left">
                      <thead className="text-[var(--muted)]">
                        <tr>
                          <th className="py-1 pr-3">When</th>
                          <th className="py-1 pr-3">Who</th>
                          <th className="py-1 pr-3">Change</th>
                        </tr>
                      </thead>
                      <tbody className="text-[var(--text)]">
                        {changeLogEntries.map((entry) => {
                          const lines = formatChangeLogLines(entry);
                          const whenLabel =
                            formatUtcToLocal(entry.createdAt, { dateStyle: 'medium', timeStyle: 'short' })
                            || new Date(entry.createdAt).toLocaleString();
                          const actorLabel = entry.actorName || entry.actor?.username || '—';
                          return (
                            <tr key={entry.id} className="border-t border-[var(--border)] align-top">
                              <td className="py-2 pr-3 whitespace-nowrap">{whenLabel}</td>
                              <td className="py-2 pr-3 whitespace-nowrap">{actorLabel}</td>
                              <td className="py-2 pr-3">
                                <div className="space-y-1">
                                  {lines.map((line) => (
                                    <div key={line.key}>{line.text}</div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="p-2">
              <div className="relative flex items-center justify-center mb-2">
                <div className="text-[13px] font-semibold text-[var(--text)] text-center">Risk Log</div>
                <button
                  type="button"
                  onClick={() => setShowAddRisk((prev) => !prev)}
                  className="absolute right-0 text-[11px] w-5 h-5 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)] flex items-center justify-center"
                  aria-label={showAddRisk ? 'Close add risk' : 'Add risk'}
                >
                  {showAddRisk ? '×' : '+'}
                </button>
              </div>
              <div className="border-t border-[#4a4f57]/60 mb-1" />

              {showAddRisk && (
                <div className="mb-2 rounded border border-[var(--border)] bg-[var(--surfaceOverlay)]/40 p-2 space-y-2">
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
                      <div className="text-[11px] text-[var(--muted)]">Priority</div>
                      <select
                        value={riskPriority}
                        onChange={(e) => setRiskPriority(e.target.value as 'high' | 'medium' | 'low')}
                        className={`w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded focus:border-[var(--primary)] focus:outline-none ${
                          riskPriority === 'high' ? 'text-red-300' : riskPriority === 'low' ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        <option value="high" style={{ color: '#fca5a5' }}>High</option>
                        <option value="medium" style={{ color: '#fcd34d' }}>Medium</option>
                        <option value="low" style={{ color: '#6ee7b7' }}>Low</option>
                      </select>
                      <div className="text-[11px] text-[var(--muted)]">Status</div>
                      <select
                        value={riskStatus}
                        onChange={(e) => setRiskStatus(e.target.value as 'open' | 'closed')}
                        className={`w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded focus:border-[var(--primary)] focus:outline-none ${
                          riskStatus === 'open' ? 'text-red-300' : 'text-[var(--muted)]'
                        }`}
                      >
                        <option value="open" style={{ color: '#fca5a5' }}>Open</option>
                        <option value="closed" style={{ color: 'var(--muted)' }}>Closed</option>
                      </select>
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
                        ref={riskFileInputRef}
                        type="file"
                        onChange={(e) => setRiskFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => riskFileInputRef.current?.click()}
                        className="text-[11px] px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                        aria-label="Attach file"
                      >
                        📎
                      </button>
                      {riskFile ? (
                        <div className="text-[11px] text-[var(--muted)] truncate">{riskFile.name}</div>
                      ) : (
                        <div className="text-[11px] text-[var(--muted)]">No attachment</div>
                      )}
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
                <div className="space-y-1">
                  <div className="text-[10px] text-[var(--muted)] grid grid-cols-[1.1rem_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_7rem] gap-2 px-2 text-left border border-transparent rounded">
                    <div aria-hidden="true" />
                    <div>Description</div>
                    <div>Disciplines</div>
                    <div>Priority</div>
                    <div>Status</div>
                    <div>By</div>
                    <div>Date</div>
                    <div aria-hidden="true" />
                  </div>
                  {risks.map((risk) => (
                    <div key={risk.id} className="rounded border border-[var(--border)] bg-[var(--surfaceOverlay)]/20 p-1.5">
                      {(() => {
                        const edits = risk.edits || [];
                        const latestEdit = edits.length > 0 ? edits[0] : null;
                        const byLabel = latestEdit?.actorName || risk.updatedByName || risk.createdByName || 'Unknown';
                        const dateLabel = formatUtcToLocal(latestEdit?.createdAt || risk.updatedAt || risk.createdAt, { dateStyle: 'medium' });
                        const isExpanded = !!(risk.id && expandedRiskIds.has(risk.id));
                        const attachmentName = risk.attachment ? String(risk.attachment).split('/').pop() : 'Attachment';
                        return editingRiskId === risk.id ? (
                          <div className="space-y-2">
                            <div className="grid grid-cols-[1.1rem_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_7rem] gap-2 items-start text-left">
                              <button
                                type="button"
                                onClick={() => risk.id && toggleRiskExpanded(risk.id)}
                                className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
                                aria-label={isExpanded ? 'Collapse risk edits' : 'Expand risk edits'}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                              <textarea
                                value={riskEditDescription}
                                onChange={(e) => setRiskEditDescription(e.target.value)}
                                className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)]"
                                rows={2}
                              />
                              <div className="relative" ref={riskEditDeptRef}>
                                <button
                                  type="button"
                                  onClick={() => setRiskEditDeptOpen((prev) => !prev)}
                                  className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-left text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                                  aria-label="Select disciplines"
                                >
                                  {riskEditDepartments.length > 0
                                    ? riskEditDepartments
                                        .map((id) => departmentNameById.get(id) || `Dept #${id}`)
                                        .join(', ')
                                    : 'Select disciplines'}
                                </button>
                                {riskEditDeptOpen && (
                                  <div className="absolute z-20 mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] shadow-lg p-2 max-h-40 overflow-auto">
                                    {(departmentsQuery.data ?? []).map((dept) => (
                                      <label key={dept.id} className="flex items-center gap-2 text-[11px] text-[var(--text)] py-1">
                                        <input
                                          type="checkbox"
                                          checked={riskEditDepartments.includes(dept.id!)}
                                          onChange={() => toggleDepartment(dept.id!, riskEditDepartments, setRiskEditDepartments)}
                                          className="w-3 h-3"
                                        />
                                        <span className="truncate">{dept.name}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <select
                                value={riskEditPriority}
                                onChange={(e) => setRiskEditPriority(e.target.value as 'high' | 'medium' | 'low')}
                                className={`w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded focus:border-[var(--primary)] focus:outline-none ${
                                  riskEditPriority === 'high' ? 'text-red-300' : riskEditPriority === 'low' ? 'text-emerald-300' : 'text-amber-300'
                                }`}
                              >
                                <option value="high" style={{ color: '#fca5a5' }}>High</option>
                                <option value="medium" style={{ color: '#fcd34d' }}>Medium</option>
                                <option value="low" style={{ color: '#6ee7b7' }}>Low</option>
                              </select>
                              <select
                                value={riskEditStatus}
                                onChange={(e) => setRiskEditStatus(e.target.value as 'open' | 'closed')}
                                className={`w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded focus:border-[var(--primary)] focus:outline-none ${
                                  riskEditStatus === 'open' ? 'text-red-300' : 'text-[var(--muted)]'
                                }`}
                              >
                                <option value="open" style={{ color: '#fca5a5' }}>Open</option>
                                <option value="closed" style={{ color: 'var(--muted)' }}>Closed</option>
                              </select>
                              <div className="text-[11px] text-[var(--muted)]">{byLabel}</div>
                              <div className="text-[11px] text-[var(--muted)]">{dateLabel}</div>
                              <div className="flex items-center gap-1.5 justify-start">
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
                            <div className="flex items-center justify-between gap-2">
                              <input
                                ref={riskEditFileInputRef}
                                type="file"
                                onChange={(e) => setRiskEditFile(e.target.files?.[0] || null)}
                                className="hidden"
                              />
                              <button
                                type="button"
                                onClick={() => riskEditFileInputRef.current?.click()}
                                className="text-[11px] px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)]"
                                aria-label="Attach file"
                              >
                                📎
                              </button>
                              {riskEditFile ? (
                                <div className="text-[11px] text-[var(--muted)] truncate">{riskEditFile.name}</div>
                              ) : (
                                <div className="text-[11px] text-[var(--muted)]">No attachment</div>
                              )}
                            </div>
                            {isExpanded && edits.length > 0 && (
                              <div className="mt-1 border-t border-[var(--border)] pt-2 pl-6 space-y-1 text-[11px] text-[var(--muted)]">
                                {edits.flatMap((edit: any) =>
                                  formatRiskEditLines(edit).map((line) => (
                                    <div key={line.key} className="flex flex-wrap gap-2">
                                      <span className="font-medium">{line.text}</span>
                                      <span>· {edit.actorName || 'Unknown'}</span>
                                      <span>· {formatUtcToLocal(edit.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className={`grid grid-cols-[1.1rem_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_7rem] gap-2 items-center text-[11px] text-left ${
                              risk.status === 'closed' ? 'text-[var(--muted)]' : ''
                            }`}>
                              <button
                                type="button"
                                onClick={() => risk.id && toggleRiskExpanded(risk.id)}
                                className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
                                aria-label={isExpanded ? 'Collapse risk edits' : 'Expand risk edits'}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                              <div className="truncate">{risk.description}</div>
                              <div className="text-[11px] leading-tight">
                                {risk.departmentNames && risk.departmentNames.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {risk.departmentNames.map((name) => (
                                      <div key={name} className="truncate">{name}</div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[var(--muted)]">No disciplines</div>
                                )}
                              </div>
                              <div className="text-[11px]">
                                <select
                                  value={risk.priority || 'medium'}
                                  onChange={(e) =>
                                    risk.id &&
                                    handleInlineRiskUpdate(risk.id, 'priority', e.target.value as 'high' | 'medium' | 'low')
                                  }
                                  disabled={savingRisk}
                                  className={`w-full bg-transparent border border-transparent text-[11px] focus:border-[var(--border)] focus:bg-[var(--card)] rounded px-0 py-0 appearance-none cursor-pointer ${
                                    risk.status === 'closed'
                                      ? 'text-[var(--muted)]'
                                      : risk.priority === 'high'
                                        ? 'text-red-300'
                                        : risk.priority === 'low'
                                          ? 'text-emerald-300'
                                          : 'text-amber-300'
                                  }`}
                                >
                                  <option value="high" style={{ color: '#fca5a5' }}>High</option>
                                  <option value="medium" style={{ color: '#fcd34d' }}>Medium</option>
                                  <option value="low" style={{ color: '#6ee7b7' }}>Low</option>
                                </select>
                              </div>
                              <div className="text-[11px]">
                                <select
                                  value={risk.status || 'open'}
                                  onChange={(e) =>
                                    risk.id &&
                                    handleInlineRiskUpdate(risk.id, 'status', e.target.value as 'open' | 'closed')
                                  }
                                  disabled={savingRisk}
                                  className={`w-full bg-transparent border border-transparent text-[11px] focus:border-[var(--border)] focus:bg-[var(--card)] rounded px-0 py-0 appearance-none cursor-pointer ${
                                    risk.status === 'closed' ? 'text-[var(--muted)]' : 'text-red-300'
                                  }`}
                                >
                                  <option value="open" style={{ color: '#fca5a5' }}>Open</option>
                                  <option value="closed" style={{ color: 'var(--muted)' }}>Closed</option>
                                </select>
                              </div>
                              <div className="text-[11px] truncate">{byLabel}</div>
                              <div className="text-[11px]">{dateLabel}</div>
                              <div className="flex items-center gap-1.5 justify-start">
                              {(() => {
                                const inlineInputId = risk.id ? `risk-inline-attachment-${risk.id}` : undefined;
                                return (
                                  <>
                                    {risk.attachmentUrl && (
                                      <div
                                        ref={openAttachmentMenuId === risk.id ? attachmentMenuRef : null}
                                        className="relative"
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setOpenAttachmentMenuId((prev) => (prev === risk.id ? null : risk.id || null))
                                          }
                                          className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
                                          aria-label="View attachment"
                                        >
                                          👁
                                        </button>
                                        {openAttachmentMenuId === risk.id && (
                                          <div className="absolute right-0 mt-1 w-44 rounded border border-[var(--border)] bg-[var(--card)] shadow-lg p-2 text-[11px] text-[var(--text)] z-20">
                                            <div className="text-[11px] text-[var(--muted)] truncate mb-2">
                                              {attachmentName || 'Attachment'}
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenAttachmentMenuId(null);
                                                  handleViewAttachment(risk);
                                                }}
                                                className="text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surfaceHover)]"
                                              >
                                                View
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setOpenAttachmentMenuId(null);
                                                  handleDownloadAttachment(risk);
                                                }}
                                                className="text-[11px] px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surfaceHover)]"
                                              >
                                                Download
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {inlineInputId && (
                                      <input
                                        id={inlineInputId}
                                        type="file"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0] || null;
                                          if (risk.id && file) handleInlineRiskAttachment(risk.id, file);
                                          if (e.currentTarget) e.currentTarget.value = '';
                                        }}
                                        className="hidden"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!inlineInputId) return;
                                        const el = document.getElementById(inlineInputId) as HTMLInputElement | null;
                                        el?.click();
                                      }}
                                      className="text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
                                      aria-label="Attach file"
                                    >
                                      📎
                                    </button>
                                  </>
                                );
                              })()}
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
                            {isExpanded && edits.length > 0 && (
                              <div className="mt-1 border-t border-[var(--border)] pt-2 pl-5 space-y-1 text-[11px] text-[var(--muted)]">
                                {edits.flatMap((edit: any) =>
                                  formatRiskEditLines(edit).map((line) => (
                                    <div key={line.key} className="flex flex-wrap gap-2">
                                      <span className="font-medium">{line.text}</span>
                                      <span>· {edit.actorName || 'Unknown'}</span>
                                      <span>· {formatUtcToLocal(edit.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ProjectDashboard;
