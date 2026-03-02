/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<unknown>;
};

type PushPayload = {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  timestamp?: string;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

registerRoute(
  ({ url }) => (
    url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/admin/')
    || url.pathname.startsWith('/calendar/')
  ),
  new NetworkOnly(),
);

registerRoute(
  ({ request }) => (
    request.destination === 'style'
    || request.destination === 'script'
    || request.destination === 'worker'
    || request.destination === 'font'
    || request.destination === 'image'
  ),
  new StaleWhileRevalidate({ cacheName: 'wt-static' }),
);

const navigationHandler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(
  async (context) => {
    const strategy = new NetworkFirst({ cacheName: 'wt-pages' });
    try {
      return await strategy.handle(context);
    } catch {
      const offline = await caches.match('/offline.html');
      if (offline) return offline;
      return navigationHandler(context);
    }
  },
  {
    denylist: [/^\/api\//, /^\/admin\//, /^\/calendar\//],
  },
);
registerRoute(navigationRoute);

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {
      title: 'Workload Tracker',
      body: event.data?.text() || 'You have a new update.',
      type: 'generic',
      url: '/my-work',
      tag: 'generic',
    };
  }

  const title = payload.title || 'Workload Tracker';
  const options: NotificationOptions = {
    body: payload.body || 'You have a new update.',
    tag: payload.tag || payload.type || 'generic',
    data: {
      url: payload.url || '/my-work',
      type: payload.type || 'generic',
      timestamp: payload.timestamp || new Date().toISOString(),
    },
    badge: '/brand/icon-192.png',
    icon: '/brand/icon-192.png',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification?.data?.url as string) || '/my-work';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const windowClient of windows) {
      if ('focus' in windowClient) {
        if (windowClient.url.includes(self.location.origin)) {
          await windowClient.focus();
          windowClient.postMessage({ type: 'navigate', url: targetUrl });
          return;
        }
      }
    }
    await self.clients.openWindow(targetUrl);
  })());
});
