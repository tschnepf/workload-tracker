import { useQuery } from '@tanstack/react-query';
import { systemApi } from '../services/api';

export type Capabilities = {
  asyncJobs: boolean;
  aggregates: Record<string, boolean>;
  cache: { shortTtlAggregates: boolean; aggregateTtlSeconds: number };
  projectRolesByDepartment?: boolean;
  integrations?: { enabled: boolean };
};

const defaultCaps: Capabilities = {
  asyncJobs: false,
  aggregates: {
    capacityHeatmap: true,
    projectAvailability: true,
    findAvailable: true,
    gridSnapshot: true,
    skillMatch: true,
  },
  cache: { shortTtlAggregates: false, aggregateTtlSeconds: 30 },
  projectRolesByDepartment: false,
  integrations: { enabled: false },
};

export function useCapabilities() {
  return useQuery<Capabilities, Error>({
    queryKey: ['capabilities'],
    queryFn: () => systemApi.getCapabilities(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    select: (data) => ({ ...defaultCaps, ...data, cache: { ...defaultCaps.cache, ...(data?.cache || {}) } }),
  });
}
