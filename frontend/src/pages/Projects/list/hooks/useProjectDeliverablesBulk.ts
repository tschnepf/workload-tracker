import { useEffect, useMemo, useState } from 'react';
import type { Deliverable, Project } from '@/types/models';
import { deliverablesApi } from '@/services/api';
import { pickMostRecent, pickNextUpcoming } from './deliverablePickers';

export interface ProjectDeliverablesBulkResult {
  nextMap: Map<number, Deliverable | null>;
  prevMap: Map<number, Deliverable | null>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshOne: (projectId: number) => Promise<void>;
}

export function useProjectDeliverablesBulk(projects: Project[] | null | undefined): ProjectDeliverablesBulkResult {
  const [nextMap, setNextMap] = useState<Map<number, Deliverable | null>>(new Map());
  const [prevMap, setPrevMap] = useState<Map<number, Deliverable | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => (projects || []).map(p => p.id).filter((id): id is number => typeof id === 'number'), [projects]);
  const idsKey = useMemo(() => ids.slice().sort((a, b) => a - b).join(','), [ids]);

  const load = async () => {
    if (ids.length === 0) {
      setNextMap(new Map());
      setPrevMap(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bulk = await deliverablesApi.bulkList(ids);
      const next = new Map<number, Deliverable | null>();
      const prev = new Map<number, Deliverable | null>();
      ids.forEach(pid => {
        const list = bulk[String(pid)] || [];
        next.set(pid, pickNextUpcoming(list));
        prev.set(pid, pickMostRecent(list));
      });
      setNextMap(next);
      setPrevMap(prev);
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
      const next = pickNextUpcoming(list);
      const prev = pickMostRecent(list);
      setNextMap(m => {
        const n = new Map(m);
        n.set(projectId, next);
        return n;
      });
      setPrevMap(m => {
        const n = new Map(m);
        n.set(projectId, prev);
        return n;
      });
    } catch {/* ignore individual errors */}
  };

  return { nextMap, prevMap, loading, error, refresh: load, refreshOne } as const;
}

export type UseProjectDeliverablesBulkReturn = ReturnType<typeof useProjectDeliverablesBulk>;

