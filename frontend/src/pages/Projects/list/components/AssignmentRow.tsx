import React from 'react';
import type { Assignment, Deliverable, Person, ProjectTask } from '@/types/models';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import RoleDropdown from '@/roles/components/RoleDropdown';
import WeekCell from '@/pages/Assignments/grid/components/WeekCell';
import PlaceholderPersonSwap from '@/components/assignments/PlaceholderPersonSwap';

export interface AssignmentRowProps {
  assignment: Assignment;
  isEditing: boolean;
  editData: {
    roleOnProject: string;
    currentWeekHours: number;
    roleSearch: string;
  };
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  onHoursChange: (hours: number) => void;
  getCurrentWeekHours: (assignment: Assignment) => number;
  onChangeAssignmentRole?: (assignmentId: number, roleId: number | null, roleName: string | null) => void;
  personDepartmentId?: number | null;
  currentWeekKey?: string;
  onUpdateWeekHours?: (assignmentId: number, weekKey: string, hours: number) => Promise<void> | void;
  weekKeys?: string[];
  isCellSelected?: (assignmentId: number, weekKey: string) => boolean;
  isEditingCell?: (assignmentId: number, weekKey: string) => boolean;
  onCellSelect?: (assignmentId: number, weekKey: string, isShift: boolean) => void;
  onCellMouseDown?: (assignmentId: number, weekKey: string) => void;
  onCellMouseEnter?: (assignmentId: number, weekKey: string) => void;
  onEditStartCell?: (assignmentId: number, weekKey: string, currentValue: string) => void;
  onEditSaveCell?: () => void;
  onEditCancelCell?: () => void;
  editingValue?: string;
  onEditValueChangeCell?: (v: string) => void;
  getDeliverablesForProjectWeek?: (projectId: number | undefined, weekStart: string) => Deliverable[];
  optimisticHours?: Map<number, Record<string, number>>;
  showHours?: boolean;
  onSwapPlaceholder?: (assignmentId: number, person: Pick<Person, 'id' | 'name' | 'department'>) => Promise<void> | void;
  taskTrackingEnabled?: boolean;
  taskTrackingLoading?: boolean;
  assignmentTasks?: ProjectTask[];
  canManageTaskTracking?: boolean;
  onTaskUpdate?: (taskId: number, patch: Pick<Partial<ProjectTask>, 'completionPercent' | 'assigneeIds'>) => Promise<void> | void;
  getTaskProgressColor?: (percent: number) => string;
}

const AssignmentRow: React.FC<AssignmentRowProps> = ({
  assignment,
  isEditing,
  editData,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onHoursChange,
  getCurrentWeekHours,
  onChangeAssignmentRole,
  personDepartmentId,
  currentWeekKey,
  onUpdateWeekHours,
  weekKeys,
  isCellSelected,
  isEditingCell,
  onCellSelect,
  onCellMouseDown,
  onCellMouseEnter,
  onEditStartCell,
  onEditSaveCell,
  onEditCancelCell,
  editingValue,
  onEditValueChangeCell,
  getDeliverablesForProjectWeek,
  optimisticHours,
  showHours,
  onSwapPlaceholder,
  taskTrackingEnabled,
  taskTrackingLoading,
  assignmentTasks,
  canManageTaskTracking,
  onTaskUpdate,
  getTaskProgressColor,
}) => {
  const [openRole, setOpenRole] = React.useState(false);
  const [openTaskPicker, setOpenTaskPicker] = React.useState(false);
  const [draftCompletionByTask, setDraftCompletionByTask] = React.useState<Record<number, string>>({});
  const [savingTaskIds, setSavingTaskIds] = React.useState<Record<number, boolean>>({});
  const roleBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const { data: roles = [] } = useProjectRoles(personDepartmentId ?? undefined);
  const personLabel = assignment.personName
    || (assignment.person != null ? `Person #${assignment.person}` : (assignment.roleName ? `<${assignment.roleName}>` : 'Unassigned'));
  const canSwapPlaceholder = assignment.person == null && !!assignment.roleName && !!onSwapPlaceholder;
  const personId = assignment.person ?? null;
  const scopedTasks = assignmentTasks || [];

  const assignedTasks = React.useMemo(
    () => personId == null
      ? []
      : scopedTasks.filter((task) => (task.assigneeIds || []).includes(personId)),
    [scopedTasks, personId]
  );

  const unassignedTasks = React.useMemo(
    () => personId == null
      ? []
      : scopedTasks.filter((task) => !(task.assigneeIds || []).includes(personId)),
    [scopedTasks, personId]
  );

  const normalizePercent = React.useCallback((value: number): number => {
    const bounded = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    return Math.round(bounded / 5) * 5;
  }, []);

  const formatTaskLabel = React.useCallback((task: ProjectTask): string => {
    if (task.scope !== 'deliverable') return task.name;
    const deliverableLabel = task.deliverableInfo?.description
      || (task.deliverableInfo?.percentage != null ? `${task.deliverableInfo.percentage}%` : 'Deliverable');
    return `${deliverableLabel}: ${task.name}`;
  }, []);

  const withSavingTask = React.useCallback(async (taskId: number, runner: () => Promise<void>) => {
    setSavingTaskIds((prev) => ({ ...prev, [taskId]: true }));
    try {
      await runner();
    } finally {
      setSavingTaskIds((prev) => ({ ...prev, [taskId]: false }));
    }
  }, []);

  const commitTaskPercent = React.useCallback(async (task: ProjectTask, rawValue: string) => {
    if (!task.id || !onTaskUpdate) return;
    const normalized = normalizePercent(Number(rawValue));
    setDraftCompletionByTask((prev) => ({ ...prev, [task.id!]: String(normalized) }));
    if (normalized === task.completionPercent) return;
    await withSavingTask(task.id, async () => {
      await Promise.resolve(onTaskUpdate(task.id!, { completionPercent: normalized }));
    });
  }, [normalizePercent, onTaskUpdate, withSavingTask]);

  const assignTaskToPerson = React.useCallback(async (task: ProjectTask) => {
    if (!task.id || !onTaskUpdate || personId == null) return;
    const nextAssigneeIds = Array.from(new Set([...(task.assigneeIds || []), personId]));
    await withSavingTask(task.id, async () => {
      await Promise.resolve(onTaskUpdate(task.id!, { assigneeIds: nextAssigneeIds }));
    });
    setOpenTaskPicker(false);
  }, [onTaskUpdate, personId, withSavingTask]);

  const unassignTaskFromPerson = React.useCallback(async (task: ProjectTask) => {
    if (!task.id || !onTaskUpdate || personId == null) return;
    const nextAssigneeIds = (task.assigneeIds || []).filter((id) => id !== personId);
    await withSavingTask(task.id, async () => {
      await Promise.resolve(onTaskUpdate(task.id!, { assigneeIds: nextAssigneeIds }));
    });
  }, [onTaskUpdate, personId, withSavingTask]);

  // selection/editing handled by parent using WeekCell helpers
  if (isEditing) {
    return (
      <div className="p-3 bg-[var(--surfaceOverlay)] rounded border border-[var(--border)]">
        <div className="grid grid-cols-4 gap-4 items-center">
          <div className="text-[var(--text)]">{personLabel}</div>

          <div className="relative">
            <button
              type="button"
              className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-left text-[var(--text)] hover:bg-[var(--cardHover)]"
              onClick={() => setOpenRole((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={openRole}
              ref={roleBtnRef}
            >
              {assignment.roleName || 'Set role'}
            </button>
            {openRole && (
              <div className="absolute mt-1 z-50">
                <RoleDropdown
                  roles={roles as any}
                  currentId={(assignment as any).roleOnProjectId ?? null}
                  onSelect={(id, name) => onChangeAssignmentRole?.(assignment.id!, id, name)}
                  onClose={() => setOpenRole(false)}
                  anchorRef={roleBtnRef}
                />
              </div>
            )}
          </div>

          <div>
            <input
              type="number"
              min="0"
              max="80"
              step="0.5"
              placeholder="Hours"
              value={editData.currentWeekHours}
              onChange={(e) => onHoursChange(parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
            />
          </div>

          <div className="flex gap-1">
            <button
              onClick={onSave}
              className="px-2 py-1 text-xs rounded border bg-[var(--primary)] border-[var(--primary)] text-white hover:bg-[var(--primaryHover)] transition-colors"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-2 py-1 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Derive next 6 Monday week keys from provided currentWeekKey
  const computedWeekKeys = React.useMemo(() => {
    if (!currentWeekKey) return [] as string[];
    const base = new Date(currentWeekKey + 'T00:00:00');
    const addDays = (d: number) => {
      const dt = new Date(base);
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().split('T')[0];
    };
    return [0, 7, 14, 21, 28, 35].map(addDays);
  }, [currentWeekKey]);

  const showHoursGrid = showHours !== false; // default to true unless explicitly false

  // Compact card-style row (no hours) vs. grid with hours
  if (!showHoursGrid) {
    return (
      <div className="flex justify-between items-start p-2 pl-8 bg-[var(--card)] rounded">
        <div className="min-w-0 pr-2 flex-1">
          <div className="text-[var(--text)] font-medium leading-tight truncate">
            {canSwapPlaceholder ? (
              <PlaceholderPersonSwap
                label={personLabel}
                deptId={personDepartmentId ?? (assignment as any).personDepartmentId ?? null}
                className="text-[var(--text)] font-medium leading-tight truncate"
                onSelect={(person) => onSwapPlaceholder?.(assignment.id!, person)}
              />
            ) : (
              personLabel
            )}
          </div>
          <div className="mt-0.5 text-[var(--muted)] text-xs truncate">
            <button
              type="button"
              className="hover:text-[var(--text)] truncate"
              onClick={() => setOpenRole((v) => !v)}
              title="Edit role on project"
              ref={roleBtnRef}
            >
              {assignment.roleName || 'Set role'}
            </button>
            {openRole && (
              <div className="relative mt-1">
                <RoleDropdown
                  roles={roles as any}
                  currentId={(assignment as any).roleOnProjectId ?? null}
                  onSelect={(id, name) => onChangeAssignmentRole?.(assignment.id!, id, name)}
                  onClose={() => setOpenRole(false)}
                  anchorRef={roleBtnRef}
                />
              </div>
            )}
          </div>
          {taskTrackingEnabled && personId != null ? (
            <div className="mt-1 space-y-1">
              <div className="relative">
                {canManageTaskTracking && personId != null ? (
                  <button
                    type="button"
                    className="text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
                    onClick={() => setOpenTaskPicker((prev) => !prev)}
                  >
                    Assign task
                  </button>
                ) : (
                  <div className="text-[10px] text-[var(--muted)]">Tasks</div>
                )}
                {openTaskPicker && canManageTaskTracking && personId != null ? (
                  <div className="absolute left-0 mt-1 z-40 w-72 max-h-44 overflow-auto rounded border border-[var(--border)] bg-[var(--card)] shadow-lg">
                    {unassignedTasks.length === 0 ? (
                      <div className="px-2 py-1 text-[10px] text-[var(--muted)]">No available tasks</div>
                    ) : (
                      unassignedTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => { void assignTaskToPerson(task); }}
                          className="w-full px-2 py-1 text-left text-[10px] text-[var(--text)] hover:bg-[var(--surfaceHover)] truncate"
                        >
                          {formatTaskLabel(task)}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              {taskTrackingLoading ? (
                <div className="text-[10px] text-[var(--muted)]">Loading tasks...</div>
              ) : assignedTasks.length > 0 ? (
                assignedTasks.map((task) => {
                  const taskId = task.id ?? 0;
                  const isBinaryTask = task.completionMode === 'binary';
                  const taskColor = getTaskProgressColor?.(task.completionPercent ?? 0) || 'var(--muted)';
                  const draftValue = draftCompletionByTask[taskId] ?? String(task.completionPercent ?? 0);
                  const isSaving = Boolean(savingTaskIds[taskId]);
                  return (
                    <div key={task.id} className="flex items-center justify-between gap-2 rounded border border-[var(--border)] px-2 py-1">
                      <div className="min-w-0 text-[10px] text-[var(--text)] truncate" title={formatTaskLabel(task)}>
                        {formatTaskLabel(task)}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {canManageTaskTracking ? (
                          <>
                            {isBinaryTask ? (
                              <label className="inline-flex items-center gap-1 text-[10px] text-[var(--muted)]">
                                <input
                                  type="checkbox"
                                  disabled={isSaving}
                                  checked={(task.completionPercent ?? 0) >= 100}
                                  onChange={(e) => {
                                    if (!task.id || !onTaskUpdate) return;
                                    const nextPercent = e.currentTarget.checked ? 100 : 0;
                                    void withSavingTask(task.id, async () => {
                                      await Promise.resolve(onTaskUpdate(task.id!, { completionPercent: nextPercent }));
                                    });
                                  }}
                                  className="h-3.5 w-3.5 accent-[var(--primary)]"
                                />
                                Complete
                              </label>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={5}
                                  disabled={isSaving}
                                  value={draftValue}
                                  onChange={(e) => {
                                    const nextValue = e.currentTarget.value;
                                    setDraftCompletionByTask((prev) => ({ ...prev, [taskId]: nextValue }));
                                  }}
                                  onBlur={() => { void commitTaskPercent(task, draftValue); }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                  }}
                                  style={{ color: taskColor }}
                                  className="w-14 px-1 py-0.5 text-[10px] text-right bg-[var(--surface)] border border-[var(--border)] rounded appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                                />
                                <span className="text-[10px] text-[var(--muted)]">%</span>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => { void unassignTaskFromPerson(task); }}
                              disabled={isSaving}
                              className="p-0.5 rounded text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                              title="Unassign task"
                            >
                              <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4l8 8M12 4l-8 8" />
                              </svg>
                            </button>
                          </>
                        ) : (
                          isBinaryTask ? (
                            <label className="inline-flex items-center gap-1 text-[10px] text-[var(--muted)]">
                              <input
                                type="checkbox"
                                disabled
                                checked={(task.completionPercent ?? 0) >= 100}
                                className="h-3.5 w-3.5 accent-[var(--primary)]"
                              />
                              Complete
                            </label>
                          ) : (
                            <span className="text-[10px]" style={{ color: taskColor }}>{task.completionPercent}%</span>
                          )
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-[10px] text-[var(--muted)]">No tasks assigned</div>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex items-center">
          <button
            onClick={onDelete}
            aria-label="Remove assignment"
            title="Remove assignment"
            className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center p-2 pl-8 bg-[var(--card)] rounded">
      <div className="flex-1">
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="min-w-0">
            <div className="text-[var(--text)] font-medium leading-tight truncate">
              {canSwapPlaceholder ? (
                <PlaceholderPersonSwap
                  label={personLabel}
                  deptId={personDepartmentId ?? (assignment as any).personDepartmentId ?? null}
                  className="text-[var(--text)] font-medium leading-tight truncate"
                  onSelect={(person) => onSwapPlaceholder?.(assignment.id!, person)}
                />
              ) : (
                personLabel
              )}
            </div>
            <div className="mt-0.5 text-[var(--muted)] text-xs truncate">
              <button
                type="button"
                className="hover:text-[var(--text)] truncate"
                onClick={() => setOpenRole((v) => !v)}
                title="Edit role on project"
                ref={roleBtnRef}
              >
                {assignment.roleName || 'Set role'}
              </button>
              {openRole && (
                <div className="relative mt-1">
                  <RoleDropdown
                    roles={roles as any}
                    currentId={(assignment as any).roleOnProjectId ?? null}
                    onSelect={(id, name) => onChangeAssignmentRole?.(assignment.id!, id, name)}
                    onClose={() => setOpenRole(false)}
                    anchorRef={roleBtnRef}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="col-span-2">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 64px)' }}>
              {(weekKeys || computedWeekKeys).map((wk) => (
                <WeekCell
                  key={`${wk}-${assignment.id}`}
                  weekKey={wk}
                  isSelected={Boolean(isCellSelected?.(assignment.id!, wk))}
                  isEditing={Boolean(isEditingCell?.(assignment.id!, wk))}
                  currentHours={(optimisticHours?.get(assignment.id!)?.[wk] ?? assignment.weeklyHours?.[wk] ?? 0) as number}
                  onSelect={(isShift) => onCellSelect?.(assignment.id!, wk, isShift)}
                  onMouseDown={() => onCellMouseDown?.(assignment.id!, wk)}
                  onMouseEnter={() => onCellMouseEnter?.(assignment.id!, wk)}
                  onEditStart={() => onEditStartCell?.(assignment.id!, wk, String(assignment.weeklyHours?.[wk] || 0))}
                  onEditSave={() => onEditSaveCell?.()}
                  onEditCancel={() => onEditCancelCell?.()}
                  editingValue={editingValue || ''}
                  onEditValueChange={(v) => onEditValueChangeCell?.(v)}
                  deliverablesForWeek={getDeliverablesForProjectWeek?.(assignment.project, wk) || []}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center">
        <button
          onClick={onDelete}
          aria-label="Remove assignment"
          title="Remove assignment"
          className="p-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default React.memo(AssignmentRow);
