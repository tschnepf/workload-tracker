import React from 'react';
import type { Assignment } from '@/types/models';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import RoleDropdown from '@/roles/components/RoleDropdown';

export interface AssignmentRowProps {
  assignment: Assignment;
  isEditing: boolean;
  editData: {
    roleOnProject: string;
    currentWeekHours: number;
    roleSearch: string;
  };
  roleSearchResults: string[];
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  onRoleSearch: (value: string) => void;
  onRoleSelect: (role: string) => void;
  onHoursChange: (hours: number) => void;
  getCurrentWeekHours: (assignment: Assignment) => number;
  onChangeAssignmentRole?: (assignmentId: number, roleId: number | null, roleName: string | null) => void;
  personDepartmentId?: number | null;
  currentWeekKey?: string;
}

const AssignmentRow: React.FC<AssignmentRowProps> = ({
  assignment,
  isEditing,
  editData,
  roleSearchResults,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onRoleSearch,
  onRoleSelect,
  onHoursChange,
  getCurrentWeekHours,
  onChangeAssignmentRole,
  personDepartmentId,
  currentWeekKey,
}) => {
  const [openRole, setOpenRole] = React.useState(false);
  const { data: roles = [] } = useProjectRoles(personDepartmentId ?? undefined);
  if (isEditing) {
    return (
      <div className="p-3 bg-[var(--surfaceOverlay)] rounded border border-[var(--border)]">
        <div className="grid grid-cols-4 gap-4 items-center">
          <div className="text-[var(--text)]">{assignment.personName || 'Unknown'}</div>

          <div className="relative">
            <input
              type="text"
              placeholder="Role on project..."
              value={editData.roleSearch}
              onChange={(e) => onRoleSearch(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-[var(--card)] border border-[var(--border)] rounded text-[var(--text)] placeholder-[var(--muted)] focus:border-[var(--primary)] focus:outline-none"
              autoFocus
            />

            {roleSearchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded shadow-lg z-50 max-h-32 overflow-y-auto">
                {roleSearchResults.map((role) => (
                  <button
                    key={role}
                    onClick={() => onRoleSelect(role)}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--cardHover)] transition-colors text-[var(--text)] border-b border-[var(--border)] last:border-b-0"
                  >
                    {role}
                  </button>
                ))}
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
  const weekKeys = React.useMemo(() => {
    if (!currentWeekKey) return [] as string[];
    const base = new Date(currentWeekKey + 'T00:00:00');
    const addDays = (d: number) => {
      const dt = new Date(base);
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().split('T')[0];
    };
    return [0, 7, 14, 21].map(addDays);
  }, [currentWeekKey]);

  return (
    <div className="flex justify-between items-center p-2 bg-[var(--cardHover)] rounded">
      <div className="flex-1">
        <div className="grid grid-cols-3 gap-4 items-center">
          <div>
            <div className="text-[var(--text)] font-medium leading-tight">{assignment.personName || 'Unknown'}</div>
            <div className="mt-0.5 text-[var(--muted)] text-xs">
              <button
                type="button"
                className="hover:text-[var(--text)]"
                onClick={() => setOpenRole(v => !v)}
                title="Edit role on project"
              >
                {assignment.roleName || assignment.roleOnProject || 'Set role'}
              </button>
              {openRole && (
                <div className="relative mt-1">
                  <RoleDropdown
                    roles={roles as any}
                    currentId={(assignment as any).roleOnProjectId ?? null}
                    onSelect={(id, name) => onChangeAssignmentRole?.(assignment.id!, id, name)}
                    onClose={() => setOpenRole(false)}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="col-span-2">
            <div className="flex gap-2">
              {weekKeys.map((wk) => (
                <span
                  key={wk}
                  className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  title={`Week of ${wk}`}
                >
                  {(assignment.weeklyHours?.[wk] || 0)}h
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={onEdit}
          className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-[var(--text)] hover:bg-[var(--cardHover)] hover:border-[var(--border)] transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="text-xs px-1 py-0.5 rounded border bg-transparent border-transparent text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default React.memo(AssignmentRow);
