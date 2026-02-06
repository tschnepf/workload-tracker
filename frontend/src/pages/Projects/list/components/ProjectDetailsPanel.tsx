import React from 'react';
import { Link } from 'react-router';
import type { Project, Assignment, Person, AutoHoursTemplate, Department } from '@/types/models';
import StatusBadge, { getStatusColor, formatStatus, editableStatusOptions } from '@/components/projects/StatusBadge';
import ProjectStatusDropdown from '@/components/projects/ProjectStatusDropdown';
import { InlineText, InlineTextarea, InlineDate } from '@/components/ui/InlineEdit';
import ProjectPreDeliverableSettings from '@/components/projects/ProjectPreDeliverableSettings';
import ProjectNotesEditor from '@/components/projects/ProjectNotesEditor';
import { useInlineProjectUpdate } from '@/hooks/useInlineProjectUpdate';
import { useAuth } from '@/hooks/useAuth';
import { useVerticalFilter } from '@/hooks/useVerticalFilter';
import { useVerticals } from '@/hooks/useVerticals';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import { listProjectRoles, type ProjectRole } from '@/roles/api';
import RoleDropdown from '@/roles/components/RoleDropdown';
import AssignmentRow from './AssignmentRow';
import type { OnRoleSelect } from '@/roles/types';
import type { AddAssignmentState } from '@/pages/Projects/list/types';
import { useCellSelection } from '@/pages/Assignments/grid/useCellSelection';
import { useGridKeyboardNavigation } from '@/pages/Assignments/grid/useGridKeyboardNavigation';
import { toWeekHeader } from '@/pages/Assignments/grid/utils';
import { applyHoursToCellsOptimistic } from '@/assignments/updateHoursOptimistic';
import { autoHoursTemplatesApi, projectsApi } from '@/services/api';
import { isAdminOrManager } from '@/utils/roleAccess';

interface Props {
  project: Project;
  statusDropdownOpen: boolean;
  setStatusDropdownOpen: (v: boolean) => void;
  onStatusChange: (status: string) => void;
  onProjectRefetch?: () => Promise<void> | void;
  onDeleteProject?: (id: number) => Promise<void> | void;

  assignments: Assignment[];
  editingAssignmentId: number | null;
  editData: { roleOnProject: string; currentWeekHours: number; roleSearch: string };
  warnings: string[];
  onEditAssignment: (a: Assignment) => void;
  onDeleteAssignment: (assignmentId: number) => void;
  onSaveEdit: (assignmentId: number) => void;
  onCancelEdit: () => void;
  onHoursChange: (hours: number) => void;
  getCurrentWeekHours: (a: Assignment) => number;
  onChangeAssignmentRole?: (assignmentId: number, roleId: number | null, roleName: string | null) => void;
  getPersonDepartmentId?: (personId: number) => number | null;
  getPersonDepartmentName?: (personId: number) => string | null;
  currentWeekKey?: string;
  onUpdateWeekHours?: (assignmentId: number, weekKey: string, hours: number) => Promise<void> | void;
  reloadAssignments: (projectId: number) => Promise<void>;
  invalidateFilterMeta: () => Promise<void>;

  showAddAssignment: boolean;
  onAddAssignment: () => void;
  onSaveAssignment: () => void;
  onCancelAddAssignment: () => void;
  addAssignmentState: AddAssignmentState;
  onPersonSearch: (term: string) => void;
  onPersonSearchFocus: () => void;
  onPersonSearchKeyDown: (e: React.KeyboardEvent) => void;
  srAnnouncement: string;
  personSearchResults: Array<{
    id: number;
    name: string;
    role?: string | null;
    availableHours?: number;
    utilizationPercent?: number;
    hasSkillMatch?: boolean;
  }>;
  selectedPersonIndex: number;
  onPersonSelect: (p: Person) => void;
  onRoleSelectNew: OnRoleSelect;
  onRolePlaceholderSelect: (role: ProjectRole) => void;
  departments: Department[];
  onSwapPlaceholder: (assignmentId: number, person: { id: number; name: string; department?: number | null }) => Promise<void> | void;

  candidatesOnly: boolean;
  setCandidatesOnly: (v: boolean) => void;
  availabilityMap: Record<number, { availableHours: number; utilizationPercent: number; totalHours: number; capacity: number }>;

  deliverablesSlot: React.ReactNode;
}

const ProjectDetailsPanel: React.FC<Props> = ({
  project,
  statusDropdownOpen,
  setStatusDropdownOpen,
  onStatusChange,
  onProjectRefetch,
  assignments,
  editingAssignmentId,
  editData,
  
  warnings,
  onEditAssignment,
  onDeleteAssignment,
  onSaveEdit,
  onCancelEdit,
  onHoursChange,
  getCurrentWeekHours,
  onChangeAssignmentRole,
  getPersonDepartmentId,
  getPersonDepartmentName,
  currentWeekKey,
  onUpdateWeekHours,
  reloadAssignments,
  invalidateFilterMeta,
  showAddAssignment,
  onAddAssignment,
  onSaveAssignment,
  onCancelAddAssignment,
  addAssignmentState,
  onPersonSearch,
  onPersonSearchFocus,
  onPersonSearchKeyDown,
  srAnnouncement,
  personSearchResults,
  selectedPersonIndex,
  onPersonSelect,
  onRoleSelectNew,
  onRolePlaceholderSelect,
  departments,
  onSwapPlaceholder,
  candidatesOnly,
  setCandidatesOnly,
  availabilityMap,
  deliverablesSlot,
  onDeleteProject,
}) => {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [openAddRole, setOpenAddRole] = React.useState(false);
  const addRoleBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const auth = useAuth();
  const { state: verticalState } = useVerticalFilter();
  const { verticals, isLoading: verticalsLoading } = useVerticals({ includeInactive: true });
  const canEdit = !!auth?.accessToken; // general fields editable for signed-in users
  const canEditAutoHoursTemplate = canEdit && isAdminOrManager(auth?.user);
  const { commit } = useInlineProjectUpdate(project.id!);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const clearFieldError = (k: string) => setFieldErrors(prev => { if (!prev[k]) return prev; const n = { ...prev }; delete n[k]; return n; });
  // Local optimistic patch so values show immediately on commit
  const [localPatch, setLocalPatch] = React.useState<Partial<Project>>({});
  React.useEffect(() => { setLocalPatch({}); }, [project.id]);
  const currentVerticalId = (localPatch as any).vertical !== undefined ? (localPatch as any).vertical : (project.vertical ?? null);
  const isVerticalMissing = currentVerticalId != null && !verticals.some(v => v.id === currentVerticalId);
  const refetchProject = React.useCallback(async () => {
    try { await onProjectRefetch?.(); } catch {}
  }, [onProjectRefetch]);
  const commitField = React.useCallback(async (
    field: keyof Project,
    value: any,
    opts?: { onError?: (err: unknown) => void }
  ) => {
    const prevValue = (localPatch as any)[field] !== undefined ? (localPatch as any)[field] : (project as any)[field];
    setLocalPatch(prev => ({ ...prev, [field]: value }));
    try {
      await commit(field, value);
      clearFieldError(String(field));
      setLocalPatch(prev => {
        const next = { ...prev } as Partial<Project>;
        delete (next as any)[field];
        return next;
      });
    } catch (err) {
      setLocalPatch(prev => {
        const next = { ...prev } as Partial<Project>;
        if (prevValue === undefined || prevValue === null) {
          delete (next as any)[field];
        } else {
          (next as any)[field] = prevValue;
        }
        return next;
      });
      try { opts?.onError?.(err); } catch {}
      await refetchProject();
      throw err;
    }
  }, [commit, localPatch, project, refetchProject, clearFieldError]);
  const layoutRef = React.useRef<HTMLDivElement | null>(null);
  const [isNarrowLayout, setIsNarrowLayout] = React.useState(false);
  React.useEffect(() => {
    const el = layoutRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const NARROW_PANE_WIDTH = 640;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = width > 0 && width < NARROW_PANE_WIDTH;
        setIsNarrowLayout(prev => (prev === next ? prev : next));
      });
    });
    observer.observe(el);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Client suggestions state
  const [clientOptions, setClientOptions] = React.useState<string[] | null>(null);
  const [filteredClients, setFilteredClients] = React.useState<string[]>([]);
  const [clientOpen, setClientOpen] = React.useState(false);
  const clientBoxRef = React.useRef<HTMLDivElement | null>(null);
  const [autoHoursTemplates, setAutoHoursTemplates] = React.useState<AutoHoursTemplate[]>([]);
  const [autoHoursTemplatesLoading, setAutoHoursTemplatesLoading] = React.useState(false);
  const [autoHoursTemplatesError, setAutoHoursTemplatesError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (clientBoxRef.current && !clientBoxRef.current.contains(target)) setClientOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setAutoHoursTemplatesLoading(true);
        setAutoHoursTemplatesError(null);
        const list = await autoHoursTemplatesApi.list();
        if (!mounted) return;
        setAutoHoursTemplates(list || []);
      } catch (err) {
        if (!mounted) return;
        setAutoHoursTemplatesError('Failed to load templates');
      } finally {
        if (mounted) setAutoHoursTemplatesLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Determine department for selected person to fetch appropriate role options
  const selectedDeptId = React.useMemo(() => {
    if (!addAssignmentState?.selectedPerson) return null as number | null;
    return getPersonDepartmentId ? getPersonDepartmentId(addAssignmentState.selectedPerson.id) : null;
  }, [addAssignmentState?.selectedPerson, getPersonDepartmentId]);

  const { data: addRoles = [] } = useProjectRoles(selectedDeptId ?? undefined);
  const [rolesByDept, setRolesByDept] = React.useState<Record<number, ProjectRole[]>>({});
  const roleSearchQuery = addAssignmentState.personSearch.trim().toLowerCase();
  const personSearchInputRef = React.useRef<HTMLInputElement | null>(null);
  const [personSearchDropdownAbove, setPersonSearchDropdownAbove] = React.useState(false);
  const roleMatches = React.useMemo(() => {
    if (!roleSearchQuery) return [];
    const matches: Array<{ role: ProjectRole; deptId: number; deptName: string }> = [];
    departments.forEach((dept) => {
      if (dept.id == null) return;
      const roles = rolesByDept[dept.id] || [];
      roles.forEach((role) => {
        if (role.name.toLowerCase().includes(roleSearchQuery)) {
          matches.push({
            role,
            deptId: dept.id as number,
            deptName: dept.shortName || dept.name || `Dept #${dept.id}`,
          });
        }
      });
    });
    return matches;
  }, [departments, roleSearchQuery, rolesByDept]);
  const isPersonSearchOpen = addAssignmentState.personSearch.trim().length > 0
    && (personSearchResults.length > 0 || roleMatches.length > 0);
  React.useEffect(() => {
    if (!showAddAssignment || !isPersonSearchOpen) return;
    const updatePlacement = () => {
      const el = personSearchInputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dropdownHeight = 260;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setPersonSearchDropdownAbove(spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
    };
    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [isPersonSearchOpen, showAddAssignment, personSearchResults.length, roleMatches.length]);
  React.useEffect(() => {
    if (!showAddAssignment) return;
    if (!roleSearchQuery) return;
    const missing = departments.filter((dept) => dept.id != null && !rolesByDept[dept.id]);
    if (missing.length === 0) return;
    missing.forEach((dept) => {
      if (dept.id == null) return;
      listProjectRoles(dept.id)
        .then((roles) => {
          setRolesByDept((prev) => (prev[dept.id as number] ? prev : { ...prev, [dept.id as number]: roles }));
        })
        .catch(() => {});
    });
  }, [departments, roleSearchQuery, rolesByDept, showAddAssignment]);
  // Build week keys from assignment data to avoid TZ drift and mismatches.
  // Prefer the next 4 assignment week keys >= baseline; fallback to local Monday +3.
  const weekKeys = React.useMemo(() => {
    // Always render a consistent 6-week window anchored to the current week (Monday)
    const base = currentWeekKey ? new Date(currentWeekKey.replace(/-/g, '/') + ' 00:00:00') : new Date();
    const monday = new Date(base);
    const dow = monday.getDay();
    monday.setDate(monday.getDate() - ((dow + 6) % 7));
    const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return [0, 7, 14, 21, 28, 35].map(off => { const d = new Date(monday); d.setDate(d.getDate() + off); return fmt(d); });
  }, [currentWeekKey]);

  // Selection model reused from Assignments grid
  const rowOrder = React.useMemo(() => assignments.map(a => String(a.id)), [assignments]);
  const selection = useCellSelection(weekKeys, rowOrder);
  const [editingCell, setEditingCell] = React.useState<{ personId: number; assignmentId: number; week: string } | null>(null);
  const [editingValue, setEditingValue] = React.useState<string>('');
  const [optimisticHours, setOptimisticHours] = React.useState<Map<number, Record<string, number>>>(new Map());

  const isCellSelected = (assignmentId: number, weekKey: string) => selection.isCellSelected(String(assignmentId), weekKey);
  const isEditingCell = (assignmentId: number, weekKey: string) => editingCell?.assignmentId === assignmentId && editingCell?.week === weekKey;
  const onCellMouseDown = (assignmentId: number, weekKey: string) => selection.onCellMouseDown(String(assignmentId), weekKey);
  const onCellMouseEnter = (assignmentId: number, weekKey: string) => selection.onCellMouseEnter(String(assignmentId), weekKey);
  const onCellSelect = (assignmentId: number, weekKey: string, isShift: boolean) => selection.onCellSelect(String(assignmentId), weekKey, isShift);
  const onEditStartCell = (assignmentId: number, weekKey: string, currentValue: string) => {
    const a = assignments.find(x => x.id === assignmentId);
    setEditingCell({ personId: a?.person || 0, assignmentId, week: weekKey });
    setEditingValue(currentValue);
  };
  const onEditCancelCell = () => { setEditingCell(null); };
  const onEditSaveCell = async () => {
    if (!editingCell) return;
    const value = parseFloat(editingValue);
    if (Number.isNaN(value)) { setEditingCell(null); return; }
    const selectedCells = selection.getSelectedCells();
    const cells = selectedCells.length > 0
      ? selectedCells.map(c => ({ assignmentId: Number(c.rowKey), weekKey: c.weekKey }))
      : [{ assignmentId: editingCell.assignmentId, weekKey: editingCell.week }];

    // Local optimistic snapshot maps for current visible assignments
    const baseMaps = new Map<number, Record<string, number>>();
    assignments.forEach(a => baseMaps.set(a.id!, { ...(a.weeklyHours || {}) }));
    const getMap = (assignmentId: number) => baseMaps.get(assignmentId) || {};
    const applyLocally = (updates: Map<number, Record<string, number>>) => {
      // merge into optimistic state used by rows for display
      setOptimisticHours(prev => {
        const next = new Map(prev);
        updates.forEach((map, aid) => {
          next.set(aid, { ...map });
        });
        return next;
      });
    };
    const revertLocally = (prev: Map<number, Record<string, number>>) => {
      setOptimisticHours(new Map(prev));
    };
    const afterSuccess = async () => {
      try {
        await reloadAssignments(project.id!);
        await invalidateFilterMeta();
        setOptimisticHours(new Map());
      } catch {}
    };

    try {
      await applyHoursToCellsOptimistic({ cells, value, getMap, applyLocally, revertLocally, afterSuccess });
    } finally {
      setEditingCell(null);
      selection.clearSelection();
    }
  };
  const onEditValueChangeCell = (v: string) => setEditingValue(v);

  // Keyboard typing to start edit + arrow/tab nav similar to grid
  const weeksHeader = React.useMemo(() => toWeekHeader(weekKeys), [weekKeys]);
  const selectedCellForKb = React.useMemo(() => {
    const sc = selection.selectedCell;
    if (!sc) return null as any;
    const aid = Number(sc.rowKey);
    const a = assignments.find(x => x.id === aid);
    return a ? { personId: a.person, assignmentId: aid, week: sc.weekKey } : null;
  }, [selection.selectedCell, assignments]);
  useGridKeyboardNavigation({
    selectedCell: selectedCellForKb,
    editingCell,
    isAddingAssignment: false,
    weeks: weeksHeader,
    csSelect: (rowKey, wk, isShift) => selection.onCellSelect(rowKey, wk, isShift),
    setEditingCell: ({ personId, assignmentId, week }) => setEditingCell({ personId, assignmentId, week }),
    setEditingValue: (val) => setEditingValue(val),
    findAssignment: (personId, assignmentId) => assignments.some(a => a.id === assignmentId && a.person === personId),
  });

  const departmentNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => {
      if (dept.id != null) {
        map.set(dept.id, dept.name || dept.shortName || `Dept #${dept.id}`);
      }
    });
    return map;
  }, [departments]);

  // Pre-group assignments by department to simplify JSX (supports role placeholders)
  const departmentEntries = React.useMemo(() => {
    const groups = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const deptId = (a as any).personDepartmentId as number | null | undefined;
      const personDeptName = a.person != null && getPersonDepartmentName ? getPersonDepartmentName(a.person) : null;
      const name = deptId != null
        ? (departmentNameById.get(deptId) || personDeptName || `Dept #${deptId}`)
        : (personDeptName || 'Unassigned');
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(a);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assignments, departmentNameById, getPersonDepartmentName]);

  const selectedAutoHoursTemplateId =
    (localPatch.autoHoursTemplateId !== undefined ? localPatch.autoHoursTemplateId : project.autoHoursTemplateId) ?? null;
  const selectedAutoHoursTemplateName =
    autoHoursTemplates.find(t => t.id === selectedAutoHoursTemplateId)?.name
    ?? (selectedAutoHoursTemplateId ? `Template #${selectedAutoHoursTemplateId}` : 'Global default');
  const isAutoHoursTemplateMissing =
    !!selectedAutoHoursTemplateId && !autoHoursTemplates.some(t => t.id === selectedAutoHoursTemplateId);

  return (
    <>
      <div className="px-2 py-4 border-b border-[var(--border)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-[var(--text)] mb-1">
              <InlineText
                value={localPatch.name ?? project.name}
                onCommit={async (v) => {
                  const nv = (v ?? '').toString();
                  await commitField('name', nv, {
                    onError: (e) => setFieldErrors(prev => ({ ...prev, name: (e as any)?.message || 'Failed to update name' }))
                  });
                }}
                onStartEdit={() => clearFieldError('name')}
                onDraftChange={() => clearFieldError('name')}
                ariaLabel="Edit project name"
                disabled={!canEdit}
              />
            </h2>
            {fieldErrors.name && (<div className="text-red-400 text-xs">{fieldErrors.name}</div>)}
          </div>
          <div className="flex flex-col items-start gap-2 w-full sm:w-auto sm:min-w-[180px]">
            <Link
              to={`/projects/${project.id}/dashboard`}
              className="inline-flex items-center text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
            >
              Open Dashboard
            </Link>
            <div>
              <div className="text-[var(--muted)] text-xs">Status:</div>
              <ProjectStatusDropdown
                status={project.status || ''}
                isOpen={statusDropdownOpen}
                setOpen={setStatusDropdownOpen}
                onChange={(s) => onStatusChange(s)}
              />
            </div>
            {onDeleteProject && (
              confirmingDelete ? (
                <div className="flex flex-col md:flex-row items-start gap-2">
                  <button
                    disabled={isDeleting}
                    onClick={async () => {
                      const ok = window.confirm('This will permanently delete the project and its data. Are you sure?');
                      if (!ok) return;
                      try {
                        setIsDeleting(true);
                        await onDeleteProject(project.id!);
                      } finally {
                        setIsDeleting(false);
                        setConfirmingDelete(false);
                      }
                    }}
                    className="px-2 py-0.5 text-xs rounded border bg-red-600/20 border-red-500/50 text-red-300 hover:bg-red-600/30 transition-colors disabled:opacity-50 self-start"
                    aria-label="Confirm Delete Project"
                    title="Permanently delete this project"
                  >
                    {isDeleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    disabled={isDeleting}
                    onClick={() => setConfirmingDelete(false)}
                    className="px-2 py-0.5 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors self-start"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="px-2 py-0.5 text-xs rounded border bg-transparent border-red-500/50 text-red-300 hover:bg-red-600/20 transition-colors self-start"
                  aria-label="Delete Project"
                  title="Delete this project"
                >
                  Delete
                </button>
              )
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm" style={{ gridTemplateColumns: 'minmax(320px,1fr) 1fr' }}>
              <div>
                <div className="text-[var(--muted)] text-xs">Client:</div>
                <div className="text-[var(--text)] relative" ref={clientBoxRef}>
                  <InlineText
                    value={(localPatch.client ?? project.client) || ''}
                    onCommit={async (v) => {
                      const nv = (v ?? '').toString();
                      await commitField('client', nv);
                      setClientOpen(false);
                    }}
                    onStartEdit={async () => {
                      clearFieldError('client');
                      try {
                        if (!clientOptions) {
                          const list = await projectsApi.getClients({ vertical: verticalState.selectedVerticalId ?? undefined });
                          setClientOptions(list);
                          setFilteredClients(list);
                        } else {
                          setFilteredClients(clientOptions);
                        }
                        setClientOpen(true);
                      } catch {}
                    }}
                    onDraftChange={(val) => {
                      clearFieldError('client');
                      const s = (val ?? '').toString().toLowerCase();
                      const base = clientOptions || [];
                      const next = s ? base.filter(c => c.toLowerCase().includes(s)) : base;
                      setFilteredClients(next);
                      setClientOpen(true);
                    }}
                    placeholder="No Client"
                    ariaLabel="Edit client"
                    disabled={!canEdit}
                  />
                  {clientOpen && filteredClients.length > 0 && (
                    <div className="absolute z-50 mt-1 left-0 right-0 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg max-h-48 overflow-auto">
                      {filteredClients.slice(0, 30).map((name) => (
                        <button
                          key={name}
                          type="button"
                          className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] text-[var(--text)]"
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onClick={async () => { await commitField('client', name); setClientOpen(false); }}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {fieldErrors.client && (<div className="text-red-400 text-xs mt-1">{fieldErrors.client}</div>)}
              </div>
              <div>
                <div className="text-[var(--muted)] text-xs">No:</div>
                <div className="text-[var(--text)]">
                  <InlineText
                    value={(localPatch.projectNumber ?? project.projectNumber) || ''}
                    onCommit={async (v) => {
                      const nv = (v ?? '').toString();
                      await commitField('projectNumber', nv, {
                        onError: () => setFieldErrors(prev => ({ ...prev, projectNumber: 'Project Number must be unique' }))
                      });
                    }}
                    onStartEdit={() => clearFieldError('projectNumber')}
                    onDraftChange={() => clearFieldError('projectNumber')}
                    placeholder="-"
                    ariaLabel="Edit project number"
                    disabled={!canEdit}
                  />
                </div>
                {fieldErrors.projectNumber && (<div className="text-red-400 text-xs mt-1">{fieldErrors.projectNumber}</div>)}
              </div>
              <div>
                <div className="text-[var(--muted)] text-xs">Vertical:</div>
                <div className="flex items-center gap-2">
                  <select
                    className="min-w-[220px] bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-sm focus:border-[var(--primary)] disabled:opacity-60"
                    value={currentVerticalId ?? ''}
                    onChange={async (e) => {
                      const next = e.target.value ? Number(e.target.value) : null;
                      await commitField('vertical', next);
                    }}
                    disabled={!canEdit || verticalsLoading}
                    aria-label="Project vertical"
                  >
                    <option value="">{verticalsLoading ? 'Loading verticals...' : 'Select vertical'}</option>
                    {isVerticalMissing && currentVerticalId != null && (
                      <option value={currentVerticalId}>Unknown vertical</option>
                    )}
                    {verticals.map((vertical) => (
                      <option key={vertical.id} value={vertical.id}>
                        {vertical.shortName ? `${vertical.name} (${vertical.shortName})` : vertical.name}
                      </option>
                    ))}
                  </select>
                  {!canEdit && (
                    <span className="text-xs text-[var(--muted)]">
                      {project.verticalName || '—'}
                    </span>
                  )}
                  {verticalsLoading && (
                    <span className="text-xs text-[var(--muted)]">Loading…</span>
                  )}
                </div>
                {fieldErrors.vertical && (<div className="text-red-400 text-xs mt-1">{fieldErrors.vertical}</div>)}
              </div>
            </div>
            {/* Description */}
            <div className="mt-3">
              <div className="text-[var(--muted)] text-xs mb-1">Description:</div>
              <InlineTextarea
                value={(localPatch.description ?? project.description) || ''}
                onCommit={async (v) => {
                  const nv = (v ?? '').toString();
                  await commitField('description', nv);
                }}
                onStartEdit={() => clearFieldError('description')}
                onDraftChange={() => clearFieldError('description')}
                placeholder="Add a short description"
                ariaLabel="Edit project description"
                disabled={!canEdit}
                rows={3}
                className="text-[var(--text)]"
              />
              {fieldErrors.description && (<div className="text-red-400 text-xs mt-1">{fieldErrors.description}</div>)}
            </div>
            {/* Start Date & Estimated Hours */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <div className="text-[var(--muted)] text-xs mb-1">Start Date:</div>
                <InlineDate
                  value={(localPatch.startDate ?? project.startDate) || null}
                  onCommit={async (v) => {
                    await commitField('startDate', v || null);
                  }}
                  onStartEdit={() => clearFieldError('startDate')}
                  onDraftChange={() => clearFieldError('startDate')}
                  placeholder="—"
                  ariaLabel="Edit start date"
                  disabled={!canEdit}
                />
                {fieldErrors.startDate && (<div className="text-red-400 text-xs mt-1">{fieldErrors.startDate}</div>)}
              </div>
              <div>
                <div className="text-[var(--muted)] text-xs mb-1">Estimated Hours:</div>
                <InlineText
                  value={typeof (localPatch.estimatedHours ?? project.estimatedHours) === 'number' ? String(localPatch.estimatedHours ?? project.estimatedHours) : ''}
                  onCommit={async (v) => {
                    const n = (v ?? '').toString().trim()
                    const parsed = n === '' ? undefined : Math.max(0, Math.floor(Number(n)))
                    if (n !== '' && Number.isNaN(parsed)) return
                    await commitField('estimatedHours', parsed as any)
                  }}
                  onStartEdit={() => clearFieldError('estimatedHours')}
                  onDraftChange={() => clearFieldError('estimatedHours')}
                  placeholder="—"
                  ariaLabel="Edit estimated hours"
                  disabled={!canEdit}
                />
                {fieldErrors.estimatedHours && (<div className="text-red-400 text-xs mt-1">{fieldErrors.estimatedHours}</div>)}
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[var(--muted)] text-xs mb-1">Project Template:</div>
              <div className="flex items-center gap-2">
                <select
                  className="min-w-[220px] bg-[var(--card)] border border-[var(--border)] text-[var(--text)] rounded px-2 py-1 text-sm focus:border-[var(--primary)] disabled:opacity-60"
                  value={selectedAutoHoursTemplateId ?? ''}
                  onChange={async (e) => {
                    const next = e.target.value ? Number(e.target.value) : null;
                    await commitField('autoHoursTemplateId', next);
                  }}
                  disabled={!canEditAutoHoursTemplate || autoHoursTemplatesLoading}
                  aria-label="Auto hours template"
                >
                  <option value="">Global default</option>
                  {isAutoHoursTemplateMissing && selectedAutoHoursTemplateId && (
                    <option value={selectedAutoHoursTemplateId}>{selectedAutoHoursTemplateName}</option>
                  )}
                  {autoHoursTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                {!canEditAutoHoursTemplate && (
                  <span className="text-xs text-[var(--muted)]">{selectedAutoHoursTemplateName}</span>
                )}
                {autoHoursTemplatesLoading && (
                  <span className="text-xs text-[var(--muted)]">Loading…</span>
                )}
              </div>
              {autoHoursTemplatesError && (
                <div className="text-red-400 text-xs mt-1">{autoHoursTemplatesError}</div>
              )}
            </div>
      </div>

      <div className="p-4">
        <div className="flex items-center justify-end mb-2">
          <button
            onClick={onAddAssignment}
            className="px-2 py-0.5 text-xs rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] transition-colors"
          >
            + Add Assignment
          </button>
        </div>
        {/* Hours are temporarily hidden on Project Details page */}

        {/* Responsive layout: columns when wide, single stack when pane is narrow */}
        <div
          ref={layoutRef}
          className="grid gap-4 items-start"
          style={{
            gridTemplateColumns: isNarrowLayout ? '1fr' : '2fr 1fr',
            gridTemplateAreas: isNarrowLayout
              ? '"deliverables" "assignments" "notes" "predeliverables"'
              : '"deliverables assignments" "notes assignments" "predeliverables assignments"',
          }}
        >
          <div className="min-w-0" style={{ gridArea: 'deliverables' }}>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded shadow-sm p-2 overflow-hidden">
              {deliverablesSlot}
            </div>
          </div>

          <div className="flex flex-col gap-4 min-w-0" style={{ gridArea: 'assignments' }}>
            {departmentEntries.length > 0 ? (
              departmentEntries.map(([deptName, items]) => (
                <div key={deptName} className="bg-[var(--card)] border border-[var(--border)] rounded shadow-sm overflow-hidden min-w-0">
                  <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between">
                    <div className="text-base font-semibold text-[var(--text)]">{deptName}</div>
                  </div>
                  <div className="p-2 space-y-2">
                    {items.map((assignment) => (
                      <div key={assignment.id}>
                        <AssignmentRow
                          assignment={assignment}
                          isEditing={editingAssignmentId === assignment.id}
                          editData={editData}
                          showHours={false}
                          onEdit={() => onEditAssignment(assignment)}
                          onDelete={() => assignment.id && onDeleteAssignment(assignment.id)}
                          onSave={() => assignment.id && onSaveEdit(assignment.id)}
                          onCancel={onCancelEdit}
                          onHoursChange={onHoursChange}
                          getCurrentWeekHours={getCurrentWeekHours}
                          onChangeAssignmentRole={onChangeAssignmentRole}
                          personDepartmentId={
                            (assignment as any).personDepartmentId
                            ?? (getPersonDepartmentId && assignment.person != null ? getPersonDepartmentId(assignment.person) : undefined)
                          }
                          currentWeekKey={currentWeekKey}
                          onUpdateWeekHours={onUpdateWeekHours}
                          weekKeys={weekKeys}
                          isCellSelected={isCellSelected}
                          isEditingCell={isEditingCell}
                          onCellSelect={onCellSelect}
                          onCellMouseDown={onCellMouseDown}
                          onCellMouseEnter={onCellMouseEnter}
                          onEditStartCell={onEditStartCell}
                          onEditSaveCell={onEditSaveCell}
                          onEditCancelCell={onEditCancelCell}
                          editingValue={editingValue}
                          onEditValueChangeCell={onEditValueChangeCell}
                          optimisticHours={optimisticHours}
                          onSwapPlaceholder={onSwapPlaceholder}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : !showAddAssignment ? (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded shadow-sm p-3 text-center">
                <div className="text-[var(--muted)] text-sm">No assignments yet</div>
                <div className="text-[var(--muted)] text-xs mt-1">Click "Add Assignment" to get started</div>
              </div>
            ) : null}
            {showAddAssignment && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded shadow-sm p-3">
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div className="text-[var(--muted)] text-xs uppercase font-medium">PERSON</div>
                  <div className="text-[var(--muted)] text-xs uppercase font-medium">ROLE</div>
                  <div className="text-[var(--muted)] text-xs uppercase font-medium">ACTIONS</div>
                </div>
                <div className="relative">
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Start typing name or role..."
                        value={addAssignmentState.personSearch}
                        onChange={(e) => onPersonSearch(e.target.value)}
                        onFocus={onPersonSearchFocus}
                        onKeyDown={onPersonSearchKeyDown}
                        role="combobox"
                        aria-expanded={isPersonSearchOpen}
                        aria-haspopup="listbox"
                        aria-owns="person-search-results"
                        aria-describedby="person-search-help"
                        className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                        autoFocus
                        ref={personSearchInputRef}
                      />
                      <div id="person-search-help" className="sr-only">
                        Search for people to assign to this project. Use arrow keys to navigate results.
                      </div>
                      <div aria-live="polite" aria-atomic="true" className="sr-only">
                        {srAnnouncement}
                      </div>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenAddRole((v) => !v)}
                        className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-left text-[var(--text)] hover:bg-[var(--cardHover)]"
                        aria-haspopup="listbox"
                        aria-expanded={openAddRole}
                        ref={addRoleBtnRef}
                      >
                        {addAssignmentState.roleOnProject || 'Set role'}
                      </button>
                      {openAddRole && (
                        <RoleDropdown
                          roles={addRoles as any}
                          currentId={null}
                          onSelect={(id, name) => { onRoleSelectNew(id, name); }}
                          onClose={() => setOpenAddRole(false)}
                          labelledById={undefined}
                          anchorRef={addRoleBtnRef}
                        />
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={onSaveAssignment}
                        disabled={!addAssignmentState.selectedPerson && !addAssignmentState.roleOnProjectId}
                        className="px-2 py-1 text-xs rounded border bg-[var(--primary)] border-[var(--primary)] text-white hover:bg-[var(--primaryHover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={onCancelAddAssignment}
                        className="px-2 py-1 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {isPersonSearchOpen && (
                    <div className={`absolute left-0 right-0 z-50 ${personSearchDropdownAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                      <div id="person-search-results" role="listbox" className="bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg max-h-56 overflow-y-auto">
                        {personSearchResults.length > 0 && (
                          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            People
                          </div>
                        )}
                        {personSearchResults.map((person: any, index: number) => (
                          <button
                            key={person.id}
                            onClick={() => onPersonSelect(person)}
                            className={`w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0 ${
                              selectedPersonIndex === index ? 'bg-[var(--surfaceOverlay)] border-[var(--primary)]' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{person.name}</div>
                              {person.hasSkillMatch && (
                                <span className="text-xs px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Skill Match</span>
                              )}
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="text-[var(--muted)]">{person.role}</div>
                              {person.availableHours !== undefined && (
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-1 py-0.5 rounded ${
                                    person.utilizationPercent! > 100
                                      ? 'text-red-400 bg-red-500/20'
                                      : person.utilizationPercent! > 85
                                      ? 'text-amber-400 bg-amber-500/20'
                                      : person.availableHours > 0
                                      ? 'text-emerald-400 bg-emerald-500/20'
                                      : 'text-blue-400 bg-blue-500/20'
                                  }`}>
                                    {person.availableHours}h available
                                  </span>
                                  <span className="text-[var(--muted)] text-xs">({person.utilizationPercent}% used)</span>
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                        {roleMatches.length > 0 && (
                          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                            Roles
                          </div>
                        )}
                        {roleMatches.map((match) => (
                          <button
                            key={`${match.deptId}-${match.role.id}`}
                            onClick={() => onRolePlaceholderSelect(match.role)}
                            className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{`<${match.role.name}>`}</div>
                              <div className="text-[10px] text-[var(--muted)]">{match.deptName}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0" style={{ gridArea: 'notes' }}>
            <ProjectNotesEditor
              projectId={project.id!}
              initialJson={(project as any).notesJson as any}
              initialHtml={(localPatch as any).notes ?? (project as any).notes}
              canEdit={canEdit}
            />
          </div>

          <div className="min-w-0" style={{ gridArea: 'predeliverables' }}>
            <ProjectPreDeliverableSettings projectId={project.id || null} />
          </div>
        </div>
        </div>
        
      
    </>
  );
};

export default ProjectDetailsPanel;
