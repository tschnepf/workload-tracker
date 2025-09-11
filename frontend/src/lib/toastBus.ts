export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export type ToastPayload = { message: string; type?: ToastKind };

type Listener = (t: ToastPayload) => void;

const listeners = new Set<Listener>();

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showToast(message: string, type: ToastKind = 'info') {
  for (const l of Array.from(listeners)) {
    try { l({ message, type }); } catch {}
  }
}

