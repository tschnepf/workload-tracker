import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Deliverable, Project } from '@/types/models';
import { deliverablesApi } from '@/services/api';
import { pickMostRecent, pickNextUpcoming } from './deliverablePickers';
import { subscribeDeliverablesRefresh } from '@/lib/deliverablesRefreshBus';

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
  const loadSeqRef = useRef(0);
  const refreshSeqRef = useRef<Map<number, number>>(new Map());
  const idsRef = useRef<number[]>([]);
  const refreshQueueRef = useRef<{ timer: ReturnType<typeof setTimeout> | null }>({
    timer: null,
  });

  const ids = useMemo(() => (projects || []).map(p => p.id).filter((id): id is number => typeof id === 'number'), [projects]);
  const idsKey = useMemo(() => ids.slice().sort((a, b) => a - b).join(','), [ids]);

  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  const load = useCallback(async () => {
    const currentIds = idsRef.current;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    if (currentIds.length === 0) {
      setNextMap(new Map());
      setPrevMap(new Map());
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bulk = await deliverablesApi.bulkList(currentIds);
      if (loadSeqRef.current !== seq) return;
      const next = new Map<number, Deliverable | null>();
      const prev = new Map<number, Deliverable | null>();
      currentIds.forEach(pid => {
        const list = bulk[String(pid)] || [];
        next.set(pid, pickNextUpcoming(list));
        prev.set(pid, pickMostRecent(list));
      });
      setNextMap(next);
      setPrevMap(prev);
    } catch (e: any) {
      if (loadSeqRef.current !== seq) return;
      setError(e?.message || 'Failed to load deliverables');
    } finally {
      if (loadSeqRef.current === seq) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [idsKey, load]);

  const refreshOne = useCallback(async (projectId: number) => {
    if (!projectId) return;
    if (!idsRef.current.includes(projectId)) return;
    const seqMap = refreshSeqRef.current;
    const seq = (seqMap.get(projectId) || 0) + 1;
    seqMap.set(projectId, seq);
    try {
      const list = await deliverablesApi.listAll(projectId);
      if (seqMap.get(projectId) !== seq) return;
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
  }, []);

  const scheduleRefresh = useCallback(() => {
    const queue = refreshQueueRef.current;
    if (queue.timer) return;
    queue.timer = setTimeout(async () => {
      queue.timer = null;
      await load();
    }, 300);
  }, [load, refreshOne]);

  useEffect(() => {
    const unsubscribe = subscribeDeliverablesRefresh(() => {
      scheduleRefresh();
    });
    return () => {
      unsubscribe();
      const queue = refreshQueueRef.current;
      if (queue.timer) {
        clearTimeout(queue.timer);
        queue.timer = null;
      }
    };
  }, [scheduleRefresh]);

  return { nextMap, prevMap, loading, error, refresh: load, refreshOne } as const;
}

export type UseProjectDeliverablesBulkReturn = ReturnType<typeof useProjectDeliverablesBulk>;
