import { useEffect, useMemo, useState } from 'react';
import type { Deliverable, Project } from '@/types/models';
import { deliverablesApi } from '@/services/api';

export interface PrevDeliverablesResult {
  prevMap: Map<number, Deliverable | null>;
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

function pickMostRecent(deliverables: Deliverable[] | undefined): Deliverable | null {
  if (!deliverables || deliverables.length === 0) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidates = deliverables
    .filter(d => !!d.date)
    .map(d => ({ d, when: parseLocal(d.date as string), completed: !!d.isCompleted }))
    .filter(x => !isNaN(x.when.getTime()))
    // consider items up to today, or explicitly completed
    .filter(x => x.when <= today || x.completed)
    .sort((a, b) => b.when.getTime() - a.when.getTime());
  return candidates.length > 0 ? candidates[0].d : null;
}

export function usePrevDeliverables(projects: Project[] | null | undefined): PrevDeliverablesResult {
  const [prevMap, setPrevMap] = useState<Map<number, Deliverable | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => (projects || []).map(p => p.id).filter((id): id is number => typeof id === 'number'), [projects]);
  const idsKey = useMemo(() => ids.sort((a, b) => a - b).join(','), [ids]);

  const load = async () => {
    if (ids.length === 0) {
      setPrevMap(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bulk = await deliverablesApi.bulkList(ids);
      const m = new Map<number, Deliverable | null>();
      ids.forEach(pid => {
        const list = bulk[String(pid)] || [];
        m.set(pid, pickMostRecent(list));
      });
      setPrevMap(m);
    } catch (e: any) {
      setError(e?.message || 'Failed to load deliverables');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const refreshOne = async (projectId: number) => {
    if (!projectId) return;
    try {
      const list = await deliverablesApi.listAll(projectId);
      const prev = pickMostRecent(list);
      setPrevMap(prevMap => {
        const m = new Map(prevMap);
        m.set(projectId, prev);
        return m;
      });
    } catch {/* ignore individual errors */}
  };

  return { prevMap, loading, error, refresh: load, refreshOne } as const;
}

export type UsePrevDeliverablesReturn = ReturnType<typeof usePrevDeliverables>;

