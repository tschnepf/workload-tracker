import React from 'react';
import type { Project } from '@/types/models';
import StatusBadge from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import RoleDropdown from '@/roles/components/RoleDropdown';

export interface ProjectCellProps {
  assignmentId: number;
  projectId?: number | null;
  projectName: string;
  roleOnProjectId?: number | null;
  roleName?: string | null;
  personDepartmentId?: number | null;
  onRoleChange?: (roleId: number | null, roleName: string | null) => void;
  getProjectStatus: (projectId: number) => string | null;
  statusDropdown: ReturnType<typeof useDropdownManager<string>>;
  projectStatus: ReturnType<typeof useProjectStatus>;
  onStatusChange: (projectId: number, s: Project['status']) => void;
}

const ProjectCell: React.FC<ProjectCellProps> = ({ assignmentId, projectId, projectName, roleOnProjectId, roleName, personDepartmentId, onRoleChange, getProjectStatus, statusDropdown, projectStatus, onStatusChange }) => {
  const [openRole, setOpenRole] = React.useState<boolean>(false);
  const { data: roles = [] } = useProjectRoles(personDepartmentId ?? undefined);
  return (
    <div className="flex items-start pt-0.5 pb-0 pr-2">
      <div className="min-w-0 flex-1">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gridTemplateRows: 'auto auto', columnGap: '0.5rem' }}>
          {/* Project name (row 1, col 1) */}
          <div className="text-[var(--text)] text-xs truncate leading-5" title={projectName} style={{ gridColumn: 1, gridRow: 1 }}>
            {projectName}
          </div>
          {/* Status (row 1-2, col 2) */}
          <div className="relative" style={{ gridColumn: 2, gridRow: '1 / span 2' }}>
            {(() => {
              const dropdownKey = `${assignmentId}:${projectId ?? ''}`;
              return (
                <>
                  <StatusBadge
                    status={projectId ? getProjectStatus(projectId) : null}
                    variant="editable"
                    onClick={() => projectId && statusDropdown.toggle(dropdownKey)}
                    isUpdating={projectId && projectStatus.isUpdating(projectId)}
                  />
                  {projectId && (
                    <StatusDropdown
                      currentStatus={getProjectStatus(projectId)}
                      isOpen={statusDropdown.isOpen(dropdownKey)}
                      onSelect={(newStatus) => onStatusChange(projectId, newStatus)}
                      onClose={statusDropdown.close}
                      projectId={projectId}
                      disabled={projectStatus.isUpdating(projectId)}
                      closeOnSelect={false}
                    />
                  )}
                </>
              );
            })()}
          </div>
          {/* Role (row 2, col 1) */}
          <div className="mt-0.5 text-[var(--muted)] text-[11px] leading-4" style={{ gridColumn: 1, gridRow: 2 }}>
            <button
              type="button"
              className="hover:text-[var(--text)]"
              onClick={() => setOpenRole(v => !v)}
              title="Edit role on project"
            >
              {roleName || 'Set role'}
            </button>
            {openRole && (
              <div className="relative mt-1">
                <RoleDropdown
                  roles={roles}
                  currentId={roleOnProjectId ?? null}
                  onSelect={(id, name) => onRoleChange?.(id, name)}
                  onClose={() => setOpenRole(false)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCell;
