import React from 'react';
import { useProject } from '@/hooks/useProjects';
import { useProjectQuickViewPopover } from './ProjectQuickViewPopoverProvider';
import StatusBadge from '@/components/projects/StatusBadge';
import StatusDropdown from '@/components/projects/StatusDropdown';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
import DeliverablesSection from '@/components/deliverables/DeliverablesSection';
import PreDeliverablesSectionEmbedded from '@/components/deliverables/PreDeliverablesSectionEmbedded';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';
import { useQueryClient } from '@tanstack/react-query';
import ProjectDetailsCore from './ProjectDetailsCore';

export const ProjectDetailsContainer: React.FC<{ projectId: number }> = ({ projectId }) => {
  const { close, reposition } = useProjectQuickViewPopover();
  const { project, loading, error } = useProject(projectId);
  const queryClient = useQueryClient();
  const [statusOpen, setStatusOpen] = React.useState(false);

  const { updateStatus, isUpdating } = useProjectStatus({
    onSuccess: () => {
      try { queryClient.invalidateQueries({ queryKey: ['projects'] }); } catch {}
      try { queryClient.invalidateQueries({ queryKey: ['projects', projectId] }); } catch {}
      try { queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY }); } catch {}
    },
  });

  React.useEffect(() => { reposition(); }, [project?.id, project?.name, reposition]);

  const onStatusChange = async (newStatus: any) => {
    if (!project?.id) return;
    try {
      await updateStatus(project.id, newStatus);
      setStatusOpen(false);
    } catch {
      // toast handled downstream via hooks; keep UI responsive
    }
  };

  return (
    <ProjectDetailsCore
      title={project?.name || 'Project'}
      client={(project as any)?.client || null}
      onClose={close}
      loading={loading}
      error={error}
      onRetry={() => queryClient.invalidateQueries({ queryKey: ['projects', projectId] })}
      projectId={projectId}
      rightSlot={project ? (
        <div className="relative" data-dropdown>
          <StatusBadge
            status={(project as any)?.status || 'active'}
            variant="editable"
            onClick={() => setStatusOpen(v => !v)}
            isUpdating={isUpdating(project.id)}
          />
          {statusOpen && (
            <StatusDropdown
              currentStatus={(project as any)?.status || 'active'}
              isOpen={statusOpen}
              onSelect={(s) => onStatusChange(s)}
              onClose={() => setStatusOpen(false)}
              projectId={project.id}
              disabled={isUpdating(project.id)}
              closeOnSelect={false}
            />
          )}
        </div>
      ) : null}
    >
      {project && (
        <div>
          <DeliverablesSection
            project={project}
            variant="embedded"
            onDeliverablesChanged={() => {
              try { queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY }); } catch {}
              reposition();
            }}
          />
          <PreDeliverablesSectionEmbedded
            projectId={project.id!}
            onChanged={() => reposition()}
          />
        </div>
      )}
    </ProjectDetailsCore>
  );
};

export default ProjectDetailsContainer;
