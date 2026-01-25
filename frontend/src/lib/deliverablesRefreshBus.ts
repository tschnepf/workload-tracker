export type DeliverablesRefreshPayload = {
  projectId?: number;
  reason?: string;
};

type Listener = (p: DeliverablesRefreshPayload) => void;

const listeners = new Set<Listener>();
const CHANNEL_NAME = 'workload-tracker:refresh';
const STORAGE_KEY = 'wt.refresh.deliverables';

const notify = (payload: DeliverablesRefreshPayload) => {
  for (const l of Array.from(listeners)) {
    try { l(payload); } catch {}
  }
};

const broadcast = (payload: DeliverablesRefreshPayload) => {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: 'deliverables', payload });
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
        if (data?.type === 'deliverables') notify(data.payload || {});
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

export function subscribeDeliverablesRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDeliverablesRefresh(payload: DeliverablesRefreshPayload) {
  notify(payload);
  broadcast(payload);
}
