import React, { useEffect, useState } from 'react';
import Toast from '@/components/ui/Toast';
import { subscribeToast, ToastPayload } from '@/lib/toastBus';

const ToastHost: React.FC = () => {
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToast((t) => {
      setToast(t);
    });
    return unsubscribe;
  }, []);

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

