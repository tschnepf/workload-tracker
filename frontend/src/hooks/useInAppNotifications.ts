import { useCallback, useEffect, useRef, useState } from 'react';
import { authApi, type InAppNotificationItem } from '@/services/api';
import { emitToast } from '@/lib/toastBus';

export function useInAppNotifications(options?: { enabled?: boolean; pollMs?: number; limit?: number }) {
  const enabled = options?.enabled ?? true;
  const pollMs = Math.max(10000, Number(options?.pollMs || 60000));
  const limit = Math.max(1, Math.min(100, Number(options?.limit || 50)));

  const [items, setItems] = useState<InAppNotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const knownIdsRef = useRef<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await authApi.listInAppNotifications({ limit });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      const nextIds = new Set<number>(nextItems.map((item) => Number(item.id)).filter((id) => Number.isFinite(id)));

      if (initializedRef.current) {
        nextItems
          .filter((item) => item && !knownIdsRef.current.has(Number(item.id)))
          .slice(0, 3)
          .forEach((item) => {
            const body = String(item.body || '').trim();
            const message = body ? `${item.title}: ${body}` : item.title;
            emitToast({
              message,
              type: 'info',
              dedupeKey: `in-app-${item.id}`,
              durationMs: 8000,
            });
          });
      }

      initializedRef.current = true;
      knownIdsRef.current = nextIds;
      setItems(nextItems);
      setUnreadCount(Number(data?.unreadCount || 0));
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load in-browser notifications');
    } finally {
      setLoading(false);
    }
  }, [enabled, limit]);

  const markRead = useCallback(async (ids: number[]) => {
    const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
    if (!normalized.length) return;
    await authApi.markInAppNotificationsRead(normalized);
    await refresh();
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    await authApi.markAllInAppNotificationsRead();
    await refresh();
  }, [refresh]);

  const clear = useCallback(async (ids: number[]) => {
    const normalized = Array.from(new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)));
    if (!normalized.length) return;
    await authApi.clearInAppNotifications(normalized);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollMs, refresh]);

  return {
    items,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    clear,
  };
}
