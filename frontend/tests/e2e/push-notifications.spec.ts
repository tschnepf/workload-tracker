import { expect, test } from '@playwright/test';
import { jsonResponse, mockApiFallback, primeAuth } from './utils';

const vapidPublicKey = 'AQAB';

test('profile push opt-in flow can subscribe and trigger test notification', async ({ page }) => {
  await page.addInitScript(() => {
    const notificationState = { permission: 'default' };
    const NotificationMock = {
      get permission() {
        return notificationState.permission;
      },
      requestPermission: async () => {
        notificationState.permission = 'granted';
        return 'granted';
      },
    };

    const subscription = {
      endpoint: 'https://push.example.test/subscription-1',
      expirationTime: null,
      toJSON() {
        return {
          endpoint: this.endpoint,
          expirationTime: this.expirationTime,
          keys: {
            p256dh: 'test-p256dh',
            auth: 'test-auth',
          },
        };
      },
      unsubscribe: async () => true,
    };

    const registration = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => subscription,
      },
    };

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: NotificationMock,
    });
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: function PushManager() {},
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve(registration),
        addEventListener: () => {},
      },
    });
  });

  await mockApiFallback(page);
  await primeAuth(page);

  let prefs = {
    emailPreDeliverableReminders: true,
    reminderDaysBefore: 3,
    dailyDigest: false,
    webPushEnabled: false,
    pushPreDeliverableReminders: true,
    pushDailyDigest: false,
    pushAssignmentChanges: true,
  };
  let subscriptionUpserts = 0;
  let testPushCalls = 0;
  let subscriptions = [] as Array<{
    id: number;
    endpoint: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    lastSeenAt: string;
    lastSuccessAt: string | null;
    lastError: string;
  }>;

  await page.route('**/api/capabilities/**', (route) =>
    route.fulfill(
      jsonResponse({
        pwa: {
          enabled: true,
          pushEnabled: true,
          vapidPublicKey,
          offlineMode: 'shell',
        },
      })
    )
  );

  await page.route('**/api/auth/notification-preferences/**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill(jsonResponse(prefs));
    }
    if (route.request().method() === 'PUT') {
      const payload = JSON.parse(route.request().postData() || '{}');
      prefs = { ...prefs, ...payload };
      return route.fulfill(jsonResponse(prefs));
    }
    return route.fulfill(jsonResponse({}));
  });

  await page.route('**/api/auth/push-subscriptions/**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill(jsonResponse(subscriptions));
    }
    if (method === 'POST') {
      subscriptionUpserts += 1;
      const now = new Date().toISOString();
      subscriptions = [
        {
          id: 1,
          endpoint: 'https://push.example.test/subscription-1',
          isActive: true,
          createdAt: now,
          updatedAt: now,
          lastSeenAt: now,
          lastSuccessAt: null,
          lastError: '',
        },
      ];
      return route.fulfill(jsonResponse(subscriptions[0], 201));
    }
    if (method === 'DELETE') {
      subscriptions = [];
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill(jsonResponse({}));
  });

  await page.route('**/api/auth/push/test/**', async (route) => {
    testPushCalls += 1;
    return route.fulfill(jsonResponse({ queued: true, detail: 'queued' }));
  });

  await page.route('**/api/people/42/**', (route) =>
    route.fulfill(
      jsonResponse({
        id: 42,
        name: 'Jordan Lee',
        departmentName: 'Engineering',
        roleName: 'Manager',
      })
    )
  );

  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: /my profile/i })).toBeVisible();

  const enablePush = page.getByLabel('Enable push notifications');
  await expect(enablePush).toBeVisible();
  if (!(await enablePush.isChecked())) {
    await enablePush.click();
  }
  await expect(enablePush).toBeChecked();

  await expect.poll(() => prefs.webPushEnabled).toBe(true);
  await expect.poll(() => subscriptionUpserts).toBeGreaterThan(0);

  const testButton = page.getByRole('button', { name: /send test notification/i });
  await expect(testButton).toBeEnabled();
  await testButton.click();
  await expect.poll(() => testPushCalls).toBe(1);
});
