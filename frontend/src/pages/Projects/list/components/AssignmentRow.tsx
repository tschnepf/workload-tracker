import React from 'react';
import type { Assignment, Deliverable, Person } from '@/types/models';
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
}) => {
  const [openRole, setOpenRole] = React.useState(false);
  const roleBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const { data: roles = [] } = useProjectRoles(personDepartmentId ?? undefined);
  const personLabel = assignment.personName
    || (assignment.person != null ? `Person #${assignment.person}` : (assignment.roleName ? `<${assignment.roleName}>` : 'Unassigned'));
  const canSwapPlaceholder = assignment.person == null && !!assignment.roleName && !!onSwapPlaceholder;
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
              onClick={() => setOpenRole(v => !v)}
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

  // Derive next 4 Monday week keys from provided currentWeekKey
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
      <div className="flex justify-between items-center p-2 pl-8 bg-[var(--card)] rounded">
        <div className="min-w-0 pr-2">
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
              onClick={() => setOpenRole(v => !v)}
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
                onClick={() => setOpenRole(v => !v)}
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
