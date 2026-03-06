/**
 * Toast notification component - Windows 11 style floating notification
 * Appears in upper right corner with proper shadow and elevation
 * Auto-dismisses after specified time with manual dismiss option
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ToastAction } from '@/lib/toastBus';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // in milliseconds
  stackIndex?: number;
  action?: ToastAction;
  onDismiss: () => void;
}

const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'info', 
  duration = 15000, 
  stackIndex = 0,
  action,
  onDismiss 
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          border: 'border-[var(--color-state-success)]',
          background: { backgroundColor: 'color-mix(in srgb, var(--color-state-success) 16%, transparent)' },
          text: 'text-[var(--color-text-primary)]'
        };
      case 'warning':
        return {
          border: 'border-[var(--color-state-warning)]',
          background: { backgroundColor: 'color-mix(in srgb, var(--color-state-warning) 16%, transparent)' },
          text: 'text-[var(--color-text-primary)]'
        };
      case 'error':
        return {
          border: 'border-[var(--color-state-danger)]',
          background: { backgroundColor: 'color-mix(in srgb, var(--color-state-danger) 16%, transparent)' },
          text: 'text-[var(--color-text-primary)]'
        };
      default:
        return {
          border: 'border-[var(--color-state-info)]',
          background: { backgroundColor: 'color-mix(in srgb, var(--color-state-info) 16%, transparent)' },
          text: 'text-[var(--color-text-primary)]'
        };
    }
  };

  const styles = getTypeStyles();

  const topOffset = `${24 + (stackIndex * 88)}px`;

  const toastElement = (
    <div
      className="fixed right-6 z-[9999] animate-in slide-in-from-right-5 duration-500 ease-out motion-reduce:animate-none motion-reduce:transition-none"
      style={{ top: topOffset }}
    >
      <div className={`
        relative rounded-xl px-4 py-4 pr-10 min-w-[320px] max-w-[400px]
        bg-[var(--color-surface-elevated)] backdrop-blur-md
        border ${styles.border}
        shadow-[var(--elevation-3)]
        transition-all duration-200 motion-reduce:transition-none hover:shadow-3xl
      `}
      style={styles.background}>
        {/* Content */}
        <div className="space-y-2">
          <div className={`text-sm font-medium leading-5 ${styles.text}`}>
            {message}
          </div>
          {action ? (
            <button
              type="button"
              className={`inline-flex items-center px-2 py-1 rounded border border-current/40 text-xs ${styles.text} hover:bg-white/10`}
              onClick={async () => {
                try {
                  await action.onClick();
                } finally {
                  onDismiss();
                }
              }}
            >
              {action.label}
            </button>
          ) : null}
        </div>
        
        {/* Close Button */}
        <button
          onClick={onDismiss}
            className={`
            absolute top-3 right-3 w-6 h-6 rounded-full 
            flex items-center justify-center
            ${styles.text} opacity-60 hover:opacity-100 
            hover:bg-white/10 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]
          `}
          aria-label="Dismiss notification"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M9 3L3 9M3 3L9 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );

  // Render the toast using a portal to bypass parent container constraints
  return createPortal(toastElement, document.body);
};

export default Toast;
