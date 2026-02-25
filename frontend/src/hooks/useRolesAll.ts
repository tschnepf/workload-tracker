import { useQuery } from '@tanstack/react-query';
import { rolesApi } from '@/services/api';
import type { Role } from '@/types/models';

export function useRolesAll(options?: { enabled?: boolean; includeInactive?: boolean }) {
  const query = useQuery<Role[], Error>({
    queryKey: ['rolesAll', options?.includeInactive ? 1 : 0],
    queryFn: () => rolesApi.listAll({ include_inactive: options?.includeInactive ? 1 : undefined }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });

  return {
    roles: query.data || [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}
