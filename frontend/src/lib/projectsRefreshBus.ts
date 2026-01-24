export type ProjectsRefreshPayload = {
  projectId?: number;
  reason?: string;
};

type Listener = (p: ProjectsRefreshPayload) => void;

const listeners = new Set<Listener>();

export function subscribeProjectsRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitProjectsRefresh(payload: ProjectsRefreshPayload) {
  for (const l of Array.from(listeners)) {
    try { l(payload); } catch {}
  }
}
