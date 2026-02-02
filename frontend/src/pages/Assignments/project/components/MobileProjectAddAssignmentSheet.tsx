import React from 'react';
import Modal from '@/components/ui/Modal';
import type { ProjectRole } from '@/roles/api';
import { useProjectRoles } from '@/roles/hooks/useProjectRoles';
import type { Project } from '@/types/models';

type PersonLite = { id: number; name: string; department?: number | null };

type AddController = {
  isAddingFor: number | null;
  newPersonName: string;
  selectedPerson: PersonLite | null;
  selectedPersonRole?: ProjectRole | null;
  selectedRole: (ProjectRole & { departmentName?: string }) | null;
  personResults: PersonLite[];
  roleResults: Array<ProjectRole & { departmentName?: string }>;
  onSearchChange: (value: string) => void;
  onPersonSelect: (person: PersonLite) => void;
  onPersonRoleSelect?: (role: ProjectRole | null) => void;
  onRoleSelect: (role: ProjectRole & { departmentName?: string }) => void;
  addSelected: (projectId: number) => void;
  addPerson: (projectId: number, person: PersonLite) => void;
  addRole: (projectId: number, role: ProjectRole & { departmentName?: string }) => void;
  cancel: () => void;
};

type Props = {
  addController: AddController;
  projects: Project[];
  canEditAssignments: boolean;
};

const MobileProjectAddAssignmentSheet: React.FC<Props> = ({ addController, projects, canEditAssignments }) => {
  const targetId = addController.isAddingFor;
  if (!targetId) return null;
  const project = projects.find((p) => p.id === targetId);

  const addDisabled = !canEditAssignments || (!addController.selectedPerson && !addController.selectedRole);
  const { data: roleOptions = [] } = useProjectRoles(addController.selectedPerson?.department ?? null, { includeInactive: true });

  return (
    <Modal
      isOpen={Boolean(targetId)}
      onClose={addController.cancel}
      title={project ? `Add Assignment - ${project.name}` : 'Add Assignment'}
      width={420}
    >
      <div className="space-y-4">
        {!canEditAssignments && (
          <div className="text-xs text-[var(--muted)] border border-[var(--border)] rounded px-2 py-1">
            Editing is disabled for your role. You can browse people and roles but cannot add assignments.
          </div>
        )}
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1" htmlFor="mobile-add-person-input">
            Search people or roles
          </label>
          <input
            id="mobile-add-person-input"
            type="text"
            value={addController.newPersonName}
            onChange={(e) => addController.onSearchChange(e.target.value)}
            className="w-full border border-[var(--border)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--text)]"
            placeholder="Start typing a name or role"
            disabled={!canEditAssignments}
          />
        </div>
        <div className="max-h-52 overflow-y-auto rounded border border-[var(--border)] divide-y divide-[var(--border)] bg-[var(--card)]">
          {addController.personResults.length === 0 && addController.roleResults.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">No matching people or roles</div>
          ) : (
            <>
              {addController.personResults.length > 0 && (
                <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--muted)] bg-[var(--surface)]">
                  People
                </div>
              )}
              {addController.personResults.map((person) => (
                <button
                  key={`person-${person.id}`}
                  type="button"
                  onClick={() => addController.onPersonSelect(person)}
                  className={`w-full text-left px-3 py-2 text-sm ${
                    addController.selectedPerson?.id === person.id ? 'bg-[var(--surfaceHover)] text-[var(--text)]' : 'text-[var(--text)]'
                  } ${!canEditAssignments ? 'cursor-not-allowed opacity-60' : 'hover:bg-[var(--surfaceHover)]'}`}
                  disabled={!canEditAssignments}
                >
                  <div className="font-medium">{person.name}</div>
                </button>
              ))}
              {addController.roleResults.length > 0 && (
                <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--muted)] bg-[var(--surface)]">
                  Roles
                </div>
              )}
              {addController.roleResults.map((role) => (
                <button
                  key={`role-${role.id}`}
                  type="button"
                  onClick={() => addController.onRoleSelect(role)}
                  className={`w-full text-left px-3 py-2 text-sm ${
                    addController.selectedRole?.id === role.id ? 'bg-[var(--surfaceHover)] text-[var(--text)]' : 'text-[var(--text)]'
                  } ${!canEditAssignments ? 'cursor-not-allowed opacity-60' : 'hover:bg-[var(--surfaceHover)]'}`}
                  disabled={!canEditAssignments}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{role.name}</span>
                    {role.departmentName ? (
                      <span className="text-[10px] text-[var(--muted)]">{role.departmentName}</span>
                    ) : null}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
        {addController.selectedPerson ? (
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Project role</label>
            <select
              className="w-full border border-[var(--border)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--text)]"
              value={addController.selectedPersonRole?.id ?? ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                const role = roleOptions.find((r) => r.id === id) || null;
                addController.onPersonRoleSelect?.(role);
              }}
              disabled={!canEditAssignments}
            >
              <option value="">Unassigned</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex justify-between gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-1 rounded border border-[var(--border)] text-sm"
            onClick={() => addController.cancel()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-1.5 rounded bg-[var(--primary)] text-white text-sm disabled:opacity-60"
            disabled={addDisabled}
            onClick={() => addController.addSelected(targetId)}
          >
            Add Selected
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MobileProjectAddAssignmentSheet;
