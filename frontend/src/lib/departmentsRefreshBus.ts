type Listener = () => void;

const listeners = new Set<Listener>();
const CHANNEL_NAME = 'workload-tracker:refresh';
const STORAGE_KEY = 'wt.refresh.departments';

const notify = () => {
  for (const l of Array.from(listeners)) {
    try { l(); } catch {}
  }
};

const broadcast = () => {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: 'departments' });
      channel.close();
      return;
    }
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
    }
  } catch {}
};

if (typeof window !== 'undefined') {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const data = event?.data;
        if (data?.type === 'departments') notify();
      };
    } else {
      window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY || !e.newValue) return;
        try {
          const data = JSON.parse(e.newValue);
          notify();
        } catch {}
      });
    }
  } catch {}
}

export function subscribeDepartmentsRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDepartmentsRefresh() {
  notify();
  broadcast();
}
