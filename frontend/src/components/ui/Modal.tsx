import React, { useEffect, useRef } from 'react';
import { darkTheme } from '../../theme/tokens';

interface ModalProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number | string;
}

const Modal: React.FC<ModalProps> = ({ isOpen, title, onClose, children, width = 900 }) => {
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
        style={{
          width, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto',
          background: darkTheme.colors.background.secondary,
          color: darkTheme.colors.text.primary,
          borderRadius: darkTheme.borderRadius.lg,
          border: `1px solid ${darkTheme.colors.border.primary}`,
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: darkTheme.spacing.md, borderBottom: `1px solid ${darkTheme.colors.border.secondary}`
        }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{
            color: darkTheme.colors.text.secondary,
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: darkTheme.spacing.xs
          }} aria-label="Close">✕</button>
        </div>
        <div style={{ padding: darkTheme.spacing.md }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;

