import { useMemo, useRef } from 'react';

/**
 * Minimal AbortController manager for request cancellation and basic deduplication.
 * - create(key): aborts any existing controller for key, creates a new one, and returns its signal
 * - abort(key): aborts a specific controller
 * - abortAll(): aborts all controllers
 * - getSignal(key): returns current signal for key (if any)
 */
export function useAbortManager() {
  const mapRef = useRef<Map<string, AbortController>>(new Map());

  return useMemo(() => ({
    create: (key: string): AbortSignal => {
      try {
        const existing = mapRef.current.get(key);
        if (existing) existing.abort();
      } catch {}
      const ac = new AbortController();
      mapRef.current.set(key, ac);
      return ac.signal;
    },
    abort: (key: string) => {
      const ac = mapRef.current.get(key);
      if (ac) ac.abort();
      mapRef.current.delete(key);
    },
    abortAll: () => {
      for (const [, ac] of mapRef.current.entries()) {
        try { ac.abort(); } catch {}
      }
      mapRef.current.clear();
    },
    getSignal: (key: string): AbortSignal | undefined => {
      const ac = mapRef.current.get(key);
      return ac?.signal;
    },
  }), []);
}

