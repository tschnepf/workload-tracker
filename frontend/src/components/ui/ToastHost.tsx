import React, { useEffect, useState } from 'react';
import Toast from '@/components/ui/Toast';
import { dismissToast, subscribeToast, subscribeToastQueue, ToastEvent, ToastPayload } from '@/lib/toastBus';
import { getFlag } from '@/lib/flags';

const ToastHost: React.FC = () => {
  const queueMode = getFlag('FF_TOAST_QUEUE', false);
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
      onDismiss={() => setToast(null)}
      // Use a shorter default for global 412 prompts
      duration={8000}
    />
  );
};

export default ToastHost;
