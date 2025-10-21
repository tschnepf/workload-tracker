import { useCallback } from 'react';
import type { Project } from '@/types/models';
import { useUpdateProjectStatus } from '@/hooks/useUpdateProjectStatus';

interface Params {
  selectedProject: Project | null;
  updateProjectMutation: { mutateAsync: (args: { id: number; data: Partial<Project> }) => Promise<any> };
  invalidateFilterMeta: () => Promise<void>;
  setSelectedProject: (p: Project | null) => void;
  setStatusDropdownOpen: (v: boolean) => void;
  setError: (msg: string | null) => void;
}

export function useProjectStatusMutation({ selectedProject, setSelectedProject, setStatusDropdownOpen, setError }: Params) {
  const { updateStatus } = useUpdateProjectStatus();

  const onChangeStatus = useCallback(async (newStatus: string) => {
    if (!selectedProject?.id) return;
    const prev = selectedProject;
    try {
      // Optimistic local details panel update
      setSelectedProject({ ...prev, status: newStatus } as Project);
      setStatusDropdownOpen(false);
      await updateStatus(prev.id!, newStatus);
    } catch (err) {
      // Revert and surface error in panel state; toast handled in hook
      setSelectedProject(prev);
      setError('Failed to update project status');
    }
  }, [selectedProject, setSelectedProject, setStatusDropdownOpen, setError, updateStatus]);

  return { onChangeStatus } as const;
}
