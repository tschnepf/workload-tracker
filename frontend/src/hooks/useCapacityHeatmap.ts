import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { peopleApi } from '../services/api';
import { PersonCapacityHeatmapItem } from '../types/models';

export function useCapacityHeatmap(
  filter: { departmentId: number | null; includeChildren: boolean },
  weeks: number,
  enabled: boolean = true
) {
  return useQuery<PersonCapacityHeatmapItem[], Error>({
    queryKey: ['capacityHeatmap', filter.departmentId ?? 'all', filter.includeChildren ? 1 : 0, weeks],
    queryFn: ({ signal }) =>
      peopleApi.capacityHeatmap(
        {
          weeks,
          department: filter.departmentId ?? undefined,
          include_children: filter.includeChildren ? 1 : 0,
        },
        { signal }
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
    refetchOnWindowFocus: true,
    enabled: enabled && weeks > 0,
  });
}
