export type GridRefreshPayload = {
  touchedWeekKeys?: string[];
  reason?: string;
};

type Listener = (p: GridRefreshPayload) => void;

const listeners = new Set<Listener>();

export function subscribeGridRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitGridRefresh(payload: GridRefreshPayload) {
  for (const l of Array.from(listeners)) {
    try { l(payload); } catch {}
  }
}

