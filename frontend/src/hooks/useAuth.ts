import { useSyncExternalStore } from 'react';
import { getState, subscribe } from '@/store/auth';

export function useAuth() {
  const snapshot = useSyncExternalStore(subscribe, getState, getState);
  return snapshot;
}

