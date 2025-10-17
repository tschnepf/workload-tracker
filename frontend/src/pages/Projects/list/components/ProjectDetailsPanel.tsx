import React from 'react';
import { Link } from 'react-router';
import type { Project, Assignment, Person } from '@/types/models';
import StatusBadge, { getStatusColor, formatStatus, editableStatusOptions } from '@/components/projects/StatusBadge';
import ProjectStatusDropdown from '@/components/projects/ProjectStatusDropdown';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import RoleDropdown from '@/roles/components/RoleDropdown';
import AssignmentRow from './AssignmentRow';
import type { AddAssignmentState } from '@/pages/Projects/list/types';
import { useCellSelection } from '@/pages/Assignments/grid/useCellSelection';
import { useGridKeyboardNavigation } from '@/pages/Assignments/grid/useGridKeyboardNavigation';
import { toWeekHeader } from '@/pages/Assignments/grid/utils';
import { applyHoursToCellsOptimistic } from '@/assignments/updateHoursOptimistic';

interface Props {
  project: Project;
  statusDropdownOpen: boolean;
  setStatusDropdownOpen: (v: boolean) => void;
  onStatusChange: (status: string) => void;
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
  onRoleSelectNew: (roleId: number | null, roleName: string | null) => void;

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
  candidatesOnly,
  setCandidatesOnly,
  availabilityMap,
  deliverablesSlot,
  onDeleteProject,
}) => {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [openAddRole, setOpenAddRole] = React.useState(false);

  // Determine department for selected person to fetch appropriate role options
  const selectedDeptId = React.useMemo(() => {
    if (!addAssignmentState?.selectedPerson) return null as number | null;
    return getPersonDepartmentId ? getPersonDepartmentId(addAssignmentState.selectedPerson.id) : null;
  }, [addAssignmentState?.selectedPerson, getPersonDepartmentId]);

  const { data: addRoles = [] } = useProjectRoles(selectedDeptId ?? undefined);
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
    const cells = selection.selectedCells.length > 0
      ? selection.selectedCells.map(c => ({ assignmentId: Number(c.rowKey), weekKey: c.weekKey }))
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

  // Pre-group assignments by department to simplify JSX
  const departmentEntries = React.useMemo(() => {
    const groups = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const name = (getPersonDepartmentName ? getPersonDepartmentName(a.person) : null) || 'Unassigned';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name)!.push(a);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [assignments, getPersonDepartmentName]);

  return (
    <>
      <div className="px-2 py-4 border-b border-[var(--border)]">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-xl font-bold text-[var(--text)] mb-2">{project.name}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[var(--muted)] text-xs">Client:</div>
                <div className="text-[var(--text)]">{project.client || 'No Client'}</div>
              </div>
              <div>
                <div className="text-[var(--muted)] text-xs">Status:</div>
                <div>
                  <ProjectStatusDropdown
                    status={project.status || ''}
                    isOpen={statusDropdownOpen}
                    setOpen={setStatusDropdownOpen}
                    onChange={(s) => onStatusChange(s)}
                  />
                </div>
              </div>
              <div>
                <div className="text-[var(--muted)] text-xs">Project Number:</div>
                <div className="text-[var(--text)]">{project.projectNumber || 'No Number'}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/projects/${project.id}/edit`}>
              <button
                className="px-2 py-0.5 text-xs rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] transition-colors"
                aria-label="Edit Project"
              >
                Edit
              </button>
            </Link>
            {onDeleteProject && (
              confirmingDelete ? (
                <>
                  <button
                    disabled={isDeleting}
                    onClick={async () => {
                      // Second confirmation to avoid accidental deletion
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
                    className="px-2 py-0.5 text-xs rounded border bg-red-600/20 border-red-500/50 text-red-300 hover:bg-red-600/30 transition-colors disabled:opacity-50"
                    aria-label="Confirm Delete Project"
                    title="Permanently delete this project"
                  >
                    {isDeleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    disabled={isDeleting}
                    onClick={() => setConfirmingDelete(false)}
                    className="px-2 py-0.5 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="px-2 py-0.5 text-xs rounded border bg-transparent border-red-500/50 text-red-300 hover:bg-red-600/20 transition-colors"
                  aria-label="Delete Project"
                  title="Delete this project"
                >
                  Delete
                </button>
              )
            )}
          </div>
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

        {/* Responsive layout: 2 columns where left = Deliverables (2fr) and right = stacked department cards (1fr) */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] xl:grid-cols-[2fr_1fr] gap-4">
          {/* Left column: Deliverables */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded shadow-sm p-2 self-start min-w-0 overflow-hidden">
            {deliverablesSlot}
          </div>

          {/* Right column: stack department cards vertically */}
          <div className="flex flex-col gap-4 min-w-0">
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
                          personDepartmentId={getPersonDepartmentId ? getPersonDepartmentId(assignment.person) : undefined}
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
          </div>
        </div>

          {showAddAssignment && (
            <div className="p-3 bg-[var(--surfaceOverlay)] rounded border border-[var(--border)] mt-2">
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="text-[var(--muted)] text-xs uppercase font-medium">PERSON</div>
                <div className="text-[var(--muted)] text-xs uppercase font-medium">ROLE</div>
                <div className="text-[var(--muted)] text-xs uppercase font-medium">ACTIONS</div>
              </div>
              <div className="grid grid-cols-3 gap-4 items-center">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Start typing name or click to see all..."
                    value={addAssignmentState.personSearch}
                    onChange={(e) => onPersonSearch(e.target.value)}
                    onFocus={onPersonSearchFocus}
                    onKeyDown={onPersonSearchKeyDown}
                    role="combobox"
                    aria-expanded={personSearchResults.length > 0}
                    aria-haspopup="listbox"
                    aria-owns="person-search-results"
                    aria-describedby="person-search-help"
                    className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                    autoFocus
                  />
                  <div id="person-search-help" className="sr-only">
                    Search for people to assign to this project. Use arrow keys to navigate results.
                  </div>
                  <div aria-live="polite" aria-atomic="true" className="sr-only">
                    {srAnnouncement}
                  </div>
                  {personSearchResults.length > 0 && (
                    <div id="person-search-results" role="listbox" className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg z-50 max-h-32 overflow-y-auto">
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
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenAddRole((v) => !v)}
                    className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-left text-[var(--text)] hover:bg-[var(--cardHover)]"
                    aria-haspopup="listbox"
                    aria-expanded={openAddRole}
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
                    />
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={onSaveAssignment}
                    disabled={!addAssignmentState.selectedPerson}
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
            </div>
          )}
        </div>
      
    </>
  );
};

export default ProjectDetailsPanel;
