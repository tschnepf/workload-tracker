import { useQuery } from '@tanstack/react-query';
import { systemApi, type SystemCapabilities } from '../services/api';

export type Capabilities = SystemCapabilities;

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
  personalDashboard: true,
};

export function useCapabilities(options?: { enabled?: boolean }) {
  return useQuery<Capabilities, Error>({
    queryKey: ['capabilities'],
    queryFn: () => systemApi.getCapabilities(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    enabled: options?.enabled ?? true,
    select: (data) => ({
      ...defaultCaps,
      ...data,
      aggregates: { ...defaultCaps.aggregates, ...(data?.aggregates || {}) },
      cache: { ...defaultCaps.cache, ...(data?.cache || {}) },
      integrations: { ...defaultCaps.integrations, ...(data?.integrations || {}) },
    }),
  });
}
