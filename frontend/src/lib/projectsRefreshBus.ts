export type ProjectsRefreshPayload = {
  projectId?: number;
  reason?: string;
};

type Listener = (p: ProjectsRefreshPayload) => void;

const listeners = new Set<Listener>();
const CHANNEL_NAME = 'workload-tracker:refresh';
const STORAGE_KEY = 'wt.refresh.projects';

const notify = (payload: ProjectsRefreshPayload) => {
  for (const l of Array.from(listeners)) {
    try { l(payload); } catch {}
  }
};

const broadcast = (payload: ProjectsRefreshPayload) => {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: 'projects', payload });
      channel.close();
      return;
    }
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ payload, ts: Date.now() }));
    }
  } catch {}
};

if (typeof window !== 'undefined') {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const data = event?.data;
        if (data?.type === 'projects') notify(data.payload || {});
      };
    } else {
      window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try {
          const data = JSON.parse(e.newValue);
          notify(data?.payload || {});
        } catch {}
      });
    }
  } catch {}
}

export function subscribeProjectsRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitProjectsRefresh(payload: ProjectsRefreshPayload) {
  notify(payload);
  broadcast(payload);
}
