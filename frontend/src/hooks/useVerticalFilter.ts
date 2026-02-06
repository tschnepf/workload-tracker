import { useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import {
  ensureInitialized,
  subscribe,
  getState,
  setVertical,
  clearVertical,
  type VerticalFilterState,
} from '@/store/verticalFilter';

export function useVerticalFilter() {
  ensureInitialized();
  const state = useSyncExternalStore(subscribe, getState, getState);

  const actions = useMemo(
    () => ({
      setVertical,
      clearVertical,
    }),
    []
  );

  return {
    state: state as VerticalFilterState,
    ...actions,
  };
}

export type { VerticalFilterState } from '@/store/verticalFilter';
