import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Small helper for syncing grid state with URL query params.
 * Keeps other params intact and replaces history entries for smoother UX.
 */
export function useGridUrlState() {
  const location = useLocation();
  const navigate = useNavigate();

  const getAll = useCallback(() => new URLSearchParams(location.search), [location.search]);

  const get = useCallback((key: string): string | null => {
    const sp = getAll();
    const v = sp.get(key);
    return v === null ? null : v;
  }, [getAll]);

  const set = useCallback((key: string, value: string | null | undefined) => {
    const sp = getAll();
    if (value === null || value === undefined || value === '') sp.delete(key); else sp.set(key, value);
    navigate({ pathname: location.pathname, search: `?${sp.toString()}` }, { replace: true });
  }, [getAll, location.pathname, navigate]);

  const setMany = useCallback((entries: Record<string, string | null | undefined>) => {
    const sp = getAll();
    for (const [k, v] of Object.entries(entries)) {
      if (v === null || v === undefined || v === '') sp.delete(k); else sp.set(k, v);
    }
    navigate({ pathname: location.pathname, search: `?${sp.toString()}` }, { replace: true });
  }, [getAll, location.pathname, navigate]);

  return { get, set, setMany };
}

