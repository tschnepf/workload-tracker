import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectRolesApi } from '@/services/api';
import { showToast } from '@/lib/toastBus';

export function useProjectRoles() {
  const qc = useQueryClient();
  const query = useQuery<string[], Error>({
    queryKey: ['projectRoles'],
    queryFn: () => projectRolesApi.list(),
    staleTime: 60_000,
    retry: 1,
  });
  const addMutation = useMutation({
    mutationKey: ['projectRoles:add'],
    mutationFn: async (name: string) => projectRolesApi.add(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectRoles'] });
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to add project role', 'error');
    },
  });
  const removeMutation = useMutation({
    mutationKey: ['projectRoles:remove'],
    mutationFn: async (name: string) => projectRolesApi.remove(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectRoles'] });
      // Assignments data may reference old role names; downstream UIs typically refetch as needed.
    },
    onError: (err: any) => {
      showToast(err?.message || 'Failed to remove project role', 'error');
    },
  });
  return {
    roles: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refetch,
    add: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    remove: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}
