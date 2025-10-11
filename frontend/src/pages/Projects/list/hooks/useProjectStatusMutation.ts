import { useCallback } from 'react';
import type { Project } from '@/types/models';
import { showToast } from '@/lib/toastBus';

interface Params {
  selectedProject: Project | null;
  updateProjectMutation: { mutateAsync: (args: { id: number; data: Partial<Project> }) => Promise<any> };
  invalidateFilterMeta: () => Promise<void>;
  setSelectedProject: (p: Project | null) => void;
  setStatusDropdownOpen: (v: boolean) => void;
  setError: (msg: string | null) => void;
}

export function useProjectStatusMutation({ selectedProject, updateProjectMutation, invalidateFilterMeta, setSelectedProject, setStatusDropdownOpen, setError }: Params) {
  const onChangeStatus = useCallback(async (newStatus: string) => {
    if (!selectedProject?.id) return;
    try {
      const prev = selectedProject;
      const optimistic = { ...prev, status: newStatus } as Project;
      setSelectedProject(optimistic);
      setStatusDropdownOpen(false);
      await updateProjectMutation.mutateAsync({ id: prev.id!, data: { status: newStatus } });
      await invalidateFilterMeta();
      showToast('Project status updated', 'success');
    } catch (err) {
      // revert and surface error
      setSelectedProject(selectedProject);
      setError('Failed to update project status');
      showToast('Failed to update project status', 'error');
    }
  }, [selectedProject, updateProjectMutation, invalidateFilterMeta, setSelectedProject, setStatusDropdownOpen, setError]);

  return { onChangeStatus } as const;
}

