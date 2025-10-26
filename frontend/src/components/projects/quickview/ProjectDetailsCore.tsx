import React from 'react';

type HeaderProps = {
  title: string;
  client?: string | null;
  onClose: () => void;
  rightSlot?: React.ReactNode;
};

export const ProjectDetailsHeader: React.FC<HeaderProps> = ({ title, client, onClose, rightSlot }) => {
  const headerId = 'project-quickview-header';
  return (
    <div>
      <div id={headerId} className="sr-only">{client ? `${client} ${title}` : title}</div>
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{client ? `${client} ${title}` : title}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {rightSlot}
          <button type="button" onClick={onClose} className="px-2 py-1 text-xs rounded hover:bg-[var(--surfaceHover)]">Close</button>
        </div>
      </div>
    </div>
  );
};

type CoreProps = {
  title: string;
  client?: string | null;
  onClose: () => void;
  rightSlot?: React.ReactNode;
  children?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  projectId?: number | null;
};

export const ProjectDetailsCore: React.FC<CoreProps> = ({ title, client, onClose, rightSlot, children, loading, error, onRetry, projectId }) => {
  return (
    <div>
      <ProjectDetailsHeader title={title} client={client} onClose={onClose} rightSlot={rightSlot} />
      <div className="mt-3">
        {loading ? (
          <div>
            <div className="h-4 bg-[var(--surfaceOverlay)] rounded w-1/2 mb-2" />
            <div className="h-3 bg-[var(--surfaceOverlay)] rounded w-1/3 mb-3" />
            <div className="h-24 bg-[var(--surfaceOverlay)] rounded" />
          </div>
        ) : error ? (
          <div className="p-3 border border-red-500/40 rounded bg-red-500/10 text-red-300 text-sm">
            <div className="font-medium mb-2">Failed to load project</div>
            <div className="mb-3">{error}</div>
            <div className="flex items-center gap-2">
              {onRetry && (<button className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--surfaceHover)]" onClick={onRetry}>Retry</button>)}
              {projectId != null && (
                <a className="px-2 py-1 text-xs rounded border border-[var(--border)] hover:bg-[var(--surfaceHover)]" href={`/projects?projectId=${encodeURIComponent(String(projectId))}`}>View full project</a>
              )}
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export default ProjectDetailsCore;

