import type { Assignment } from '@/types/models';

export type AssignmentEvent = {
  type: 'created' | 'updated' | 'deleted';
  assignmentId: number;
  projectId?: number | null;
  personId?: number | null;
  updatedAt?: string | null;
  fields?: string[];
  assignment?: Assignment | null;
};

type Listener = (event: AssignmentEvent) => void;

const listeners = new Set<Listener>();
const CHANNEL_NAME = 'workload-tracker:refresh';
const STORAGE_KEY = 'wt.refresh.assignments';

const notify = (event: AssignmentEvent) => {
  for (const l of Array.from(listeners)) {
    try { l(event); } catch {}
  }
};

const broadcast = (event: AssignmentEvent) => {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage({ type: 'assignments', payload: event });
      channel.close();
      return;
    }
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ payload: event, ts: Date.now() }));
    }
  } catch {}
};

if (typeof window !== 'undefined') {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        const data = event?.data;
        if (data?.type === 'assignments') notify(data.payload || {});
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

export function subscribeAssignmentsRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAssignmentsRefresh(event: AssignmentEvent) {
  notify(event);
  broadcast(event);
}
