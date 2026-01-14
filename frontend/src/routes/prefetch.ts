import { getFlag, getNumberFlag } from '@/lib/flags';
import { trackPerformanceEvent } from '@/utils/monitoring';

// Track seen/prefetched paths and in-flight work
const prefetched = new Set<string>();
const inflight = new Map<string, Promise<any>>();

function connectionAllowsPrefetch(): boolean {
  try {
    const nav: any = (navigator as any);
    if (nav?.connection?.saveData) return false;
    const type = nav?.connection?.effectiveType;
    if (typeof type === 'string' && /^(2g|slow-2g|3g)$/i.test(type)) return false;
  } catch {}
  return true;
}

function normalize(path: string): string {
  // Collapse trailing slashes; use pathname only
  try {
    if (path.startsWith('http')) {
      const u = new URL(path);
      path = u.pathname;
    }
  } catch {}
  return path.replace(/\/$/, '') || '/';
}

// Map a route path to its dynamic importer. Keep this small and focused on top routes.
function importerFor(path: string): (() => Promise<any>) | null {
  const p = normalize(path);
  if (p === '/' || p.startsWith('/dashboard')) return () => import('@/pages/Dashboard');
  if (p.startsWith('/people')) return () => import('@/pages/People');
  if (p.startsWith('/assignments') || p.startsWith('/project-assignments')) return () => import('@/pages/Assignments');
  if (p.startsWith('/departments')) return () => import('@/pages/Departments');
  if (p === '/projects') return () => import('@/pages/Projects');
  if (p.startsWith('/projects/') && p.endsWith('/new')) {
    return () => import('@/pages/Projects/ProjectForm');
  }
  if (p.startsWith('/projects/') && p.endsWith('/dashboard')) {
    return () => import('@/pages/Projects/ProjectDashboard');
  }
  if (p.startsWith('/projects/') && (/\/\d+\/(edit|update)$/.test(p) || p.endsWith('/edit'))) {
    // Legacy edit paths now redirect to Projects with deep-link selection
    return () => import('@/pages/Projects');
  }
  if (p.startsWith('/skills')) return () => import('@/pages/Skills');
  if (p.startsWith('/performance')) return () => import('@/pages/Performance/PerformanceDashboard');
  if (p.startsWith('/settings')) return () => import('@/pages/Settings/Settings');
  if (p.startsWith('/deliverables/calendar')) return () => import('@/pages/Deliverables/Calendar');
  if (p.startsWith('/reports/forecast')) return () => import('@/pages/Reports/TeamForecast');
  if (p.startsWith('/profile')) return () => import('@/pages/Profile/Profile');
  if (p.startsWith('/help')) return () => import('@/pages/ComingSoon/ComingSoon');
  if (p.startsWith('/my-work')) return () => import('@/pages/Personal/PersonalDashboard');
  return null;
}

export function wasPrefetched(path: string): boolean {
  return prefetched.has(normalize(path));
}

export async function prefetchRoute(path: string, opts?: { delayMs?: number; force?: boolean }): Promise<void> {
  const startTs = performance.now();
  const allowPrefetch = getFlag('ROUTE_PREFETCH', true);
  const maxConcurrent = Math.max(1, getNumberFlag('PREFETCH_CONCURRENCY', 2));
  const delayMs = Math.max(0, opts?.delayMs ?? 120);
  const key = normalize(path);

  if (!opts?.force) {
    if (!allowPrefetch) return;
    if (!connectionAllowsPrefetch()) return;
  }

  if (prefetched.has(key)) {
    // Already done; record a lightweight breadcrumb
    trackPerformanceEvent('prefetch.chunk.skip', 1, 'count', { path: key });
    return;
  }

  if (inflight.has(key)) return; // dedupe
  if (inflight.size >= maxConcurrent) return; // naive concurrency gate

  const importer = importerFor(key);
  if (!importer) return;

  const work = (async () => {
    try {
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      await importer();
      prefetched.add(key);
      const dur = performance.now() - startTs;
      trackPerformanceEvent('prefetch.chunk.ok', dur, 'ms', { path: key });
    } catch (error) {
      const dur = performance.now() - startTs;
      trackPerformanceEvent('prefetch.chunk.err', dur, 'ms', { path: key, message: (error as Error)?.message });
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, work);
  await work;
}
