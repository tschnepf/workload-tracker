/**
 * Main App component with routing and code splitting
 */

import React, { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/lib/queryClient';
import Loader from '@/components/ui/Loader';
import RoutePageBoundary from '@/components/RoutePageBoundary';

// Routing & auth wrappers are configured in route objects (main.tsx)

// Suspense fallback uses unified Loader
const PageLoader: React.FC = () => <Loader full message="Loading..." />;

// Error boundary for lazy-loaded components
class LazyLoadErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#1e1e1e]">
          <div className="text-center">
            <div className="text-red-400 text-xl mb-2">Something went wrong</div>
            <div className="text-[#969696] mb-4">Failed to load page component</div>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-[#007acc] hover:bg-[#005a99] text-white px-4 py-2 rounded"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { useDeptServerDefaultsOnce } from '@/hooks/useDeptServerDefaults';
import { useThemeFromSettings } from '@/hooks/useThemeFromSettings';
import ToastHost from '@/components/ui/ToastHost';
import ConfirmDialogHost from '@/components/ui/ConfirmDialogHost';
import { useAuth } from '@/hooks/useAuth';
import { authApi, systemApi } from '@/services/api';
import { base64UrlToUint8Array, isWebPushSupported } from '@/utils/push';

function App() {
  // Apply server-provided defaults and theme after auth hydration
  useDeptServerDefaultsOnce();
  useThemeFromSettings();
  const auth = useAuth();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!auth.accessToken || auth.hydrating) return;
      if (!isWebPushSupported()) return;
      if (Notification.permission !== 'granted') return;

      try {
        const [caps, prefs] = await Promise.all([
          systemApi.getCapabilities(),
          authApi.getNotificationPreferences(),
        ]);
        if (cancelled) return;
        if (!caps?.pwa?.enabled || !caps?.pwa?.pushEnabled || !caps?.pwa?.vapidPublicKey) return;
        if (!prefs.webPushEnabled) return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(caps.pwa.vapidPublicKey),
          });
        }

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

        await authApi.upsertPushSubscription({
          endpoint: json.endpoint,
          expirationTime: json.expirationTime ?? null,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
        });
      } catch {
        // best-effort registration refresh
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.accessToken, auth.hydrating]);

  return (
    <QueryClientProvider client={queryClient}>
      <LazyLoadErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <RoutePageBoundary>
            <Outlet />
          </RoutePageBoundary>
        </Suspense>
      </LazyLoadErrorBoundary>
      {/* React Query DevTools for development */}
      <ReactQueryDevtools initialIsOpen={false} />
      <ConfirmDialogHost />
      <ToastHost />
    </QueryClientProvider>
  );
}

export default App;
