import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/utils/useDebounce';
import { reportsApi } from '@/services/api';
import type { NetworkGraphBootstrapResponse, NetworkGraphMode, NetworkGraphResponse } from '@/types/models';

export type NetworkGraphQueryParams = {
  mode: NetworkGraphMode;
  start?: string;
  end?: string;
  vertical?: number;
  department?: number;
  include_children?: 0 | 1;
  include_inactive?: 0 | 1;
  client?: string;
  max_edges?: number;
};

export function useNetworkGraphBootstrap(options?: {
  vertical?: number;
  department?: number;
  include_children?: 0 | 1;
  enabled?: boolean;
}) {
  return useQuery<NetworkGraphBootstrapResponse, Error>({
    queryKey: ['networkGraphBootstrap', options?.vertical ?? 'all', options?.department ?? 'all', options?.include_children ?? 0],
    queryFn: () =>
      reportsApi.getNetworkBootstrap({
        vertical: options?.vertical,
        department: options?.department,
        include_children: options?.include_children,
      }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}

export function useNetworkGraph(params: NetworkGraphQueryParams, options?: { enabled?: boolean }) {
  const serialized = useMemo(() => JSON.stringify(params), [params]);
  const debouncedSerialized = useDebounce(serialized, 250);
  const debouncedParams = useMemo(() => {
    try {
      return JSON.parse(debouncedSerialized) as NetworkGraphQueryParams;
    } catch {
      return params;
    }
  }, [debouncedSerialized, params]);

  return useQuery<NetworkGraphResponse, Error>({
    queryKey: ['networkGraph', debouncedSerialized],
    queryFn: () => reportsApi.getNetworkGraph(debouncedParams),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
  });
}
