import React from 'react';
import { apiClient, authHeaders } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { trackPerformanceEvent } from '@/utils/monitoring';
import type { Summary, Alerts } from '@/components/personal/MySummaryCard';
import type { ProjectItem } from '@/components/personal/MyProjectsCard';
import type { DeliverableItem } from '@/components/personal/MyDeliverablesCard';
import { subscribeAssignmentsRefresh } from '@/lib/assignmentsRefreshBus';
import { subscribeDeliverablesRefresh } from '@/lib/deliverablesRefreshBus';
import { subscribeProjectsRefresh } from '@/lib/projectsRefreshBus';

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

async function fetchPersonalWork(personId: number): Promise<PersonalWorkPayload> {
  let attempt = 0;
  let delay = 500;
  const start = typeof performance !== 'undefined' ? performance.now() : 0;
  while (attempt < 3) {
    try {
      const res = await apiClient.GET('/personal/work/' as any, { headers: authHeaders() });
      const payload = (res as any)?.data ?? res;
      if (!payload) throw new Error('Empty response');
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

export function usePersonalWork() {
  const auth = useAuth();
  const personId = auth?.person?.id ?? null;
  const [{ data, loading, error }, setState] = React.useState<HookState>({ data: null, loading: false, error: null });
  const inflightRef = React.useRef<Promise<PersonalWorkPayload> | null>(null);
  const requestIdRef = React.useRef(0);
  const refreshTimerRef = React.useRef<number | null>(null);

  const loadPersonalWork = React.useCallback(async (opts?: { force?: boolean }) => {
    if (!personId) return;
    const requestId = ++requestIdRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    let request = inflightRef.current;
    if (!request || opts?.force) {
      request = fetchPersonalWork(personId);
      inflightRef.current = request;
    }
    try {
      const payload = await request;
      if (requestId !== requestIdRef.current) return;
      setState({ data: payload, loading: false, error: null });
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Failed to refresh personal work' }));
    } finally {
      if (inflightRef.current === request) {
        inflightRef.current = null;
      }
    }
  }, [personId]);

  const refresh = React.useCallback(
    async (opts?: { force?: boolean }) => {
      await loadPersonalWork({ force: opts?.force ?? true });
    },
    [loadPersonalWork]
  );

  React.useEffect(() => {
    if (!personId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    loadPersonalWork();
  }, [personId, loadPersonalWork]);

  React.useEffect(() => {
    if (!personId) return;
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = window.setTimeout(() => {
        refreshTimerRef.current = null;
        refresh({ force: true });
      }, 200);
    };
    const unsubscribeAssignments = subscribeAssignmentsRefresh((event) => {
      if (event?.personId && event.personId !== personId) return;
      scheduleRefresh();
    });
    const unsubscribeProjects = subscribeProjectsRefresh(() => {
      scheduleRefresh();
    });
    const unsubscribeDeliverables = subscribeDeliverablesRefresh(() => {
      scheduleRefresh();
    });
    return () => {
      unsubscribeAssignments();
      unsubscribeProjects();
      unsubscribeDeliverables();
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [personId, refresh]);

  return {
    data,
    loading,
    error,
    refresh,
    hasPerson: Boolean(personId),
  };
}
