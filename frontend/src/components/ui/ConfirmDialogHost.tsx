import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { resolveActiveConfirm, useConfirmDialogState } from '@/lib/dialogBus';

const ConfirmDialogHost: React.FC = () => {
  const { active } = useConfirmDialogState();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        resolveActiveConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const timer = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
      triggerRef.current?.focus?.();
    };
  }, [active]);

  if (!active || typeof document === 'undefined') return null;

  const toneClass =
    active.tone === 'danger'
      ? 'border-red-500/60 text-red-200 hover:bg-red-500/20'
      : active.tone === 'warning'
        ? 'border-amber-500/60 text-amber-200 hover:bg-amber-500/20'
        : 'border-[var(--primary)]/70 text-[var(--text)] hover:bg-[var(--surfaceHover)]';

  const title = active.title || 'Confirm Action';
  const confirmLabel = active.confirmLabel || 'Confirm';
  const cancelLabel = active.cancelLabel || 'Cancel';

  return createPortal(
    <div className="fixed inset-0 z-[1200] bg-black/60 flex items-center justify-center px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl p-4"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-[var(--text)]">
          {title}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{active.message}</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => resolveActiveConfirm(false)}
            className="px-3 py-1.5 rounded-md border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surfaceHover)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => resolveActiveConfirm(true)}
            className={`px-3 py-1.5 rounded-md border ${toneClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialogHost;
