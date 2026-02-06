import { useQuery } from '@tanstack/react-query';
import { verticalsApi } from '@/services/api';
import type { Vertical } from '@/types/models';

export function useVerticals(options?: { enabled?: boolean; includeInactive?: boolean }) {
  const query = useQuery<Vertical[], Error>({
    queryKey: ['verticalsAll', options?.includeInactive ? 1 : 0],
    queryFn: () => verticalsApi.listAll({ include_inactive: options?.includeInactive ? 1 : undefined }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });

  return {
    verticals: query.data || [],
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  };
}
