import { useMemo } from 'react';
import { useDropdownManager } from '@/components/projects/useDropdownManager';
import { useProjectStatus } from '@/components/projects/useProjectStatus';
import type { Project } from '@/types/models';

export interface ProjectWithState extends Project {
  isUpdating?: boolean;
  lastUpdated?: number;
}

export function useStatusControls(params: {
  projectsById: Map<number, ProjectWithState>;
  setProjectsData: React.Dispatch<React.SetStateAction<ProjectWithState[]>>;
  emitStatusChange: (projectId: number, previousStatus: Project['status'] | null, newStatus: Project['status']) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}) {
  const { projectsById, setProjectsData, emitStatusChange, showToast } = params;

  const statusDropdown = useDropdownManager<string>();

  const getProjectStatus = useMemo(() =>
    (projectId: number) => projectsById.get(projectId)?.status ?? null
  , [projectsById]);

  const projectStatus = useProjectStatus({
    getCurrentStatus: (projectId) => projectsById.get(projectId)?.status || null,
    onOptimisticUpdate: (projectId, newStatus, previousStatus) => {
      emitStatusChange(projectId, previousStatus, newStatus);
      setProjectsData(prev => prev.map(p => p.id === projectId ? { ...p, status: newStatus, isUpdating: true } : p));
      statusDropdown.close();
    },
    onSuccess: (projectId) => {
      setProjectsData(prev => prev.map(p => p.id === projectId ? { ...p, isUpdating: false, lastUpdated: Date.now() } : p));
      // message will be shown by caller based on newStatus if desired
    },
    onRollback: (projectId, rollbackStatus) => {
      setProjectsData(prev => prev.map(p => p.id === projectId ? { ...p, status: rollbackStatus, isUpdating: false } : p));
    },
    onError: (_projectId, error) => {
      showToast(`Failed to update project status: ${error}`, 'error');
    },
    maxRetries: 3,
    retryDelay: 1000,
  });

  const handleStatusChange = async (projectId: number, newStatus: Project['status']) => {
    const current = projectsById.get(projectId);
    if (!current) return;
    if (current.status === newStatus) {
      statusDropdown.close();
      return;
    }
    try {
      await projectStatus.updateStatus(projectId, newStatus);
      showToast(`Project status updated to ${newStatus.replace('_', ' ').toLowerCase()}`, 'success');
    } catch (e) {
      // errors are surfaced by onError; keep console for debugging
      // eslint-disable-next-line no-console
      console.error('Status update failed:', e);
    }
  };

  return { statusDropdown, projectStatus, getProjectStatus, handleStatusChange } as const;
}

