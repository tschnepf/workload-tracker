import { useSyncExternalStore } from 'react';

export type ConfirmTone = 'default' | 'warning' | 'danger';

export type ConfirmActionOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmRequest = ConfirmActionOptions & {
  id: number;
  resolve: (value: boolean) => void;
};

type Listener = () => void;

let nextId = 1;
let activeRequest: ConfirmRequest | null = null;
const queue: ConfirmRequest[] = [];
const listeners = new Set<Listener>();
let snapshot: { active: ConfirmRequest | null; queueLength: number } = {
  active: null,
  queueLength: 0,
};

function updateSnapshot() {
  snapshot = {
    active: activeRequest,
    queueLength: queue.length,
  };
}

function notify() {
  updateSnapshot();
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {}
  });
}

function pumpQueue() {
  if (activeRequest || queue.length === 0) return;
  activeRequest = queue.shift() || null;
  notify();
}

export function enqueueConfirm(options: ConfirmActionOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    queue.push({
      id: nextId++,
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel,
      cancelLabel: options.cancelLabel,
      tone: options.tone,
      resolve,
    });
    if (activeRequest) {
      notify();
      return;
    }
    pumpQueue();
  });
}

export function resolveActiveConfirm(confirmed: boolean) {
  if (!activeRequest) return;
  const pending = activeRequest;
  activeRequest = null;
  try {
    pending.resolve(confirmed);
  } finally {
    if (queue.length === 0) {
      // Ensure subscribers update when the active dialog is dismissed
      notify();
      return;
    }
    pumpQueue();
  }
}

export function clearPendingConfirms() {
  if (activeRequest) {
    try {
      activeRequest.resolve(false);
    } catch {}
    activeRequest = null;
  }
  while (queue.length) {
    const next = queue.shift();
    try {
      next?.resolve(false);
    } catch {}
  }
  notify();
}

export function subscribeConfirms(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getConfirmSnapshot() {
  return snapshot;
}

export function useConfirmDialogState() {
  return useSyncExternalStore(subscribeConfirms, getConfirmSnapshot, getConfirmSnapshot);
}
