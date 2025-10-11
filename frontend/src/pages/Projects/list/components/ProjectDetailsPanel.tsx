import React from 'react';
import type { Project, Assignment, Person } from '@/types/models';
import StatusBadge, { getStatusColor, formatStatus, editableStatusOptions } from '@/components/projects/StatusBadge';
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

  assignments: Assignment[];
  editingAssignmentId: number | null;
  editData: { roleOnProject: string; currentWeekHours: number; roleSearch: string };
  roleSearchResults: string[];
  warnings: string[];
  onEditAssignment: (a: Assignment) => void;
  onDeleteAssignment: (assignmentId: number) => void;
  onSaveEdit: (assignmentId: number) => void;
  onCancelEdit: () => void;
  onRoleSearch: (term: string) => void;
  onRoleSelect: (role: string) => void;
  onHoursChange: (hours: number) => void;
  getCurrentWeekHours: (a: Assignment) => number;
  onChangeAssignmentRole?: (assignmentId: number, roleId: number | null, roleName: string | null) => void;
  getPersonDepartmentId?: (personId: number) => number | null;
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
  roleSearchResultsNew: string[];
  onRoleSearchNew: (term: string) => void;
  onRoleSelectNew: (role: string) => void;

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
  roleSearchResults,
  warnings,
  onEditAssignment,
  onDeleteAssignment,
  onSaveEdit,
  onCancelEdit,
  onRoleSearch,
  onRoleSelect,
  onHoursChange,
  getCurrentWeekHours,
  onChangeAssignmentRole,
  getPersonDepartmentId,
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
  roleSearchResultsNew,
  onRoleSearchNew,
  onRoleSelectNew,
  candidatesOnly,
  setCandidatesOnly,
  availabilityMap,
  deliverablesSlot,
}) => {
  // Build week keys (current + next 3 Mondays)
  const weekKeys = React.useMemo(() => {
    if (!currentWeekKey) return [] as string[];
    const base = new Date(currentWeekKey + 'T00:00:00');
    const addDays = (d: number) => { const dt = new Date(base); dt.setDate(dt.getDate() + d); return dt.toISOString().split('T')[0]; };
    return [0, 7, 14, 21].map(addDays);
  }, [currentWeekKey]);

  // Selection model reused from Assignments grid
  const rowOrder = React.useMemo(() => assignments.map(a => String(a.id)), [assignments]);
  const selection = useCellSelection(weekKeys, rowOrder);
  const [editingCell, setEditingCell] = React.useState<{ personId: number; assignmentId: number; week: string } | null>(null);
  const [editingValue, setEditingValue] = React.useState<string>('');

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
      updates.forEach((map, aid) => baseMaps.set(aid, { ...map }));
      setEditingValue(prev => prev);
    };
    const revertLocally = (prev: Map<number, Record<string, number>>) => {
      prev.forEach((map, aid) => baseMaps.set(aid, { ...map }));
      setEditingValue(prev => prev);
    };
    const afterSuccess = async () => {
      try {
        await reloadAssignments(project.id!);
        await invalidateFilterMeta();
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

  return (
    <>
      <div className="p-4 border-b border-[var(--border)]">
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
                <div className="relative status-dropdown-container">
                  <button
                    onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                    className={`${getStatusColor(project.status || '')} hover:bg-[var(--surfaceHover)] px-2 py-1 rounded text-sm transition-colors cursor-pointer flex items-center gap-1`}
                  >
                    {formatStatus(project.status || '')}
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
                  </button>
                  {statusDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg z-50 min-w-[120px]">
                      {editableStatusOptions.map((status) => (
                        <button
                          key={status}
                          onClick={() => onStatusChange(status)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--cardHover)] transition-colors first:rounded-t last:rounded-b ${
                            project.status === status ? 'bg-[var(--surfaceOverlay)]' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <StatusBadge status={status} />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[var(--muted)] text-xs">Project Number:</div>
                <div className="text-[var(--text)]">{project.projectNumber || 'No Number'}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* actions in parent if needed */}
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[var(--muted)] text-xs">Team Members only</div>
          <button
            onClick={onAddAssignment}
            className="px-2 py-0.5 text-xs rounded border bg-[var(--card)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--cardHover)] transition-colors"
          >
            + Add Assignment
          </button>
        </div>

        <div className="space-y-2">
          {assignments.length > 0 ? (
            assignments.map((assignment) => (
              <div key={assignment.id}>
                <AssignmentRow
                  assignment={assignment}
                  isEditing={editingAssignmentId === assignment.id}
                  editData={editData}
                  roleSearchResults={roleSearchResults}
                  onEdit={() => onEditAssignment(assignment)}
                  onDelete={() => assignment.id && onDeleteAssignment(assignment.id)}
                  onSave={() => assignment.id && onSaveEdit(assignment.id)}
                  onCancel={onCancelEdit}
                  onRoleSearch={onRoleSearch}
                  onRoleSelect={onRoleSelect}
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
                />
              </div>
            ))
          ) : !showAddAssignment ? (
            <div className="text-center py-8">
              <div className="text-[var(--muted)] text-sm">No assignments yet</div>
              <div className="text-[var(--muted)] text-xs mt-1">Click "Add Assignment" to get started</div>
            </div>
          ) : null}

          {showAddAssignment && (
            <div className="p-3 bg-[var(--surfaceOverlay)] rounded border border-[var(--border)]">
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
                              <span className="text-xs px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">dYZ_ Skill Match</span>
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
                  <input
                    type="text"
                    placeholder="Role on project..."
                    value={addAssignmentState.roleSearch}
                    onChange={(e) => onRoleSearchNew(e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
                  />
                  {roleSearchResultsNew.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                      {roleSearchResultsNew.map((role) => (
                        <button
                          key={role}
                          onClick={() => onRoleSelectNew(role)}
                          className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0"
                        >
                          {role}
                        </button>
                      ))}
                    </div>
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
      </div>

      <div className="p-4">{deliverablesSlot}</div>
    </>
  );
};

export default ProjectDetailsPanel;
