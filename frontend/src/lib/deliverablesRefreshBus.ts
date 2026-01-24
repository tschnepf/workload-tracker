export type DeliverablesRefreshPayload = {
  projectId?: number;
  reason?: string;
};

type Listener = (p: DeliverablesRefreshPayload) => void;

const listeners = new Set<Listener>();

export function subscribeDeliverablesRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDeliverablesRefresh(payload: DeliverablesRefreshPayload) {
  for (const l of Array.from(listeners)) {
    try { l(payload); } catch {}
  }
}
