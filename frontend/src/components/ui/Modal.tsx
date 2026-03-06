import React, { useEffect, useRef } from 'react';
import Button from '@/components/ui/Button';
import IconButton from '@/components/ui/IconButton';

interface ModalProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, title, onClose, children, width = 900, footer }) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    // Focus the dialog for accessibility
    setTimeout(() => dialogRef.current?.focus(), 0);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Modal'}
      onClick={(e) => {
        // Close when clicking backdrop only
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[90vh] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-primary)] shadow-[var(--elevation-3)]"
        style={{ width, maxWidth: '95vw' }}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="font-semibold">{title}</div>
          <IconButton label="Close dialog" onClick={onClose} size="sm">
            <span aria-hidden="true">✕</span>
          </IconButton>
        </div>
        <div className="overflow-auto p-4">
          {children}
        </div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
            {footer}
          </div>
        ) : (
          <div className="flex items-center justify-end border-t border-[var(--color-border)] px-4 py-3">
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
