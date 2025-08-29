/**
 * Toast notification component - Windows 11 style floating notification
 * Appears in lower right corner with proper shadow and elevation
 * Auto-dismisses after specified time with manual dismiss option
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number; // in milliseconds
  onDismiss: () => void;
}

const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'info', 
  duration = 15000, 
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
          border: 'border-emerald-400/40',
          background: 'bg-emerald-500/10',
          text: 'text-emerald-300'
        };
      case 'warning':
        return {
          border: 'border-orange-400/40',
          background: 'bg-orange-500/10', 
          text: 'text-orange-300'
        };
      case 'error':
        return {
          border: 'border-red-400/40',
          background: 'bg-red-500/10',
          text: 'text-red-300'
        };
      default:
        return {
          border: 'border-blue-400/40',
          background: 'bg-blue-500/10',
          text: 'text-blue-300'
        };
    }
  };

  const styles = getTypeStyles();

  const toastElement = (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-right-5 duration-500 ease-out">
      <div className={`
        relative rounded-xl px-4 py-4 pr-10 min-w-[320px] max-w-[400px]
        bg-[#2d2d30] backdrop-blur-md
        border ${styles.border}
        shadow-2xl shadow-black/30
        ${styles.background}
        transition-all duration-200 hover:shadow-3xl
      `}>
        {/* Content */}
        <div className={`text-sm font-medium leading-5 ${styles.text}`}>
          {message}
        </div>
        
        {/* Close Button */}
        <button
          onClick={onDismiss}
          className={`
            absolute top-3 right-3 w-6 h-6 rounded-full 
            flex items-center justify-center
            ${styles.text} opacity-60 hover:opacity-100 
            hover:bg-white/10 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-white/20
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