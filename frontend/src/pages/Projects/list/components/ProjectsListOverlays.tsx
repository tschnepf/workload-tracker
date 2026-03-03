import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export const MobileFiltersSheet: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({ open, title, onClose, children }) => {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1100] bg-black/60 flex items-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full bg-[var(--surface)] text-[var(--text)] rounded-t-2xl p-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold">{title}</div>
          <button type="button" className="text-xl text-[var(--muted)]" onClick={onClose} aria-label="Close filters">
            ×
          </button>
        </div>
        <div className="pt-3">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export const MobileDetailsDrawer: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }> = ({ open, title, onClose, children }) => {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1150] bg-black/60 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md h-full bg-[var(--surface)] text-[var(--text)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold truncate">{title}</div>
          <button type="button" className="text-xl text-[var(--muted)]" onClick={onClose} aria-label="Close details">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export const ProjectCreateDrawer: React.FC<{ open: boolean; onClose: () => void; children: React.ReactNode }> = ({ open, onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1200] bg-black/60 flex justify-end"
      onKeyDown={(e) => {
        if (e.key.startsWith('Arrow')) {
          e.stopPropagation();
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl h-full bg-[var(--surface)] text-[var(--text)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div className="text-base font-semibold truncate">Create New Project</div>
          <button type="button" className="text-xl text-[var(--muted)]" onClick={onClose} aria-label="Close new project form">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
};
