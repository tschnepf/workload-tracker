import React, { useEffect, useState } from 'react';
import Toast from '@/components/ui/Toast';
import { dismissToast, subscribeToast, subscribeToastQueue, ToastEvent, ToastPayload } from '@/lib/toastBus';

const ToastHost: React.FC = () => {
  const queueMode = true;
  const maxVisible = 3;
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [toasts, setToasts] = useState<ToastEvent[]>([]);

  useEffect(() => {
    if (queueMode) {
      const unsubscribeQueue = subscribeToastQueue((nextQueue) => {
        setToasts(nextQueue);
      });
      return unsubscribeQueue;
    }
    const unsubscribe = subscribeToast((t) => {
      setToast(t);
    });
    return unsubscribe;
  }, [queueMode]);

  if (queueMode) {
    if (!toasts.length) return null;
    return (
      <>
        {toasts.slice(0, maxVisible).map((event, index) => (
          <Toast
            key={event.id}
            message={event.message}
            type={event.type}
            duration={event.durationMs ?? 8000}
            stackIndex={index}
            action={event.action}
            onDismiss={() => dismissToast(event.id)}
          />
        ))}
      </>
    );
  }

  if (!toast) return null;
  return (
    <Toast
      message={toast.message}
      type={toast.type}
      action={toast.action}
      onDismiss={() => setToast(null)}
      // Use a shorter default for global 412 prompts
      duration={8000}
    />
  );
};

export default ToastHost;
