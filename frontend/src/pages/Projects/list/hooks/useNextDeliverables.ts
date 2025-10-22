import { useEffect, useMemo, useState } from 'react';
import type { Deliverable, Project } from '@/types/models';
import { deliverablesApi } from '@/services/api';

export interface NextDeliverablesResult {
  nextMap: Map<number, Deliverable | null>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshOne: (projectId: number) => Promise<void>;
}

// Parse server YYYY-MM-DD as local midnight to avoid TZ off-by-one
const parseLocal = (dateStr: string) => {
  try {
    const s = (dateStr || '').slice(0, 10);
    return new Date(`${s}T00:00:00`);
  } catch {
    return new Date(NaN);
  }
};

function pickNextUpcoming(deliverables: Deliverable[] | undefined): Deliverable | null {
  if (!deliverables || deliverables.length === 0) return null;
  const today = new Date();
  // Normalize to start of day
  today.setHours(0, 0, 0, 0);
  const candidates = deliverables
    .filter(d => !d.isCompleted && d.date)
    .map(d => ({ d, when: parseLocal(d.date as string) }))
    .filter(x => !isNaN(x.when.getTime()) && x.when >= today)
    .sort((a, b) => a.when.getTime() - b.when.getTime());
  return candidates.length > 0 ? candidates[0].d : null;
}

export function useNextDeliverables(projects: Project[] | null | undefined): NextDeliverablesResult {
  const [nextMap, setNextMap] = useState<Map<number, Deliverable | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => (projects || []).map(p => p.id).filter((id): id is number => typeof id === 'number'), [projects]);
  const idsKey = useMemo(() => ids.sort((a, b) => a - b).join(','), [ids]);

  const load = async () => {
    if (ids.length === 0) {
      setNextMap(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bulk = await deliverablesApi.bulkList(ids);
      const m = new Map<number, Deliverable | null>();
      ids.forEach(pid => {
        const list = bulk[String(pid)] || [];
        m.set(pid, pickNextUpcoming(list));
      });
      setNextMap(m);
    } catch (e: any) {
      setError(e?.message || 'Failed to load deliverables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load when project ID set changes
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // Targeted refresh for a single project (after add/edit/delete)
  const refreshOne = async (projectId: number) => {
    if (!projectId) return;
    try {
      const list = await deliverablesApi.listAll(projectId);
      const next = pickNextUpcoming(list);
      setNextMap(prev => {
        const m = new Map(prev);
        m.set(projectId, next);
        return m;
      });
    } catch {/* ignore individual errors */}
  };

  return { nextMap, loading, error, refresh: load, refreshOne } as const;
}

export type UseNextDeliverablesReturn = ReturnType<typeof useNextDeliverables>;
