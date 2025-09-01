import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { peopleApi } from '../services/api';
import { PersonCapacityHeatmapItem } from '../types/models';

export function useCapacityHeatmap(departmentId: number | null, weeks: number, enabled: boolean = true) {
  return useQuery<PersonCapacityHeatmapItem[], Error>({
    queryKey: ['capacityHeatmap', departmentId ?? 'all', weeks],
    queryFn: ({ signal }) =>
      peopleApi.capacityHeatmap(
        { weeks, department: departmentId ?? undefined },
        { signal }
      ),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: enabled && weeks > 0,
  });
}
