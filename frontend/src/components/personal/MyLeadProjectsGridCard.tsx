import React from 'react';
import { Link } from 'react-router';
import Card from '@/components/ui/Card';
import HeaderActions from '@/components/compact/HeaderActions';
import AssignmentsFilterMenu from '@/components/compact/AssignmentsFilterMenu';
import WeeksHorizonField from '@/components/compact/WeeksHorizonField';
import WorkPlanningSearchBar from '@/features/work-planning/search/WorkPlanningSearchBar';
import { useWorkPlanningSearchTokens } from '@/features/work-planning/search/useWorkPlanningSearchTokens';
import { isDateInWeek } from '@/features/work-planning/grid/assignmentGridShared';
import { useProjectStatusFilters } from '@/pages/Assignments/grid/useProjectStatusFilters';
import { toWeekHeader } from '@/pages/Assignments/grid/utils';
import ProjectSection from '@/pages/Assignments/projectAssignments/components/ProjectSection';
import type { DeliverableMarker, ProjectWithAssignments } from '@/pages/Assignments/projectAssignments/types';
import type { ProjectRole } from '@/roles/api';
import { listProjectRoles } from '@/roles/api';
import type { Assignment, Deliverable, Project } from '@/types/models';
import { assignmentsApi, deliverablesApi } from '@/services/api';
import { updateAssignment } from '@/lib/mutations/assignments';
import { updateProject } from '@/lib/mutations/projects';
import { showToast as showToastBus } from '@/lib/toastBus';
import { classifyDeliverableType, deliverableTypeColors } from '@/util/deliverables';
import { formatDateWithWeekday } from '@/utils/dates';
import type { PersonalLeadProjectGridPayload, PersonalLeadProjectAssignment } from '@/hooks/usePersonalLeadProjectGrid';

type Props = {
  className?: string;
  payload: PersonalLeadProjectGridPayload | null;
  loading: boolean;
  error: string | null;
  weeks: number;
  onWeeksChange: (next: number) => void;
  onRetry: () => void;
};

type EditCell = { rowKey: string; weekKey: string };
type SelectionBounds = { weekLo: number; weekHi: number; rowLo: number | null; rowHi: number | null } | null;

const EMPTY_SELECTION_ROW_INDEX = new Map<string, number>();
const EMPTY_PERSON_RESULTS: any[] = [];
const EMPTY_ROLE_RESULTS: ProjectRole[] = [];
const EMPTY_ROLE_MATCHES: Array<{ role: ProjectRole; deptId: number; deptName: string }> = [];
const EMPTY_DEPARTMENTS: any[] = [];
const EMPTY_DELIVERABLES_BY_WEEK: Record<string, DeliverableMarker[]> = {};
const EMPTY_DELIVERABLE_TOOLTIPS: Record<string, string> = {};

function normalizeHours(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(2));
}

function buildDeliverableMarkers(rows: Deliverable[]): DeliverableMarker[] {
  const entries: DeliverableMarker[] = [];

  rows.forEach((row) => {
    const title = String((row as any).description ?? (row as any).title ?? '');
    const type = classifyDeliverableType(title);
    const percentageRaw = (row as any).percentage;
    const percentage = percentageRaw != null && !Number.isNaN(Number(percentageRaw))
      ? Number(percentageRaw)
      : undefined;

    const existing = entries.find((entry) => entry.type === type && entry.percentage === percentage);
    if (!existing) {
      entries.push({ type, percentage });
    }
  });

  return entries;
}

function buildDeliverableTooltip(rows: Deliverable[]): string | undefined {
  if (!rows.length) return undefined;
  const lines = rows.map((row) => {
    const title = String((row as any).description ?? (row as any).title ?? '').trim();
    const when = formatDateWithWeekday((row as any).date as string | undefined);
    const percentageRaw = (row as any).percentage;
    const percentage = percentageRaw != null && !Number.isNaN(Number(percentageRaw))
      ? `${Number(percentageRaw)}% `
      : '';
    const notes = (row as any).notes ? ` - ${(row as any).notes}` : '';
    const summary = `${percentage}${title}${notes}`.trim();
    return when ? `${when} - ${summary}` : summary;
  }).filter(Boolean);
  return lines.length ? lines.join('\n') : undefined;
}

function assignmentMatchesSearch(assignment: Assignment, term: string): boolean {
  const haystack = [
    assignment.personName || '',
    assignment.roleName || '',
  ].join(' ').toLowerCase();
  return haystack.includes(term);
}

const MyLeadProjectsGridCard: React.FC<Props> = ({
  className,
  payload,
  loading,
  error,
  weeks,
  onWeeksChange,
  onRetry,
}) => {
  const weekKeys = React.useMemo(() => payload?.weekKeys || [], [payload?.weekKeys]);
  const weekHeaders = React.useMemo(() => toWeekHeader(weekKeys), [weekKeys]);

  const [projectsData, setProjectsData] = React.useState<Project[]>([]);
  const [assignmentsData, setAssignmentsData] = React.useState<Assignment[]>([]);
  const [expandedProjectIds, setExpandedProjectIds] = React.useState<Set<number>>(new Set());

  const [statusDropdownOpenId, setStatusDropdownOpenId] = React.useState<number | null>(null);
  const [updatingProjectIds, setUpdatingProjectIds] = React.useState<Set<number>>(new Set());

  const [editingCell, setEditingCell] = React.useState<EditCell | null>(null);
  const [editingProjectId, setEditingProjectId] = React.useState<number | null>(null);
  const [editingValue, setEditingValue] = React.useState('');
  const [savingCellsByProject, setSavingCellsByProject] = React.useState<Map<number, Set<string>>>(new Map());

  const [openRoleFor, setOpenRoleFor] = React.useState<number | null>(null);
  const [openRoleProjectId, setOpenRoleProjectId] = React.useState<number | null>(null);
  const roleAnchorRef = React.useRef<HTMLElement | null>(null);
  const [rolesByDept, setRolesByDept] = React.useState<Record<number, ProjectRole[]>>({});
  const [deliverableTypesByProjectWeek, setDeliverableTypesByProjectWeek] = React.useState<Record<number, Record<string, DeliverableMarker[]>>>({});
  const [deliverableTooltipsByProjectWeek, setDeliverableTooltipsByProjectWeek] = React.useState<Record<number, Record<string, string>>>({});
  const deliverablesRequestIdRef = React.useRef(0);

  const search = useWorkPlanningSearchTokens({ idPrefix: 'lead-project-search' });
  const {
    statusFilterOptions,
    selectedStatusFilters,
    formatFilterStatus,
    toggleStatusFilter,
    matchesStatusFilters,
  } = useProjectStatusFilters([]);

  React.useEffect(() => {
    const nextProjects = (payload?.projects || []).map((project) => ({
      id: project.id,
      name: project.name || `Project ${project.id}`,
      client: project.client || '',
      status: project.status || 'active',
    })) as Project[];

    const nextAssignments: Assignment[] = [];
    Object.entries(payload?.assignmentsByProject || {}).forEach(([projectId, rows]) => {
      const projectNumericId = Number(projectId);
      (rows || []).forEach((row: PersonalLeadProjectAssignment) => {
        nextAssignments.push({
          id: row.id,
          project: projectNumericId,
          person: row.person,
          personName: row.personName || undefined,
          personDepartmentId: row.personDepartmentId,
          roleOnProjectId: row.roleOnProjectId,
          roleName: row.roleName,
          weeklyHours: { ...(row.weeklyHours || {}) },
        });
      });
    });

    setProjectsData(nextProjects);
    setAssignmentsData(nextAssignments);

    const projectIds = nextProjects
      .map((project) => project.id)
      .filter((id): id is number => Number.isFinite(id));

    setExpandedProjectIds((prev) => {
      if (!projectIds.length) return new Set();
      if (prev.size === 0) return new Set(projectIds);
      const next = new Set<number>();
      projectIds.forEach((id) => {
        if (prev.has(id)) next.add(id);
      });
      if (next.size === 0) {
        projectIds.forEach((id) => next.add(id));
      }
      return next;
    });

    setEditingCell(null);
    setEditingProjectId(null);
    setEditingValue('');
    setOpenRoleFor(null);
    setOpenRoleProjectId(null);
    setStatusDropdownOpenId(null);
  }, [payload]);

  const assignmentById = React.useMemo(() => {
    const map = new Map<number, Assignment>();
    assignmentsData.forEach((assignment) => {
      if (assignment.id != null) map.set(assignment.id, assignment);
    });
    return map;
  }, [assignmentsData]);

  const projectsWithAssignments = React.useMemo<ProjectWithAssignments[]>(() => {
    const grouped = new Map<number, Assignment[]>();
    assignmentsData.forEach((assignment) => {
      const projectId = Number(assignment.project);
      if (!Number.isFinite(projectId)) return;
      const rows = grouped.get(projectId) || [];
      rows.push(assignment);
      grouped.set(projectId, rows);
    });

    const sortedProjects = [...projectsData].sort((a, b) => {
      const aClient = (a.client || '').toLowerCase();
      const bClient = (b.client || '').toLowerCase();
      if (aClient && !bClient) return -1;
      if (!aClient && bClient) return 1;
      if (aClient !== bClient) return aClient.localeCompare(bClient);
      return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });

    return sortedProjects.map((project) => {
      const projectId = Number(project.id);
      const rows = (grouped.get(projectId) || []).slice().sort((a, b) => {
        const aIsPlaceholder = a.person == null;
        const bIsPlaceholder = b.person == null;
        if (aIsPlaceholder && !bIsPlaceholder) return 1;
        if (!aIsPlaceholder && bIsPlaceholder) return -1;
        const nameCmp = (a.personName || '').toLowerCase().localeCompare((b.personName || '').toLowerCase());
        if (nameCmp !== 0) return nameCmp;
        return (a.roleName || '').toLowerCase().localeCompare((b.roleName || '').toLowerCase());
      });
      return {
        ...project,
        assignments: rows,
        isExpanded: expandedProjectIds.has(projectId),
      };
    });
  }, [assignmentsData, projectsData, expandedProjectIds]);

  const projectMatchesSearch = React.useCallback((project: ProjectWithAssignments): boolean => {
    if (search.normalizedSearchTokens.length === 0) return true;

    const projectHaystack = [project.name || '', project.client || '', project.status || '']
      .join(' ')
      .toLowerCase();

    const matchesTerm = (term: string): boolean => {
      if (projectHaystack.includes(term)) return true;
      return (project.assignments || []).some((assignment) => assignmentMatchesSearch(assignment, term));
    };

    const andTokens = search.normalizedSearchTokens.filter((token) => token.op === 'and');
    const orTokens = search.normalizedSearchTokens.filter((token) => token.op === 'or');
    const notTokens = search.normalizedSearchTokens.filter((token) => token.op === 'not');

    if (andTokens.some((token) => !matchesTerm(token.term))) return false;
    if (notTokens.some((token) => matchesTerm(token.term))) return false;
    if (orTokens.length > 0 && !orTokens.some((token) => matchesTerm(token.term))) return false;
    if (orTokens.length === 0 && andTokens.length === 0 && notTokens.length > 0) return true;
    return true;
  }, [search.normalizedSearchTokens]);

  const visibleProjects = React.useMemo(
    () => projectsWithAssignments.filter((project) => matchesStatusFilters(project)).filter(projectMatchesSearch),
    [projectsWithAssignments, matchesStatusFilters, projectMatchesSearch]
  );

  const hoursByProject = React.useMemo(() => {
    const totals: Record<number, Record<string, number>> = {};
    projectsWithAssignments.forEach((project) => {
      const weekTotals: Record<string, number> = {};
      (project.assignments || []).forEach((assignment) => {
        Object.entries(assignment.weeklyHours || {}).forEach(([weekKey, rawHours]) => {
          const hours = Number(rawHours) || 0;
          if (!hours) return;
          weekTotals[weekKey] = Number(((weekTotals[weekKey] || 0) + hours).toFixed(2));
        });
      });
      if (project.id != null) totals[project.id] = weekTotals;
    });
    return totals;
  }, [projectsWithAssignments]);

  const activeProjectIds = React.useMemo(
    () => projectsData.map((project) => project.id).filter((id): id is number => Number.isFinite(id)),
    [projectsData]
  );

  React.useEffect(() => {
    if (activeProjectIds.length === 0 || weekKeys.length === 0) {
      setDeliverableTypesByProjectWeek({});
      setDeliverableTooltipsByProjectWeek({});
      return;
    }

    const requestId = ++deliverablesRequestIdRef.current;

    const loadDeliverables = async () => {
      try {
        const bulk = await deliverablesApi.bulkList(activeProjectIds);
        if (requestId !== deliverablesRequestIdRef.current) return;

        const nextTypesByProjectWeek: Record<number, Record<string, DeliverableMarker[]>> = {};
        const nextTooltipsByProjectWeek: Record<number, Record<string, string>> = {};

        activeProjectIds.forEach((projectId) => {
          const projectDeliverables = Array.isArray((bulk as any)?.[String(projectId)])
            ? ((bulk as any)[String(projectId)] as Deliverable[])
            : [];
          if (!projectDeliverables.length) return;

          const groupedByWeek: Record<string, Deliverable[]> = {};
          projectDeliverables.forEach((deliverable) => {
            const date = String((deliverable as any).date || '').trim();
            if (!date) return;
            const weekKey = weekKeys.find((wk) => isDateInWeek(date, wk));
            if (!weekKey) return;
            const list = groupedByWeek[weekKey] || [];
            list.push(deliverable);
            groupedByWeek[weekKey] = list;
          });

          const markersByWeek: Record<string, DeliverableMarker[]> = {};
          const tooltipsByWeek: Record<string, string> = {};
          Object.entries(groupedByWeek).forEach(([weekKey, rows]) => {
            const markers = buildDeliverableMarkers(rows);
            if (markers.length) {
              markersByWeek[weekKey] = markers;
            }
            const tooltip = buildDeliverableTooltip(rows);
            if (tooltip) {
              tooltipsByWeek[weekKey] = tooltip;
            }
          });

          if (Object.keys(markersByWeek).length > 0) {
            nextTypesByProjectWeek[projectId] = markersByWeek;
          }
          if (Object.keys(tooltipsByWeek).length > 0) {
            nextTooltipsByProjectWeek[projectId] = tooltipsByWeek;
          }
        });

        setDeliverableTypesByProjectWeek(nextTypesByProjectWeek);
        setDeliverableTooltipsByProjectWeek(nextTooltipsByProjectWeek);
      } catch {
        if (requestId !== deliverablesRequestIdRef.current) return;
        setDeliverableTypesByProjectWeek({});
        setDeliverableTooltipsByProjectWeek({});
      }
    };

    void loadDeliverables();
  }, [activeProjectIds, weekKeys]);

  const setCellSaving = React.useCallback((projectId: number, cellKey: string, saving: boolean) => {
    setSavingCellsByProject((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(projectId) || []);
      if (saving) set.add(cellKey);
      else set.delete(cellKey);
      if (set.size > 0) next.set(projectId, set);
      else next.delete(projectId);
      return next;
    });
  }, []);

  const commitCellHours = React.useCallback(async (assignmentId: number, weekKey: string, rawValue: number) => {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment || assignment.project == null) return;

    const projectId = Number(assignment.project);
    if (!Number.isFinite(projectId)) return;

    const nextValue = normalizeHours(rawValue);
    const previousHours = { ...(assignment.weeklyHours || {}) };
    const previousValue = Number(previousHours[weekKey] || 0);

    if (Math.abs(previousValue - nextValue) < 0.0001) {
      setEditingCell(null);
      setEditingProjectId(null);
      setEditingValue('');
      return;
    }

    const optimisticWeeklyHours = { ...previousHours };
    if (nextValue <= 0) delete optimisticWeeklyHours[weekKey];
    else optimisticWeeklyHours[weekKey] = nextValue;

    setAssignmentsData((prev) => prev.map((row) => (
      row.id === assignmentId
        ? { ...row, weeklyHours: optimisticWeeklyHours }
        : row
    )));

    const cellKey = `${assignmentId}-${weekKey}`;
    setCellSaving(projectId, cellKey, true);

    try {
      const updated = await updateAssignment(
        assignmentId,
        { weeklyHours: optimisticWeeklyHours },
        assignmentsApi,
        { skipIfMatch: assignment.person == null }
      );
      const serverWeeklyHours = ((updated as any)?.weeklyHours || optimisticWeeklyHours) as Record<string, number>;
      setAssignmentsData((prev) => prev.map((row) => (
        row.id === assignmentId
          ? { ...row, weeklyHours: { ...serverWeeklyHours } }
          : row
      )));
    } catch (err: any) {
      setAssignmentsData((prev) => prev.map((row) => (
        row.id === assignmentId
          ? { ...row, weeklyHours: previousHours }
          : row
      )));
      const errCode = err?.data?.code || err?.code;
      if (errCode === 'PRE_HIRE_WEEK_LOCKED') {
        showToastBus('Cannot assign hours before employee hire week.', 'warning');
      } else {
        showToastBus(err?.message || 'Failed to update hours', 'error');
      }
    } finally {
      setCellSaving(projectId, cellKey, false);
      setEditingCell(null);
      setEditingProjectId(null);
      setEditingValue('');
    }
  }, [assignmentById, setCellSaving]);

  const handleBeginEditing = React.useCallback((assignmentId: number, weekKey: string, seed?: string) => {
    const assignment = assignmentById.get(assignmentId);
    if (!assignment || assignment.project == null) return;
    const current = Number((assignment.weeklyHours || {})[weekKey] || 0);
    setEditingCell({ rowKey: String(assignmentId), weekKey });
    setEditingProjectId(Number(assignment.project));
    setEditingValue(seed ?? (current > 0 ? String(current) : ''));
  }, [assignmentById]);

  const handleCommitEditing = React.useCallback((assignmentId: number, weekKey: string, value: number) => {
    void commitCellHours(assignmentId, weekKey, value);
  }, [commitCellHours]);

  const handleCancelEditing = React.useCallback(() => {
    setEditingCell(null);
    setEditingProjectId(null);
    setEditingValue('');
  }, []);

  React.useEffect(() => {
    if (!editingCell) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-week-cell-editing="true"]')) return;
      const assignmentId = Number(editingCell.rowKey);
      if (!Number.isFinite(assignmentId)) return;
      const parsed = Number.parseFloat(editingValue);
      void commitCellHours(assignmentId, editingCell.weekKey, Number.isFinite(parsed) ? parsed : 0);
    };

    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, [editingCell, editingValue, commitCellHours]);

  const toggleProject = React.useCallback((project: ProjectWithAssignments) => {
    if (!project.id) return;
    setExpandedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(project.id!)) next.delete(project.id!);
      else next.add(project.id!);
      return next;
    });
  }, []);

  const toggleStatusDropdown = React.useCallback((projectId: number) => {
    setStatusDropdownOpenId((prev) => (prev === projectId ? null : projectId));
  }, []);

  const closeStatusDropdown = React.useCallback(() => {
    setStatusDropdownOpenId(null);
  }, []);

  const handleStatusSelect = React.useCallback(async (projectId: number, status: Project['status']) => {
    const currentProject = projectsData.find((project) => project.id === projectId);
    if (!currentProject) return;
    const previousStatus = currentProject.status;

    setProjectsData((prev) => prev.map((project) => (
      project.id === projectId ? { ...project, status } : project
    )));
    setUpdatingProjectIds((prev) => {
      const next = new Set(prev);
      next.add(projectId);
      return next;
    });
    closeStatusDropdown();

    try {
      await updateProject(projectId, { status });
    } catch (err: any) {
      setProjectsData((prev) => prev.map((project) => (
        project.id === projectId ? { ...project, status: previousStatus } : project
      )));
      showToastBus(err?.message || 'Failed to update project status', 'error');
    } finally {
      setUpdatingProjectIds((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }, [projectsData, closeStatusDropdown]);

  const isProjectUpdating = React.useCallback((projectId: number) => updatingProjectIds.has(projectId), [updatingProjectIds]);

  const handleToggleRole = React.useCallback((assignmentId: number, deptId: number | null, anchor: HTMLElement) => {
    if (openRoleFor === assignmentId) {
      setOpenRoleFor(null);
      setOpenRoleProjectId(null);
      return;
    }

    roleAnchorRef.current = anchor;
    setOpenRoleFor(assignmentId);

    const assignment = assignmentById.get(assignmentId);
    const projectId = assignment?.project != null ? Number(assignment.project) : null;
    setOpenRoleProjectId(Number.isFinite(projectId as number) ? (projectId as number) : null);

    if (deptId && !rolesByDept[deptId]) {
      void listProjectRoles(deptId)
        .then((roles) => {
          setRolesByDept((prev) => ({ ...prev, [deptId]: roles }));
        })
        .catch(() => {
          showToastBus('Failed to load project roles', 'error');
        });
    }
  }, [openRoleFor, assignmentById, rolesByDept]);

  const closeRoleDropdown = React.useCallback(() => {
    setOpenRoleFor(null);
    setOpenRoleProjectId(null);
  }, []);

  const handleSelectRole = React.useCallback(async (
    projectId: number,
    assignmentId: number,
    _deptId: number | null,
    roleId: number | null,
    roleName: string | null,
    previousId: number | null,
    previousName: string | null
  ) => {
    setAssignmentsData((prev) => prev.map((assignment) => (
      assignment.id === assignmentId
        ? { ...assignment, roleOnProjectId: roleId, roleName }
        : assignment
    )));

    closeRoleDropdown();

    try {
      await updateAssignment(assignmentId, { roleOnProjectId: roleId }, assignmentsApi);
    } catch (err: any) {
      setAssignmentsData((prev) => prev.map((assignment) => (
        assignment.id === assignmentId
          ? { ...assignment, roleOnProjectId: previousId, roleName: previousName }
          : assignment
      )));
      showToastBus(err?.message || 'Failed to update role', 'error');
    }
  }, [closeRoleDropdown]);

  const handleSwapPlaceholder = React.useCallback(async (
    projectId: number,
    assignmentId: number,
    person: { id: number; name: string; department?: number | null }
  ) => {
    const previous = assignmentById.get(assignmentId);
    if (!previous) return;

    setAssignmentsData((prev) => prev.map((assignment) => (
      assignment.id === assignmentId
        ? {
            ...assignment,
            person: person.id,
            personName: person.name,
            personDepartmentId: person.department ?? assignment.personDepartmentId ?? null,
          }
        : assignment
    )));

    try {
      await updateAssignment(assignmentId, { person: person.id, project: projectId }, assignmentsApi);
    } catch (err: any) {
      setAssignmentsData((prev) => prev.map((assignment) => (
        assignment.id === assignmentId ? previous : assignment
      )));
      showToastBus(err?.message || 'Failed to replace placeholder', 'error');
    }
  }, [assignmentById]);

  const clientColumnWidth = 240;
  const projectColumnWidth = 280;
  const actionColumnWidth = 36;
  const gridTemplate = React.useMemo(
    () => `${clientColumnWidth}px ${projectColumnWidth}px ${actionColumnWidth}px repeat(${Math.max(weekHeaders.length, 1)}, 70px)`,
    [weekHeaders.length]
  );
  const minWidth = React.useMemo(
    () => clientColumnWidth + projectColumnWidth + actionColumnWidth + (Math.max(weekHeaders.length, 1) * 70),
    [weekHeaders.length]
  );

  const hasProjects = projectsWithAssignments.length > 0;
  const hasVisibleProjects = visibleProjects.length > 0;

  return (
    <Card className={`bg-[var(--card)] border-[var(--border)] h-full min-h-0 ${className || ''}`}>
      <div className="space-y-3 h-full min-h-0 flex flex-col">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text)]">Lead Project Assignments</h3>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              {visibleProjects.length} of {projectsWithAssignments.length} {projectsWithAssignments.length === 1 ? 'project' : 'projects'}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <WeeksHorizonField value={weeks} onChange={onWeeksChange} min={1} max={52} className="h-8 px-2" />
            <Link
              to={`/project-assignments?view=project&weeks=${encodeURIComponent(String(weeks))}`}
              className="h-8 inline-flex items-center justify-center px-3 rounded border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
            >
              Open Full Project Assignments
            </Link>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-2 lg:items-center lg:justify-between">
          <div className="relative group w-full lg:max-w-[520px]">
            <WorkPlanningSearchBar
              id="my-work-lead-project-search"
              label="Search lead projects"
              tokens={search.searchTokens}
              activeTokenId={search.activeTokenId}
              searchOp={search.searchOp}
              searchInput={search.searchInput}
              onInputChange={search.setSearchInput}
              onInputKeyDown={search.handleSearchKeyDown}
              onTokenSelect={search.setActiveTokenId}
              onTokenRemove={search.removeSearchToken}
              onSearchOpChange={search.handleSearchOpChange}
              placeholder="Search"
              tokenLayout="scroll"
            />
          </div>
          <div className="flex items-center gap-2">
            <HeaderActions
              onExpandAll={() => {
                setExpandedProjectIds(new Set(projectsWithAssignments.map((project) => project.id!).filter((id): id is number => Number.isFinite(id))));
              }}
              onCollapseAll={() => setExpandedProjectIds(new Set())}
              onRefreshAll={onRetry}
              disabled={loading}
            />
            <AssignmentsFilterMenu
              statusOptions={statusFilterOptions as readonly string[]}
              selectedStatuses={selectedStatusFilters as Set<string>}
              formatStatus={(status) => formatFilterStatus(status as any)}
              onToggleStatus={(status) => toggleStatusFilter(status as any)}
              buttonLabel="Filter"
              buttonTitle="Filter lead project assignments"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="px-2 py-1 rounded border border-red-400/40 text-red-100 hover:bg-red-500/20"
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading && !hasProjects ? (
          <div className="text-sm text-[var(--muted)]">Loading lead assignments…</div>
        ) : null}

        {!loading && !hasProjects ? (
          <div className="text-sm text-[var(--muted)]">No lead projects found.</div>
        ) : null}

        {!loading && hasProjects && !hasVisibleProjects ? (
          <div className="text-sm text-[var(--muted)]">No projects match the selected filters.</div>
        ) : null}

        {hasVisibleProjects ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <div style={{ minWidth }}>
              <div className="grid gap-px px-2 py-1 border-b border-[var(--border)]" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Client / Person</div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Project / Role</div>
                <div className="text-[11px] uppercase tracking-wide text-center text-[var(--muted)]">+/-</div>
                {weekHeaders.map((week) => (
                  <div key={`lead-grid-week-${week.date}`} className="text-[11px] uppercase tracking-wide text-center text-[var(--muted)]">
                    {week.display}
                  </div>
                ))}
              </div>

              <div>
                {visibleProjects.map((project) => {
                  const projectId = project.id!;
                  const isProjectSelection = false;
                  const rowIndexByKey = isProjectSelection ? new Map<string, number>() : EMPTY_SELECTION_ROW_INDEX;
                  const selectionBounds: SelectionBounds = null;
                  const editingCellForProject = editingProjectId === projectId ? editingCell : null;
                  const editingValueForProject = editingProjectId === projectId ? editingValue : '';
                  const openRoleForProject = openRoleProjectId === projectId ? openRoleFor : null;
                  const rolesByDeptForProject = openRoleProjectId === projectId ? rolesByDept : {};

                  return (
                    <ProjectSection
                      key={`lead-grid-project-${project.id}`}
                      project={project}
                      weeks={weekHeaders}
                      gridTemplate={gridTemplate}
                      clientColumnWidth={clientColumnWidth}
                      projectColumnWidth={projectColumnWidth}
                      loadingAssignments={false}
                      hoursByWeek={hoursByProject[projectId] || {}}
                      deliverablesByWeek={deliverableTypesByProjectWeek[projectId] || EMPTY_DELIVERABLES_BY_WEEK}
                      deliverableTooltipsByWeek={deliverableTooltipsByProjectWeek[projectId] || EMPTY_DELIVERABLE_TOOLTIPS}
                      typeColors={deliverableTypeColors}
                      isStatusDropdownOpen={statusDropdownOpenId === projectId}
                      onToggleStatusDropdown={toggleStatusDropdown}
                      onCloseStatusDropdown={closeStatusDropdown}
                      onStatusSelect={handleStatusSelect}
                      isUpdating={isProjectUpdating(projectId)}
                      onToggleExpanded={toggleProject}
                      onAddPersonClick={() => {}}
                      isAddingForProject={false}
                      addMode="person"
                      personQuery=""
                      personResults={EMPTY_PERSON_RESULTS}
                      roleMatches={EMPTY_ROLE_MATCHES}
                      selectedPersonIndex={-1}
                      onPersonQueryChange={() => {}}
                      onPersonKeyDown={() => {}}
                      onPersonSelect={() => {}}
                      roleDeptId={null}
                      roleQuery=""
                      roleResults={EMPTY_ROLE_RESULTS}
                      selectedRoleIndex={-1}
                      departments={EMPTY_DEPARTMENTS}
                      onAddModeChange={() => {}}
                      onRoleDeptChange={() => {}}
                      onRoleQueryChange={() => {}}
                      onRoleKeyDown={() => {}}
                      onRoleSelect={() => {}}
                      rowIndexByKey={rowIndexByKey}
                      selectionBounds={selectionBounds}
                      editingCell={editingCellForProject}
                      editingValue={editingValueForProject}
                      onEditValueChange={setEditingValue}
                      savingCells={savingCellsByProject.get(projectId) || new Set()}
                      onBeginEditing={handleBeginEditing}
                      onCommitEditing={handleCommitEditing}
                      onCancelEditing={handleCancelEditing}
                      onCellMouseDown={() => {}}
                      onCellMouseEnter={() => {}}
                      onCellSelect={() => {}}
                      onRemoveAssignment={() => {}}
                      openRoleFor={openRoleForProject}
                      roleAnchorRef={roleAnchorRef}
                      rolesByDept={rolesByDeptForProject}
                      onToggleRole={handleToggleRole}
                      onSelectRole={handleSelectRole}
                      onCloseRole={closeRoleDropdown}
                      onSwapPlaceholder={handleSwapPlaceholder}
                      allowAddAssignment={false}
                      allowRemoveAssignment={false}
                      showProjectActionButtons
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
};

export default MyLeadProjectsGridCard;
