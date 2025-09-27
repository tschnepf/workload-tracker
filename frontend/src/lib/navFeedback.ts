import { useSyncExternalStore } from 'react';

type NavListener = () => void;

let pendingPath: string | null = null;
const listeners = new Set<NavListener>();

export function setPendingPath(path: string | null) {
  pendingPath = path;
  listeners.forEach((l) => l());
}

export function getPendingPath() {
  return pendingPath;
}

export function subscribeNav(listener: NavListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNavFeedback() {
  const path = useSyncExternalStore(subscribeNav, () => pendingPath, () => pendingPath);
  return { pendingPath: path };
}
