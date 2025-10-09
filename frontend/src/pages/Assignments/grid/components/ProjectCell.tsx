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
    <div className="flex items-center py-1 pr-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-[var(--text)] text-xs truncate flex-1" title={projectName}>
            {projectName}
          </div>
          <div className="relative flex-shrink-0">
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
        </div>
        <div className="mt-1 text-[var(--muted)] text-[11px]">
          <button
            type="button"
            className="underline decoration-dotted underline-offset-2"
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
  );
};

export default ProjectCell;
