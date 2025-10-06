import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectRolesApi } from '@/services/api';

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
  });
  return {
    roles: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refetch,
    add: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
  };
}

