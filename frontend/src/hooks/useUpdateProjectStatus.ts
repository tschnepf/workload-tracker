import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateProject } from '@/hooks/useProjects';
import { PROJECT_FILTER_METADATA_KEY } from '@/hooks/useProjectFilterMetadata';
import { showToast } from '@/lib/toastBus';

/**
 * Unified status update hook for Projects.
 * - Uses existing update mutation (optimistic update + invalidation)
 * - Adds consistent success/error toasts
 * - Exposes simple API usable from table or details panel
 */
export function useUpdateProjectStatus() {
  const queryClient = useQueryClient();
  const updateProjectMutation = useUpdateProject();
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const updateStatus = useCallback(
    async (projectId: number, newStatus: string): Promise<void> => {
      if (projectId == null) return;
      setUpdatingId(projectId);
      try {
        await updateProjectMutation.mutateAsync({ id: projectId, data: { status: newStatus } });
        await queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
        showToast('Project status updated', 'success');
      } catch (err) {
        showToast('Failed to update project status', 'error');
        throw err;
      } finally {
        setUpdatingId((prev) => (prev === projectId ? null : prev));
      }
    },
    [updateProjectMutation, queryClient]
  );

  const isUpdating = useCallback((id: number | null | undefined) => {
    return id != null && updatingId === id;
  }, [updatingId]);

  return { updateStatus, updatingId, isUpdating } as const;
}

