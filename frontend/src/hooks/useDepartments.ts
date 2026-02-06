import { useQuery } from '@tanstack/react-query';
import { departmentsApi } from '@/services/api';
import type { Department } from '@/types/models';

export function useDepartments(options?: { enabled?: boolean; vertical?: number; includeInactive?: boolean }) {
  const query = useQuery<Department[], Error>({
    queryKey: ['departmentsAll', options?.vertical ?? 'all', options?.includeInactive ? 1 : 0],
    queryFn: () =>
      departmentsApi.listAll({
        vertical: options?.vertical,
        include_inactive: options?.includeInactive ? 1 : undefined,
      }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });

  return {
    departments: query.data || [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}
