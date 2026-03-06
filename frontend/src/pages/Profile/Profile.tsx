import React, { useEffect, useMemo, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import {
  authApi,
  peopleApi,
  systemApi,
  type NotificationChannelMatrix,
  type NotificationPreferences,
  type PushSubscriptionItem,
} from '@/services/api';
import { useUpdatePerson } from '@/hooks/usePeople';
import Toast from '@/components/ui/Toast';
import Layout from '@/components/layout/Layout';
import { setSettings } from '@/store/auth';
import { setColorScheme } from '@/theme/themeManager';
import { base64UrlToUint8Array, isWebPushSupported } from '@/utils/push';

const defaultNotificationMatrix = (): NotificationChannelMatrix => ({
  'pred.reminder': { mobilePush: false, email: false, inBrowser: true },
  'pred.digest': { mobilePush: false, email: false, inBrowser: true },
  'assignment.created': { mobilePush: false, email: false, inBrowser: true },
  'assignment.removed': { mobilePush: false, email: false, inBrowser: true },
  'assignment.bulk_updated': { mobilePush: false, email: false, inBrowser: true },
  'deliverable.reminder': { mobilePush: false, email: false, inBrowser: true },
  'deliverable.date_changed': { mobilePush: false, email: false, inBrowser: true },
});

const defaultAvailabilityMatrix = (): NotificationChannelMatrix => ({
  'pred.reminder': { mobilePush: true, email: true, inBrowser: true },
  'pred.digest': { mobilePush: true, email: true, inBrowser: true },
  'assignment.created': { mobilePush: true, email: true, inBrowser: true },
  'assignment.removed': { mobilePush: true, email: true, inBrowser: true },
  'assignment.bulk_updated': { mobilePush: true, email: true, inBrowser: true },
  'deliverable.reminder': { mobilePush: true, email: true, inBrowser: true },
  'deliverable.date_changed': { mobilePush: true, email: true, inBrowser: true },
});

const notificationMatrixRows: Array<{ key: keyof NotificationChannelMatrix; label: string }> = [
  { key: 'pred.reminder', label: 'Pre-deliverable reminder' },
  { key: 'pred.digest', label: 'Daily digest' },
  { key: 'assignment.created', label: 'Assignment created' },
  { key: 'assignment.removed', label: 'Assignment removed' },
  { key: 'assignment.bulk_updated', label: 'Assignment bulk updated' },
  { key: 'deliverable.reminder', label: 'Deliverable reminder' },
  { key: 'deliverable.date_changed', label: 'Deliverable date changed' },
];

const Profile: React.FC = () => {
  const auth = useAuth();
  const [personName, setPersonName] = useState('');
  const [personDept, setPersonDept] = useState<string>('—');
  const [personRole, setPersonRole] = useState<string>('—');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const updatePersonMutation = useUpdatePerson();
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [pushPermission, setPushPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [pushSupported, setPushSupported] = useState(false);
  const [pushServerEnabled, setPushServerEnabled] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [pushFeatureAvailability, setPushFeatureAvailability] = useState({
    rateLimit: true,
    weekendMute: true,
    quietHours: true,
    snooze: true,
    digestWindow: true,
    actions: true,
    deepLinks: true,
    subscriptionHealthcheck: true,
  });
  const [pushSubscriptions, setPushSubscriptions] = useState<PushSubscriptionItem[]>([]);
  const browserTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
      return '';
    }
  }, []);
  const defaultNotificationPrefs = useMemo<NotificationPreferences>(() => ({
    emailPreDeliverableReminders: false,
    reminderDaysBefore: 1,
    dailyDigest: false,
    webPushEnabled: false,
    pushPreDeliverableReminders: false,
    pushDailyDigest: false,
    pushAssignmentChanges: false,
    pushDeliverableDateChanges: false,
    pushRateLimitEnabled: true,
    pushWeekendMute: true,
    pushQuietHoursEnabled: true,
    pushQuietHoursStart: 17,
    pushQuietHoursEnd: 5,
    pushDigestWindowEnabled: true,
    pushDigestWindow: 'instant',
    pushTimezone: browserTimezone,
    pushSnoozeEnabled: true,
    pushSnoozeUntil: null,
    pushActionsEnabled: true,
    pushDeepLinksEnabled: true,
    pushSubscriptionCleanupEnabled: true,
    notificationChannelMatrix: defaultNotificationMatrix(),
    effectiveChannelAvailability: defaultAvailabilityMatrix(),
  }), [browserTimezone]);

  const accountRole = useMemo(() => auth.user?.accountRole || (auth.user?.is_staff || auth.user?.is_superuser ? 'admin' : 'user'), [auth.user]);

  useAuthenticatedEffect(() => {
    const pid = auth.person?.id;
    if (!pid) {
      setPersonName('');
      setPersonDept('—');
      setPersonRole('—');
      return;
    }
    (async () => {
      try {
        const p = await peopleApi.get(pid);
        setPersonName(p.name || '');
        setPersonDept((p as any).departmentName || '—');
        setPersonRole((p as any).roleName || '—');
      } catch {
        // ignore
      }
    })();
  }, [auth.person?.id]);

  useAuthenticatedEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prefs, caps] = await Promise.all([
          authApi.getNotificationPreferences(),
          systemApi.getCapabilities(),
        ]);
        if (cancelled) return;
        setNotificationPrefs({
          ...defaultNotificationPrefs,
          ...prefs,
          pushTimezone: (prefs as any)?.pushTimezone || browserTimezone || '',
          pushSnoozeUntil: (prefs as any)?.pushSnoozeUntil || null,
          notificationChannelMatrix: (prefs as any)?.notificationChannelMatrix || defaultNotificationMatrix(),
          effectiveChannelAvailability: (prefs as any)?.effectiveChannelAvailability || defaultAvailabilityMatrix(),
        });
        setPushServerEnabled(Boolean(caps?.pwa?.enabled && caps?.pwa?.pushEnabled));
        setVapidPublicKey(caps?.pwa?.vapidPublicKey || null);
        setPushFeatureAvailability({
          rateLimit: Boolean(caps?.pwa?.pushFeatures?.rateLimit ?? true),
          weekendMute: Boolean(caps?.pwa?.pushFeatures?.weekendMute ?? true),
          quietHours: Boolean(caps?.pwa?.pushFeatures?.quietHours ?? true),
          snooze: Boolean(caps?.pwa?.pushFeatures?.snooze ?? true),
          digestWindow: Boolean(caps?.pwa?.pushFeatures?.digestWindow ?? true),
          actions: Boolean(caps?.pwa?.pushFeatures?.actions ?? true),
          deepLinks: Boolean(caps?.pwa?.pushFeatures?.deepLinks ?? true),
          subscriptionHealthcheck: Boolean(caps?.pwa?.pushFeatures?.subscriptionHealthcheck ?? true),
        });
      } catch {
        if (!cancelled) {
          setToast({ message: 'Failed to load notification preferences', type: 'error' });
        }
      }
      try {
        const subs = await authApi.listPushSubscriptions();
        if (!cancelled) setPushSubscriptions(subs);
      } catch {
        // ignore subscription list failures
      }

      if (!cancelled) {
        const supported = (
          typeof window !== 'undefined'
          && isWebPushSupported()
        );
        setPushSupported(Boolean(supported));
        if ('Notification' in window) {
          setPushPermission(Notification.permission);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultNotificationPrefs, browserTimezone]);

  useEffect(() => {
    if (!notificationPrefs?.webPushEnabled) return;
    if (!pushSupported || !pushServerEnabled || !vapidPublicKey) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    upsertCurrentBrowserSubscription().catch(() => {
      // best effort refresh on load
    });
  }, [notificationPrefs?.webPushEnabled, pushSupported, pushServerEnabled, vapidPublicKey]);

  const canEditName = !!auth.person?.id;
  const hasGlobalPushEventRestriction = Boolean(
    notificationPrefs
    && Object.values(notificationPrefs.effectiveChannelAvailability || {}).some((row: any) => (
      !row?.mobilePush || !row?.email || !row?.inBrowser
    )),
  );
  const hasGlobalPushFeatureRestriction = (
    !pushFeatureAvailability.rateLimit
    || !pushFeatureAvailability.weekendMute
    || !pushFeatureAvailability.quietHours
    || !pushFeatureAvailability.snooze
    || !pushFeatureAvailability.digestWindow
    || !pushFeatureAvailability.actions
    || !pushFeatureAvailability.deepLinks
    || !pushFeatureAvailability.subscriptionHealthcheck
  );

  async function saveNotificationPrefs(next: NotificationPreferences) {
    setNotificationBusy(true);
    try {
      const saved = await authApi.updateNotificationPreferences(next);
      setNotificationPrefs(saved);
      return saved;
    } finally {
      setNotificationBusy(false);
    }
  }

  async function refreshPushSubscriptions() {
    try {
      const subs = await authApi.listPushSubscriptions();
      setPushSubscriptions(subs);
    } catch {
      // ignore list refresh failure
    }
  }

  async function upsertCurrentBrowserSubscription() {
    if (!pushSupported || !vapidPublicKey) {
      throw new Error('Push is not available in this browser or server key is missing.');
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
      });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('Subscription payload is incomplete.');
    }
    await authApi.upsertPushSubscription({
      endpoint: json.endpoint,
      expirationTime: json.expirationTime ?? null,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    });
    await refreshPushSubscriptions();
  }

  async function disableBrowserPushSubscriptions() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch {
        // ignore local unsubscribe failures
      }
    }
    const subs = [...pushSubscriptions];
    for (const sub of subs) {
      try {
        await authApi.deletePushSubscription(sub.id);
      } catch {
        // ignore and continue best effort cleanup
      }
    }
    await refreshPushSubscriptions();
  }

  return (<>
    <Layout>
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-6">My Profile</h1>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Username</label>
              <div className="text-[var(--text)]">{auth.user?.username || '—'}</div>
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Email</label>
              <div className="text-[var(--text)]">{auth.user?.email || '—'}</div>
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Account Role</label>
              <div className="text-[var(--text)] capitalize">{accountRole}</div>
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Assigned Department</label>
              <div className="text-[var(--text)]">{personDept}</div>
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Person Role</label>
              <div className="text-[var(--text)]">{personRole}</div>
            </div>
          </div>
        </div>

        {/* Appearance: Color Scheme */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Appearance</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--muted)]" htmlFor="color-scheme">Color scheme:</label>
            <select
              id="color-scheme"
              className="min-w-[180px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded px-3 py-2 min-h-[38px]"
              value={(auth.settings?.colorScheme as string) || 'default'}
              onChange={async (e) => {
                const v = (e.target as HTMLSelectElement).value;
                setColorScheme(v);
                await setSettings({ colorScheme: v });
              }}
            >
              <option value="default">Default</option>
              <option value="light">Light</option>
              <option value="navy">Navy</option>
              <option value="triad">Triad</option>
              <option value="midnight">Midnight</option>
              <option value="sky">Sky</option>
            </select>
          </div>
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Notifications</h2>
          {!notificationPrefs ? (
            <div className="text-sm text-[var(--muted)]">Loading notification preferences…</div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-[var(--muted)]">
                Push support: {pushSupported ? 'available' : 'not available'} | Permission: {pushPermission}
              </div>
              {!pushServerEnabled ? (
                <div className="text-xs text-amber-300">
                  Push is currently disabled by server configuration.
                </div>
              ) : null}
              {hasGlobalPushEventRestriction ? (
                <div className="text-xs text-amber-300">
                  Some push event types are disabled by an administrator and cannot be enabled here.
                </div>
              ) : null}
              {hasGlobalPushFeatureRestriction ? (
                <div className="text-xs text-amber-300">
                  Some push behavior features are disabled by an administrator and are unavailable here.
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.webPushEnabled}
                  disabled={notificationBusy || !pushSupported || !pushServerEnabled}
                  onChange={async (e) => {
                    const enabled = (e.target as HTMLInputElement).checked;
                    const original = notificationPrefs;
                    try {
                      const saved = await saveNotificationPrefs({
                        ...notificationPrefs,
                        webPushEnabled: enabled,
                      });
                      if (!enabled) {
                        await disableBrowserPushSubscriptions();
                        setToast({ message: 'Push notifications disabled', type: 'info' });
                        return;
                      }
                      if ('Notification' in window && Notification.permission === 'default') {
                        const perm = await Notification.requestPermission();
                        setPushPermission(perm);
                      } else if ('Notification' in window) {
                        setPushPermission(Notification.permission);
                      }
                      if (!('Notification' in window) || Notification.permission !== 'granted') {
                        setToast({ message: 'Notification permission is not granted in this browser', type: 'warning' });
                        await saveNotificationPrefs({ ...saved, webPushEnabled: false });
                        return;
                      }
                      await upsertCurrentBrowserSubscription();
                      setToast({ message: 'Push notifications enabled', type: 'success' });
                    } catch (err: any) {
                      setNotificationPrefs(original);
                      setToast({ message: err?.message || 'Failed to update push settings', type: 'error' });
                    }
                  }}
                />
                Enable push notifications
              </label>

              <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide pt-1">
                Channel Preferences
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-[var(--border)] text-sm">
                  <thead>
                    <tr className="bg-[var(--surface)] text-[var(--muted)]">
                      <th className="text-left px-3 py-2 border-b border-[var(--border)]">Notification</th>
                      <th className="text-center px-3 py-2 border-b border-[var(--border)]">Mobile Push</th>
                      <th className="text-center px-3 py-2 border-b border-[var(--border)]">Email</th>
                      <th className="text-center px-3 py-2 border-b border-[var(--border)]">In Browser</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notificationMatrixRows.map((row) => {
                      const current = notificationPrefs.notificationChannelMatrix?.[row.key] || { mobilePush: true, email: true, inBrowser: true };
                      const available = notificationPrefs.effectiveChannelAvailability?.[row.key] || { mobilePush: true, email: true, inBrowser: true };
                      const toggleCell = async (channel: 'mobilePush' | 'email' | 'inBrowser', checked: boolean) => {
                        const next: NotificationPreferences = {
                          ...notificationPrefs,
                          notificationChannelMatrix: {
                            ...notificationPrefs.notificationChannelMatrix,
                            [row.key]: {
                              ...current,
                              [channel]: checked,
                            },
                          },
                        };
                        try {
                          await saveNotificationPrefs(next);
                        } catch {
                          setToast({ message: 'Failed to update notification channel preference', type: 'error' });
                        }
                      };
                      return (
                        <tr key={row.key} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="px-3 py-2 text-[var(--text)]">{row.label}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(current.mobilePush)}
                              disabled={notificationBusy || !available.mobilePush}
                              onChange={(e) => void toggleCell('mobilePush', (e.target as HTMLInputElement).checked)}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(current.email)}
                              disabled={notificationBusy || !available.email}
                              onChange={(e) => void toggleCell('email', (e.target as HTMLInputElement).checked)}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(current.inBrowser)}
                              disabled={notificationBusy || !available.inBrowser}
                              onChange={(e) => void toggleCell('inBrowser', (e.target as HTMLInputElement).checked)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushRateLimitEnabled}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.rateLimit}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushRateLimitEnabled: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update rate-limit preference', type: 'error' });
                    }
                  }}
                />
                Use push rate limiting and bundling
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushWeekendMute}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.weekendMute}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushWeekendMute: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update weekend mute setting', type: 'error' });
                    }
                  }}
                />
                Mute push notifications on weekends
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushQuietHoursEnabled}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.quietHours}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushQuietHoursEnabled: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update quiet hours setting', type: 'error' });
                    }
                  }}
                />
                Enable quiet hours
              </label>

              <div className="flex items-center gap-2 text-sm text-[var(--text)] pl-6">
                <span className="text-xs text-[var(--muted)]">Quiet hours:</span>
                <select
                  value={notificationPrefs.pushQuietHoursStart}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.quietHours || !notificationPrefs.pushQuietHoursEnabled}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushQuietHoursStart: Number((e.target as HTMLSelectElement).value) };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update quiet hours start', type: 'error' });
                    }
                  }}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1"
                >
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <option key={`quiet-start-${hour}`} value={hour}>{hour.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
                <span>to</span>
                <select
                  value={notificationPrefs.pushQuietHoursEnd}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.quietHours || !notificationPrefs.pushQuietHoursEnabled}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushQuietHoursEnd: Number((e.target as HTMLSelectElement).value) };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update quiet hours end', type: 'error' });
                    }
                  }}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1"
                >
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <option key={`quiet-end-${hour}`} value={hour}>{hour.toString().padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushDigestWindowEnabled}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.digestWindow}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushDigestWindowEnabled: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update digest window preference', type: 'error' });
                    }
                  }}
                />
                Enable digest-window scheduling for non-urgent push
              </label>

              <div className="flex items-center gap-2 text-sm text-[var(--text)]">
                <span className="text-xs text-[var(--muted)]">Non-urgent delivery:</span>
                <select
                  value={notificationPrefs.pushDigestWindow}
                  disabled={
                    notificationBusy
                    || !notificationPrefs.webPushEnabled
                    || !pushFeatureAvailability.digestWindow
                    || !notificationPrefs.pushDigestWindowEnabled
                  }
                  onChange={async (e) => {
                    const next = {
                      ...notificationPrefs,
                      pushDigestWindow: ((e.target as HTMLSelectElement).value || 'instant') as NotificationPreferences['pushDigestWindow'],
                    };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update digest window setting', type: 'error' });
                    }
                  }}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1"
                >
                  <option value="instant">Send instantly</option>
                  <option value="morning">Morning digest</option>
                  <option value="evening">Evening digest</option>
                </select>
              </div>

              <div className="text-xs text-[var(--muted)]">
                Timezone: {notificationPrefs.pushTimezone || browserTimezone || 'Server default'}
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushSnoozeEnabled}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.snooze}
                  onChange={async (e) => {
                    const next = {
                      ...notificationPrefs,
                      pushSnoozeEnabled: (e.target as HTMLInputElement).checked,
                      pushSnoozeUntil: (e.target as HTMLInputElement).checked ? notificationPrefs.pushSnoozeUntil : null,
                    };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update snooze preference', type: 'error' });
                    }
                  }}
                />
                Enable manual snooze controls
              </label>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.snooze || !notificationPrefs.pushSnoozeEnabled}
                  onClick={async () => {
                    const next = {
                      ...notificationPrefs,
                      pushSnoozeUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                    };
                    try {
                      await saveNotificationPrefs(next);
                      setToast({ message: 'Push snoozed for 1 hour', type: 'info' });
                    } catch {
                      setToast({ message: 'Failed to snooze push notifications', type: 'error' });
                    }
                  }}
                >
                  Snooze 1 Hour
                </Button>
                <Button
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.snooze || !notificationPrefs.pushSnoozeEnabled}
                  onClick={async () => {
                    const endOfDay = new Date();
                    endOfDay.setHours(23, 59, 59, 999);
                    const next = { ...notificationPrefs, pushSnoozeUntil: endOfDay.toISOString() };
                    try {
                      await saveNotificationPrefs(next);
                      setToast({ message: 'Push snoozed until end of day', type: 'info' });
                    } catch {
                      setToast({ message: 'Failed to snooze push notifications', type: 'error' });
                    }
                  }}
                >
                  Snooze Today
                </Button>
                <Button
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.snooze || !notificationPrefs.pushSnoozeEnabled}
                  onClick={async () => {
                    const endOfWeek = new Date();
                    const daysUntilSunday = (7 - endOfWeek.getDay()) % 7;
                    endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
                    endOfWeek.setHours(23, 59, 59, 999);
                    const next = { ...notificationPrefs, pushSnoozeUntil: endOfWeek.toISOString() };
                    try {
                      await saveNotificationPrefs(next);
                      setToast({ message: 'Push snoozed until end of week', type: 'info' });
                    } catch {
                      setToast({ message: 'Failed to snooze push notifications', type: 'error' });
                    }
                  }}
                >
                  Snooze This Week
                </Button>
                <Button
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.snooze || !notificationPrefs.pushSnoozeEnabled || !notificationPrefs.pushSnoozeUntil}
                  onClick={async () => {
                    const next = { ...notificationPrefs, pushSnoozeUntil: null };
                    try {
                      await saveNotificationPrefs(next);
                      setToast({ message: 'Push snooze cleared', type: 'success' });
                    } catch {
                      setToast({ message: 'Failed to clear push snooze', type: 'error' });
                    }
                  }}
                >
                  Clear Snooze
                </Button>
              </div>
              {notificationPrefs.pushSnoozeUntil ? (
                <div className="text-xs text-amber-300">
                  Snoozed until {new Date(notificationPrefs.pushSnoozeUntil).toLocaleString()}.
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushActionsEnabled}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.actions}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushActionsEnabled: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update push action preference', type: 'error' });
                    }
                  }}
                />
                Enable notification action buttons
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushDeepLinksEnabled}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.deepLinks}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushDeepLinksEnabled: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update deep-link preference', type: 'error' });
                    }
                  }}
                />
                Open push notifications at deep links
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushSubscriptionCleanupEnabled}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled || !pushFeatureAvailability.subscriptionHealthcheck}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushSubscriptionCleanupEnabled: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update subscription cleanup preference', type: 'error' });
                    }
                  }}
                />
                Allow automatic cleanup of stale push subscriptions
              </label>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  disabled={!notificationPrefs.webPushEnabled || notificationBusy}
                  onClick={async () => {
                    try {
                      await authApi.testPush();
                      setToast({ message: 'Test notification queued', type: 'success' });
                    } catch (err: any) {
                      setToast({ message: err?.message || 'Failed to send test notification', type: 'error' });
                    }
                  }}
                >
                  Send Test Notification
                </Button>
                <span className="text-xs text-[var(--muted)]">
                  Active subscriptions: {pushSubscriptions.length}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Name</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <Input
                type="text"
                autoComplete="name"
                value={personName}
                onChange={(e) => setPersonName((e.target as HTMLInputElement).value)}
                disabled={!canEditName}
                placeholder={canEditName ? 'Enter your name' : 'No linked person'}
              />
            </div>
            <div>
              <Button
                disabled={!canEditName || savingName}
                onClick={async () => {
                  if (!auth.person?.id) return;
                  setNameMsg(null);
                  setSavingName(true);
                  try {
                    await updatePersonMutation.mutateAsync({ id: auth.person.id, data: { name: personName } });
                    setNameMsg('Name updated.');
                    setToast({ message: 'Profile name updated', type: 'success' });
                  } catch (err: any) {
                    setNameMsg(err?.message || 'Failed to update name');
                    setToast({ message: 'Failed to update profile name', type: 'error' });
                  } finally {
                    setSavingName(false);
                  }
                }}
              >
                {savingName ? 'Saving…' : 'Save Name'}
              </Button>
            </div>
          </div>
          {nameMsg && <div className="text-sm text-[var(--text)] mt-2">{nameMsg}</div>}
        </div>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-4">Change Password</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Current Password</label>
              <Input type="password" autoComplete="current-password" value={currentPw} onChange={e => setCurrentPw((e.target as HTMLInputElement).value)} />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">New Password</label>
              <Input type="password" autoComplete="new-password" value={newPw} onChange={e => setNewPw((e.target as HTMLInputElement).value)} />
            </div>
            <div>
              <label className="block text-sm text-[var(--muted)] mb-1">Confirm New Password</label>
              <Input type="password" autoComplete="new-password" value={confirmPw} onChange={e => setConfirmPw((e.target as HTMLInputElement).value)} />
            </div>
          </div>
          <div className="mt-3">
            {pwMsg && <div className="text-sm text-[var(--text)] mb-2">{pwMsg}</div>}
            <Button
              disabled={pwBusy}
              onClick={async () => {
                setPwMsg(null);
                if (!currentPw || !newPw || newPw !== confirmPw) {
                  setPwMsg('Please enter current password and matching new passwords.');
                  return;
                }
                setPwBusy(true);
                try {
                  await authApi.changePassword(currentPw, newPw);
                  setPwMsg('Password changed successfully.');
                  setCurrentPw(''); setNewPw(''); setConfirmPw('');
                } catch (err: any) {
                  setPwMsg(err?.data?.detail || err?.message || 'Failed to change password');
                } finally {
                  setPwBusy(false);
                }
              }}
            >
              {pwBusy ? 'Changing…' : 'Change Password'}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </Layout>
    {toast && (
      <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
    )}
  </>
  );
};

export default Profile;
