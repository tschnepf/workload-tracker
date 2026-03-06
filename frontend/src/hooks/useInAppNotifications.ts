import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  authApi,
  type InAppNotificationItem,
  type InAppNotificationStatusFilter,
  type NotificationEventKey,
} from '@/services/api';
import { emitToast } from '@/lib/toastBus';

type InAppFilters = {
  eventKey?: NotificationEventKey;
  status?: InAppNotificationStatusFilter;
  projectId?: number | null;
};

type UseInAppNotificationsOptions = {
  enabled?: boolean;
  limit?: number;
  panelOpen?: boolean;
  pollVisibleMs?: number;
  pollHiddenMs?: number;
  pollPanelOpenMs?: number;
  initialFilters?: InAppFilters;
};

function mergeByIdDesc(existing: InAppNotificationItem[], incoming: InAppNotificationItem[]): InAppNotificationItem[] {
  const byId = new Map<number, InAppNotificationItem>();
  for (const row of existing) byId.set(Number(row.id), row);
  for (const row of incoming) byId.set(Number(row.id), row);
  return Array.from(byId.values()).sort((a, b) => Number(b.id) - Number(a.id));
}

function maxCreatedAtIso(rows: InAppNotificationItem[]): string | null {
  let best: string | null = null;
  for (const row of rows) {
    const createdAt = String(row?.createdAt || '');
    if (!createdAt) continue;
    if (!best || new Date(createdAt).getTime() > new Date(best).getTime()) best = createdAt;
  }
  return best;
}

export function useInAppNotifications(options?: UseInAppNotificationsOptions) {
  const enabled = options?.enabled ?? true;
  const limit = Math.max(1, Math.min(100, Number(options?.limit || 50)));
  const pollVisibleMs = Math.max(10000, Number(options?.pollVisibleMs || 60000));
  const pollHiddenMs = Math.max(30000, Number(options?.pollHiddenMs || 180000));
  const pollPanelOpenMs = Math.max(10000, Number(options?.pollPanelOpenMs || 15000));

  const [items, setItems] = useState<InAppNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InAppFilters>(options?.initialFilters || {});

  const initializedRef = useRef(false);
  const knownIdsRef = useRef<Set<number>>(new Set());
  const sinceRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const panelOpenRef = useRef<boolean>(Boolean(options?.panelOpen));

  useEffect(() => {
    panelOpenRef.current = Boolean(options?.panelOpen);
  }, [options?.panelOpen]);

  const refresh = useCallback(async (opts?: { full?: boolean; suppressLoading?: boolean }) => {
    if (!enabled) return;
    const full = Boolean(opts?.full);
    if (!opts?.suppressLoading) setLoading(true);
    try {
      const since = (!full && initializedRef.current) ? sinceRef.current : null;
      const data = await authApi.listInAppNotifications({
        limit,
        since,
        eventKey: filters.eventKey,
        status: filters.status || 'all',
        projectId: filters.projectId ?? undefined,
      });

      const incoming = Array.isArray(data?.items) ? data.items : [];
      const incomingIds = new Set<number>(
        incoming.map((row) => Number(row?.id)).filter((id) => Number.isFinite(id) && id > 0),
      );

      setItems((prev) => {
        const next = full ? incoming : mergeByIdDesc(prev, incoming);
        if (next.length > limit) return next.slice(0, limit);
        return next;
      });
      setUnreadCount(Number(data?.unreadCount || 0));
      setError(null);

      if (initializedRef.current) {
        for (const row of incoming) {
          const rowId = Number(row?.id || 0);
          if (!rowId || knownIdsRef.current.has(rowId)) continue;
          const body = String(row?.body || '').trim();
          emitToast({
            message: body ? `${row.title}: ${body}` : row.title,
            type: 'info',
            dedupeKey: `in-app-${rowId}`,
            durationMs: 8000,
          });
        }
      }

      if (full) {
        knownIdsRef.current = incomingIds;
      } else {
        for (const id of incomingIds) knownIdsRef.current.add(id);
      }
      initializedRef.current = true;
      const latest = maxCreatedAtIso(incoming);
      if (latest) sinceRef.current = latest;
    } catch (err: any) {
      setError(err?.message || 'Failed to load in-browser notifications');
    } finally {
      if (!opts?.suppressLoading) setLoading(false);
    }
  }, [enabled, limit, filters.eventKey, filters.projectId, filters.status]);

  const scheduleNextPoll = useCallback(() => {
    if (!enabled) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const hidden = typeof document !== 'undefined' ? document.hidden : false;
    const interval = panelOpenRef.current
      ? pollPanelOpenMs
      : hidden
        ? pollHiddenMs
        : pollVisibleMs;
    timerRef.current = window.setTimeout(async () => {
      await refresh({ suppressLoading: true });
      scheduleNextPoll();
    }, interval);
  }, [enabled, pollHiddenMs, pollPanelOpenMs, pollVisibleMs, refresh]);

  const setFilterState = useCallback((next: InAppFilters) => {
    setFilters(next);
  }, []);

  const markRead = useCallback(async (ids: number[], opened = false) => {
    const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => id > 0)));
    if (!normalized.length) return;
    await authApi.markInAppNotificationsRead(normalized, opened);
    await refresh({ full: true });
  }, [refresh]);

  const markUnread = useCallback(async (ids: number[]) => {
    const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => id > 0)));
    if (!normalized.length) return;
    await authApi.markInAppNotificationsUnread(normalized);
    await refresh({ full: true });
  }, [refresh]);

  const save = useCallback(async (ids: number[], saved: boolean) => {
    const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => id > 0)));
    if (!normalized.length) return;
    await authApi.saveInAppNotifications(normalized, saved);
    await refresh({ full: true });
  }, [refresh]);

  const snooze = useCallback(async (ids: number[], untilIso: string) => {
    const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => id > 0)));
    if (!normalized.length) return;
    await authApi.snoozeInAppNotifications(normalized, untilIso);
    await refresh({ full: true });
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    await authApi.markAllInAppNotificationsRead();
    await refresh({ full: true });
  }, [refresh]);

  const clear = useCallback(async (ids: number[]) => {
    const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => id > 0)));
    if (!normalized.length) return;
    await authApi.clearInAppNotifications(normalized);
    await refresh({ full: true });
  }, [refresh]);

  const clearAll = useCallback(async (payload?: {
    eventKey?: NotificationEventKey;
    projectId?: number | null;
    includeRead?: boolean;
  }) => {
    await authApi.clearAllInAppNotifications(payload);
    await refresh({ full: true });
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    sinceRef.current = null;
    knownIdsRef.current = new Set();
    initializedRef.current = false;
    void refresh({ full: true });
  }, [enabled, refresh, filters.eventKey, filters.projectId, filters.status]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      void refresh({ suppressLoading: true });
      scheduleNextPoll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    scheduleNextPoll();
    if (panelOpenRef.current) {
      void refresh({ suppressLoading: true });
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, refresh, scheduleNextPoll, options?.panelOpen]);

  return useMemo(() => ({
    items,
    unreadCount,
    loading,
    error,
    filters,
    setFilters: setFilterState,
    refresh: () => refresh({ full: true }),
    markRead,
    markUnread,
    markAllRead,
    save,
    snooze,
    clear,
    clearAll,
  }), [
    items,
    unreadCount,
    loading,
    error,
    filters,
    setFilterState,
    refresh,
    markRead,
    markUnread,
    markAllRead,
    save,
    snooze,
    clear,
    clearAll,
  ]);
}
