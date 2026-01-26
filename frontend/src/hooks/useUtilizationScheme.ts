import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { utilizationSchemeApi, UtilizationScheme } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

export function useUtilizationScheme(options?: { enabled?: boolean }) {
  const auth = useAuth();
  const isAuthenticated = !!auth.accessToken;
  const qc = useQueryClient();

  const query = useQuery<UtilizationScheme, Error>({
    queryKey: ['utilizationScheme'],
    queryFn: () => utilizationSchemeApi.get(),
    enabled: (options?.enabled ?? true) && isAuthenticated,
    staleTime: 60_000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationKey: ['utilizationScheme:update'],
    mutationFn: async (payload: Omit<UtilizationScheme, 'version' | 'updated_at'>) => {
      return utilizationSchemeApi.update(payload);
    },
    onSuccess: (data) => {
      qc.setQueryData(['utilizationScheme'], data);
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    update: mutation.mutateAsync,
    isUpdating: mutation.isPending,
  };
}
