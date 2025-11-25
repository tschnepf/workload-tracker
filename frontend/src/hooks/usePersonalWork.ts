import React from 'react';
import { apiClient, authHeaders } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { trackPerformanceEvent } from '@/utils/monitoring';
import type { Summary, Alerts } from '@/components/personal/MySummaryCard';
import type { ProjectItem } from '@/components/personal/MyProjectsCard';
import type { DeliverableItem } from '@/components/personal/MyDeliverablesCard';

export type PersonalWorkPayload = {
  summary?: Summary | null;
  alerts?: Alerts | null;
  projects?: ProjectItem[];
  deliverables?: DeliverableItem[];
  schedule?: {
    weekKeys: string[];
    weeklyCapacity: number;
    weekTotals: Record<string, number>;
  } | null;
};

type HookState = {
  data: PersonalWorkPayload | null;
  loading: boolean;
  error: string | null;
};

const cache = new Map<number, PersonalWorkPayload>();
const inflight = new Map<number, Promise<PersonalWorkPayload>>();

async function fetchPersonalWork(personId: number): Promise<PersonalWorkPayload> {
  let attempt = 0;
  let delay = 500;
  const start = typeof performance !== 'undefined' ? performance.now() : 0;
  while (attempt < 3) {
    try {
      const res = await apiClient.GET('/personal/work/' as any, { headers: authHeaders() });
      const payload = (res as any)?.data ?? res;
      if (!payload) throw new Error('Empty response');
      cache.set(personId, payload);
      if (start) trackPerformanceEvent('personal_work_fetch_ms', Math.round(performance.now() - start), 'ms', { ok: true, attempt });
      return payload;
    } catch (err) {
      attempt += 1;
      if (start) trackPerformanceEvent('personal_work_fetch_ms', Math.round(performance.now() - start), 'ms', { ok: false, attempt });
      if (attempt >= 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 4000);
    }
  }
  throw new Error('Failed to fetch personal work');
}

function loadPersonalWork(personId: number, force = false) {
  if (!force && cache.has(personId)) {
    return Promise.resolve(cache.get(personId)!);
  }
  if (!force && inflight.has(personId)) {
    return inflight.get(personId)!;
  }
  const promise = fetchPersonalWork(personId).finally(() => {
    inflight.delete(personId);
  });
  inflight.set(personId, promise);
  return promise;
}

export function usePersonalWork() {
  const auth = useAuth();
  const personId = auth?.person?.id ?? null;
  const [{ data, loading, error }, setState] = React.useState<HookState>({ data: null, loading: false, error: null });

  const refresh = React.useCallback(
    async (opts?: { force?: boolean }) => {
      if (!personId) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const payload = await loadPersonalWork(personId, opts?.force ?? true);
        setState({ data: payload, loading: false, error: null });
      } catch (err: any) {
        setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Failed to refresh personal work' }));
      }
    },
    [personId]
  );

  React.useEffect(() => {
    let cancelled = false;
    if (!personId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: !cache.has(personId), error: null }));
    loadPersonalWork(personId)
      .then((payload) => {
        if (!cancelled) setState({ data: payload, loading: false, error: null });
      })
      .catch((err: any) => {
        if (!cancelled) setState({ data: null, loading: false, error: err?.message || 'Failed to load personal work' });
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  return {
    data,
    loading,
    error,
    refresh,
    hasPerson: Boolean(personId),
  };
}
