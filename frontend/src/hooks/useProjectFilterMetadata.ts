import { useQuery, QueryClient, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/services/api';
import { ProjectFilterMetadataResponse } from '@/types/models';
import { trackPerformanceEvent } from '@/utils/monitoring';

export const PROJECT_FILTER_METADATA_KEY = ['projectFilterMetadata'] as const;

export function useProjectFilterMetadata() {
  const queryClient = useQueryClient();

  const query = useQuery<ProjectFilterMetadataResponse, Error>({
    queryKey: PROJECT_FILTER_METADATA_KEY,
    queryFn: async () => {
      const start = performance.now();
      try {
        const data = await projectsApi.getFilterMetadata();
        const duration = performance.now() - start;
        // Non-noisy metric; only logs if VITE_MONITORING_DEBUG=true
        trackPerformanceEvent('projects.filterMetadata.fetch', duration, 'ms');
        return data;
      } catch (err) {
        const duration = performance.now() - start;
        trackPerformanceEvent('projects.filterMetadata.fetch.error', duration, 'ms');
        throw err;
      }
    },
    staleTime: 30_000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
    placeholderData: undefined,
    networkMode: 'online',
  });

  const loading = query.isLoading || query.isFetching;
  const error = query.error ? query.error.message : null;

  return {
    filterMetadata: query.data ?? null,
    loading,
    error,
    refetch: query.refetch,
    isUsingFallback: Boolean(query.error),
    invalidate: () => queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY }),
  };
}

// Helper for mutations to invalidate filter metadata
export function invalidateProjectFilterMetadata(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: PROJECT_FILTER_METADATA_KEY });
}
