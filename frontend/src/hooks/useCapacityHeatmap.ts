import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { peopleApi } from '../services/api';
import { useAuth } from '@/hooks/useAuth';
import { PersonCapacityHeatmapItem } from '../types/models';

export function useCapacityHeatmap(
  filter: { departmentId: number | null; includeChildren: boolean; vertical?: number | null },
  weeks: number,
  enabled: boolean = true,
  visibilityScope: string = 'dashboard.heatmap',
) {
  const auth = useAuth();
  const isAuthenticated = !!auth.accessToken;
  return useQuery<PersonCapacityHeatmapItem[], Error>({
    queryKey: ['capacityHeatmap', filter.departmentId ?? 'all', filter.includeChildren ? 1 : 0, filter.vertical ?? 'all', weeks, visibilityScope],
    queryFn: ({ signal }) =>
      peopleApi.capacityHeatmap(
        {
          weeks,
          department: filter.departmentId ?? undefined,
          include_children: filter.includeChildren ? 1 : 0,
          vertical: filter.vertical ?? undefined,
          visibility_scope: visibilityScope,
        },
        { signal }
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
    enabled: enabled && weeks > 0 && isAuthenticated,
  });
}
