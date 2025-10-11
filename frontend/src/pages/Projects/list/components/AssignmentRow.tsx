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

  return (
    <div className="flex justify-between items-center p-2 bg-[var(--cardHover)] rounded">
      <div className="flex-1">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[var(--text)]">{assignment.personName || 'Unknown'}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {assignment.personSkills?.filter((s) => s.skillType === 'strength').slice(0, 3).map((skill, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {skill.skillTagName}
                </span>
              ))}
              {assignment.personSkills?.filter((s) => s.skillType === 'strength').length === 0 && (
                <span className="text-[var(--muted)] text-xs">No skills listed</span>
              )}
            </div>
          </div>
          <div className="text-[var(--muted)]">
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
          <div className="text-[var(--muted)]">{getCurrentWeekHours(assignment)}h</div>
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
