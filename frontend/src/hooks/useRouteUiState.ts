import { useCallback, useMemo, useState } from 'react';

export type RouteUiState = {
  paneOpen?: boolean;
  splitPct?: number;
  selectedId?: number | null;
  expandedIds?: number[];
  density?: 'comfortable' | 'compact';
};

const STORAGE_PREFIX = 'route-ui:';

function safeRead(routeKey: string): RouteUiState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${routeKey}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as RouteUiState;
  } catch {
    return {};
  }
}

function safeWrite(routeKey: string, state: RouteUiState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${routeKey}`, JSON.stringify(state));
  } catch {}
}

export function useRouteUiState(routeKey: string) {
  const [state, setState] = useState<RouteUiState>(() => safeRead(routeKey));

  const update = useCallback((patch: Partial<RouteUiState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      safeWrite(routeKey, next);
      return next;
    });
  }, [routeKey]);

  const reset = useCallback(() => {
    setState({});
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${routeKey}`);
      } catch {}
    }
  }, [routeKey]);

  return useMemo(() => ({ state, update, reset }), [state, update, reset]);
}
