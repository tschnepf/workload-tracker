import React from 'react';
import { Link } from 'react-router';
import ProjectStatusDropdown from '@/components/projects/ProjectStatusDropdown';
import { InlineText } from '@/components/ui/InlineEdit';
import { confirmAction } from '@/lib/confirmAction';
import type { ProjectDetailsHeaderCardProps } from '@/pages/Projects/list/components/projectDetailsPanel.types';

const ProjectDetailsHeaderCard: React.FC<ProjectDetailsHeaderCardProps> = ({
  project,
  localPatch,
  canEdit,
  fieldErrors,
  setFieldErrors,
  clearFieldError,
  commitField,
  statusDropdownOpen,
  setStatusDropdownOpen,
  onStatusChange,
  onDeleteProject,
}) => {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold text-[var(--text)] mb-1">
          <InlineText
            value={localPatch.name ?? project.name}
            onCommit={async (v) => {
              const nextValue = (v ?? '').toString();
              await commitField('name', nextValue, {
                onError: (e) => {
                  const message = (e as any)?.message || 'Failed to update name';
                  setFieldErrors((prev) => ({ ...prev, name: message }));
                },
              });
            }}
            onStartEdit={() => clearFieldError('name')}
            onDraftChange={() => clearFieldError('name')}
            ariaLabel="Edit project name"
            disabled={!canEdit}
          />
        </h2>
        {fieldErrors.name && <div className="text-red-400 text-xs">{fieldErrors.name}</div>}
      </div>
      <div className="flex flex-col items-start gap-2 w-full sm:w-auto sm:min-w-[180px]">
        <Link
          to={`/projects/${project.id}/dashboard`}
          className="inline-flex items-center text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors"
        >
          Open Dashboard
        </Link>
        <div>
          <div className="text-[var(--muted)] text-xs">Status:</div>
          <ProjectStatusDropdown
            status={project.status || ''}
            isOpen={statusDropdownOpen}
            setOpen={setStatusDropdownOpen}
            onChange={(status) => onStatusChange(status)}
          />
        </div>
        {onDeleteProject && (
          confirmingDelete ? (
            <div className="flex flex-col md:flex-row items-start gap-2">
              <button
                disabled={isDeleting}
                onClick={async () => {
                  const ok = await confirmAction({
                    title: 'Delete Project',
                    message: 'This will permanently delete the project and its data. Are you sure?',
                    confirmLabel: 'Delete',
                    tone: 'danger',
                  });
                  if (!ok) return;
                  try {
                    setIsDeleting(true);
                    await onDeleteProject(project.id!);
                  } finally {
                    setIsDeleting(false);
                    setConfirmingDelete(false);
                  }
                }}
                className="px-2 py-0.5 text-xs rounded border bg-red-600/20 border-red-500/50 text-red-300 hover:bg-red-600/30 transition-colors disabled:opacity-50 self-start"
                aria-label="Confirm Delete Project"
                title="Permanently delete this project"
              >
                {isDeleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
              <button
                disabled={isDeleting}
                onClick={() => setConfirmingDelete(false)}
                className="px-2 py-0.5 text-xs rounded border bg-transparent border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surfaceHover)] transition-colors self-start"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="px-2 py-0.5 text-xs rounded border bg-transparent border-red-500/50 text-red-300 hover:bg-red-600/20 transition-colors self-start"
              aria-label="Delete Project"
              title="Delete this project"
            >
              Delete
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default ProjectDetailsHeaderCard;
