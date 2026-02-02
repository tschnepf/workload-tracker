import { queryClient } from '@/lib/queryClient';
import { getFlag } from '@/lib/flags';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { projectsApi, peopleApi } from '@/services/api';
import { buildProjectsQueryKey, buildProjectsSearchPayloadBase } from '@/hooks/useProjects';

function connectionAllowsPrefetch(): boolean {
  try {
    const nav: any = (navigator as any);
    if (nav?.connection?.saveData) return false;
    const type = nav?.connection?.effectiveType;
    if (typeof type === 'string' && /^(2g|slow-2g|3g)$/i.test(type)) return false;
  } catch {}
  return true;
}

export async function prefetchDataForRoute(path: string): Promise<void> {
  if (!getFlag('ROUTE_PREFETCH', true)) return;
  if (!connectionAllowsPrefetch()) return;
  const start = performance.now();
  const p = path.replace(/\/$/, '') || '/';
  try {
    if (p.startsWith('/projects')) {
      const searchOptions = { ordering: 'client,name', pageSize: 100, useSearch: true };
      const searchPayloadBase = buildProjectsSearchPayloadBase(searchOptions);
      await queryClient.prefetchInfiniteQuery({
        queryKey: buildProjectsQueryKey(searchOptions),
        queryFn: ({ pageParam = 1 }) => projectsApi.search({ ...searchPayloadBase, page: pageParam }),
        initialPageParam: 1,
      });
      trackPerformanceEvent('prefetch.data.ok', performance.now() - start, 'ms', { path: '/projects', key: 'projects' });
      return;
    }
    if (p.startsWith('/assignments')) {
      await queryClient.prefetchQuery({
        queryKey: ['capacityHeatmap', 'all', 0, 12],
        queryFn: () => peopleApi.capacityHeatmap({ weeks: 12, include_children: 0 }),
        staleTime: 30_000,
      });
      trackPerformanceEvent('prefetch.data.ok', performance.now() - start, 'ms', { path: '/assignments', key: 'capacityHeatmap' });
      return;
    }
  } catch (error) {
    trackPerformanceEvent('prefetch.data.err', performance.now() - start, 'ms', { path: p, message: (error as Error)?.message });
  }
}
