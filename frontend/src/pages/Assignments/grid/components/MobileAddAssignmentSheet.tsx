import React from 'react';
import Modal from '@/components/ui/Modal';
import type { Project, Person } from '@/types/models';
import type { UseProjectAssignmentAddReturn } from '@/pages/Assignments/grid/useProjectAssignmentAdd';

type Props = {
  addController: UseProjectAssignmentAddReturn;
  people: Person[];
  canEditAssignments: boolean;
};

const MobileAddAssignmentSheet: React.FC<Props> = ({ addController, people, canEditAssignments }) => {
  const targetId = addController.isAddingFor;
  if (!targetId) return null;
  const person = people.find((p) => p.id === targetId);

  const handleResultClick = (project: Project) => {
    if (!canEditAssignments) return;
    addController.onProjectSelect(project);
  };

  const addDisabled = !canEditAssignments || !addController.selectedProject;

  return (
    <Modal
      isOpen={Boolean(targetId)}
      onClose={() => addController.cancel()}
      title={person ? `Add Assignment • ${person.name}` : 'Add Assignment'}
      width={420}
    >
      <div className="space-y-4">
        {!canEditAssignments && (
          <div className="text-xs text-[var(--muted)] border border-[var(--border)] rounded px-2 py-1">
            Editing is disabled for your role. You can browse projects but cannot add assignments.
          </div>
        )}
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1" htmlFor="mobile-add-project-input">
            Search projects
          </label>
          <input
            id="mobile-add-project-input"
            type="text"
            value={addController.newProjectName}
            onChange={(e) => addController.onSearchChange(e.target.value)}
            className="w-full border border-[var(--border)] rounded px-2 py-1 bg-[var(--surface)] text-[var(--text)]"
            placeholder="Start typing a project or client name"
            disabled={!canEditAssignments}
          />
        </div>
        <div className="max-h-48 overflow-y-auto rounded border border-[var(--border)] divide-y divide-[var(--border)] bg-[var(--card)]">
          {addController.projectSearchResults.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--muted)]">No matching projects</div>
          ) : (
            addController.projectSearchResults.map((project, idx) => (
              <button
                key={project.id ?? idx}
                type="button"
                onClick={() => handleResultClick(project)}
                className={`w-full text-left px-3 py-2 text-sm ${
                  addController.selectedProject?.id === project.id ? 'bg-[var(--surfaceHover)] text-[var(--text)]' : 'text-[var(--text)]'
                } ${!canEditAssignments ? 'cursor-not-allowed opacity-60' : 'hover:bg-[var(--surfaceHover)]'}`}
                disabled={!canEditAssignments}
              >
                <div className="font-medium">{project.name}</div>
                {project.client ? <div className="text-xs text-[var(--muted)]">{project.client}</div> : null}
              </button>
            ))
          )}
        </div>
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

export default MobileAddAssignmentSheet;
