export type ToastKind = 'info' | 'success' | 'warning' | 'error';
export type ToastPayload = { message: string; type?: ToastKind };

type Listener = (t: ToastPayload) => void;

const listeners = new Set<Listener>();

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toSentenceCaseFirst(msg: string): string {
  if (!msg) return msg;
  const idx = msg.search(/[A-Za-z]/);
  if (idx === -1) return msg;
  return msg.slice(0, idx) + msg.charAt(idx).toUpperCase() + msg.slice(idx + 1);
}

export function showToast(message: string, type: ToastKind = 'info') {
  const formatted = toSentenceCaseFirst(message);
  for (const l of Array.from(listeners)) {
    try { l({ message: formatted, type }); } catch {}
  }
}
