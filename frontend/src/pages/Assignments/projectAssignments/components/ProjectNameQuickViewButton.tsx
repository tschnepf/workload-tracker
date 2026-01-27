import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectDetailsDrawer } from '@/components/projects/detailsDrawer';
import { projectsApi } from '@/services/api';

const ProjectNameQuickViewButton: React.FC<{ projectId: number; children: React.ReactNode }> = ({ projectId, children }) => {
  const { open } = useProjectDetailsDrawer();
  const queryClient = useQueryClient();
  const prefetchTimerRef = React.useRef<number | null>(null);

  return (
    <button
      type="button"
      className="truncate cursor-pointer hover:underline"
      onClick={(e) => { e.stopPropagation(); open(projectId); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          open(projectId);
        }
      }}
      onMouseEnter={() => {
        if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = window.setTimeout(() => {
          queryClient.ensureQueryData({ queryKey: ['projects', projectId], queryFn: () => projectsApi.get(projectId) });
        }, 150);
      }}
      onMouseLeave={() => { if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current); }}
      onFocus={() => {
        if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = window.setTimeout(() => {
          queryClient.ensureQueryData({ queryKey: ['projects', projectId], queryFn: () => projectsApi.get(projectId) });
        }, 150);
      }}
      onBlur={() => { if (prefetchTimerRef.current) window.clearTimeout(prefetchTimerRef.current); }}
    >
      {children}
    </button>
  );
};

export default ProjectNameQuickViewButton;
