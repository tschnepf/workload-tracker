export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

export type ToastEvent = {
  id: string;
  message: string;
  type: ToastKind;
  dedupeKey?: string;
  durationMs?: number;
  priority?: number;
  action?: ToastAction;
  createdAt: number;
};

// Backward-compatible alias
export type ToastPayload = ToastEvent;

type EventListener = (event: ToastEvent) => void;
type QueueListener = (queue: ToastEvent[]) => void;

const eventListeners = new Set<EventListener>();
const queueListeners = new Set<QueueListener>();

const MAX_QUEUE_SIZE = 80;
let seq = 0;
let queue: ToastEvent[] = [];

function toSentenceCaseFirst(message: string): string {
  if (!message) return message;
  const idx = message.search(/[A-Za-z]/);
  if (idx === -1) return message;
  return message.slice(0, idx) + message.charAt(idx).toUpperCase() + message.slice(idx + 1);
}

function eventId() {
  seq += 1;
  return `toast-${Date.now()}-${seq}`;
}

function snapshotQueue() {
  return queue.slice();
}

function sortQueue(items: ToastEvent[]) {
  return items.sort((a, b) => {
    const pa = Number.isFinite(a.priority as number) ? Number(a.priority) : 0;
    const pb = Number.isFinite(b.priority as number) ? Number(b.priority) : 0;
    if (pa !== pb) return pb - pa;
    return a.createdAt - b.createdAt;
  });
}

function notifyQueueListeners() {
  const snapshot = snapshotQueue();
  for (const listener of Array.from(queueListeners)) {
    try {
      listener(snapshot);
    } catch {}
  }
}

function notifyEventListeners(event: ToastEvent) {
  for (const listener of Array.from(eventListeners)) {
    try {
      listener(event);
    } catch {}
  }
}

export function emitToast(payload: {
  message: string;
  type?: ToastKind;
  dedupeKey?: string;
  durationMs?: number;
  priority?: number;
  action?: ToastAction;
}): ToastEvent {
  const next: ToastEvent = {
    id: eventId(),
    message: toSentenceCaseFirst(payload.message),
    type: payload.type || 'info',
    dedupeKey: payload.dedupeKey,
    durationMs: payload.durationMs,
    priority: payload.priority,
    action: payload.action,
    createdAt: Date.now(),
  };

  if (next.dedupeKey) {
    queue = queue.filter((item) => item.dedupeKey !== next.dedupeKey);
  }

  queue.push(next);
  queue = sortQueue(queue).slice(0, MAX_QUEUE_SIZE);

  notifyEventListeners(next);
  notifyQueueListeners();
  return next;
}

export function showToast(message: string, type: ToastKind = 'info') {
  return emitToast({ message, type });
}

export function dismissToast(id: string) {
  const before = queue.length;
  queue = queue.filter((event) => event.id !== id);
  if (queue.length !== before) {
    notifyQueueListeners();
  }
}

export function clearToasts() {
  if (!queue.length) return;
  queue = [];
  notifyQueueListeners();
}

export function getToastQueue() {
  return snapshotQueue();
}

// Backward-compatible listener for single-event subscriptions
export function subscribeToast(listener: EventListener): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export function subscribeToastQueue(listener: QueueListener): () => void {
  queueListeners.add(listener);
  listener(snapshotQueue());
  return () => queueListeners.delete(listener);
}
