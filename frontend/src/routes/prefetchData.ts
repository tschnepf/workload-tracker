import { queryClient } from '@/lib/queryClient';
import { getFlag } from '@/lib/flags';
import { trackPerformanceEvent } from '@/utils/monitoring';
import { projectsApi, peopleApi } from '@/services/api';
import { buildProjectsQueryKey, buildProjectsSearchPayloadBase } from '@/hooks/useProjects';

const PREFETCH_ROUTE_BUDGETS: Record<string, number> = {
  '/projects': 3,
  '/assignments': 3,
  '/project-assignments': 3,
};
const prefetchUsageByRoute = new Map<string, number>();

function connectionAllowsPrefetch(): boolean {
  try {
    const nav: any = (navigator as any);
    if (nav?.connection?.saveData) return false;
    const type = nav?.connection?.effectiveType;
    if (typeof type === 'string' && /^(2g|slow-2g|3g)$/i.test(type)) return false;
  } catch {}
  return true;
}

function budgetKeyFor(path: string): string {
  const p = path.replace(/\/$/, '') || '/';
  if (p.startsWith('/projects')) return '/projects';
  if (p.startsWith('/assignments')) return '/assignments';
  if (p.startsWith('/project-assignments')) return '/project-assignments';
  return p;
}

function claimPrefetchBudget(path: string): { allowed: boolean; key: string; used: number; limit: number } {
  const key = budgetKeyFor(path);
  const limit = PREFETCH_ROUTE_BUDGETS[key] ?? 1;
  const used = prefetchUsageByRoute.get(key) ?? 0;
  if (used >= limit) {
    return { allowed: false, key, used, limit };
  }
  prefetchUsageByRoute.set(key, used + 1);
  return { allowed: true, key, used: used + 1, limit };
}

export async function prefetchDataForRoute(path: string): Promise<void> {
  if (!getFlag('ROUTE_PREFETCH', true)) return;
  if (!connectionAllowsPrefetch()) return;
  const start = performance.now();
  const p = path.replace(/\/$/, '') || '/';
  const budget = claimPrefetchBudget(p);
  if (!budget.allowed) {
    trackPerformanceEvent('prefetch.data.skip_budget', 1, 'count', { path: budget.key, used: String(budget.used), limit: String(budget.limit) });
    return;
  }
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
    if (p.startsWith('/assignments') || p.startsWith('/project-assignments')) {
      await queryClient.prefetchQuery({
        queryKey: ['capacityHeatmap', 'all', 0, 12],
        queryFn: () => peopleApi.capacityHeatmap({ weeks: 12, include_children: 0 }),
        staleTime: 30_000,
      });
      trackPerformanceEvent('prefetch.data.ok', performance.now() - start, 'ms', { path: budget.key, key: 'capacityHeatmap' });
      return;
    }
  } catch (error) {
    trackPerformanceEvent('prefetch.data.err', performance.now() - start, 'ms', { path: p, message: (error as Error)?.message });
  }
}
