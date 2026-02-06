import { useQuery, QueryClient, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '@/services/api';
import { ProjectFilterMetadataResponse } from '@/types/models';
import { trackPerformanceEvent } from '@/utils/monitoring';

export const PROJECT_FILTER_METADATA_KEY = ['projectFilterMetadata'] as const;

export type ProjectFilterMetadataParams = {
  department?: number;
  include_children?: 0 | 1;
  status_in?: string;
  vertical?: number;
  search_tokens?: Array<{ term: string; op: 'or' | 'and' | 'not' }>;
  department_filters?: Array<{ departmentId: number; op: 'or' | 'and' | 'not' }>;
};

function stableStringify(value: any): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash &= 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

function normalizeSearchTokens(tokens?: Array<{ term: string; op: 'or' | 'and' | 'not' }>) {
  if (!tokens || tokens.length === 0) return [];
  return tokens
    .map((token) => ({
      term: (token?.term || '').trim().toLowerCase(),
      op: token?.op === 'not' || token?.op === 'and' ? token.op : 'or',
    }))
    .filter((token) => token.term.length > 0);
}

function normalizeDepartmentFilters(filters?: Array<{ departmentId: number; op: 'or' | 'and' | 'not' }>) {
  if (!filters || filters.length === 0) return [];
  const seen = new Set<number>();
  const cleaned: Array<{ departmentId: number; op: 'or' | 'and' | 'not' }> = [];
  filters.forEach((filter) => {
    const id = Number(filter?.departmentId);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) return;
    const op = filter?.op === 'not' || filter?.op === 'or' ? filter.op : 'and';
    cleaned.push({ departmentId: id, op });
    seen.add(id);
  });
  return cleaned.sort((a, b) => (a.departmentId - b.departmentId) || a.op.localeCompare(b.op));
}

export function buildProjectFilterMetadataKey(params?: ProjectFilterMetadataParams) {
  const searchTokens = normalizeSearchTokens(params?.search_tokens);
  const departmentFilters = normalizeDepartmentFilters(params?.department_filters);
  const keyPayload = {
    department: params?.department ?? null,
    include_children: params?.include_children ?? 0,
    status_in: params?.status_in ?? null,
    vertical: params?.vertical ?? null,
    search_tokens: searchTokens,
    department_filters: departmentFilters,
  };
  const hash = hashString(stableStringify(keyPayload));
  return [
    ...PROJECT_FILTER_METADATA_KEY,
    hash,
  ] as const;
}

export function useProjectFilterMetadata(params?: ProjectFilterMetadataParams) {
  const queryClient = useQueryClient();

  const query = useQuery<ProjectFilterMetadataResponse, Error>({
    queryKey: buildProjectFilterMetadataKey(params),
    queryFn: async () => {
      const start = performance.now();
      try {
        const data = await projectsApi.getFilterMetadata(params);
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

  const loading = query.isLoading;
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
