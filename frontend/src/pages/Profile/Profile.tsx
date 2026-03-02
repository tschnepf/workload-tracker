import React, { useEffect, useMemo, useState } from 'react';
import { useAuthenticatedEffect } from '@/hooks/useAuthenticatedEffect';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import {
  authApi,
  peopleApi,
  systemApi,
  type NotificationPreferences,
  type PushSubscriptionItem,
} from '@/services/api';
import { useUpdatePerson } from '@/hooks/usePeople';
import Toast from '@/components/ui/Toast';
import Layout from '@/components/layout/Layout';
import { setSettings } from '@/store/auth';
import { setColorScheme } from '@/theme/themeManager';
import { base64UrlToUint8Array, isWebPushSupported } from '@/utils/push';

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
  const [pushSubscriptions, setPushSubscriptions] = useState<PushSubscriptionItem[]>([]);

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
        setNotificationPrefs(prefs);
        setPushServerEnabled(Boolean(caps?.pwa?.enabled && caps?.pwa?.pushEnabled));
        setVapidPublicKey(caps?.pwa?.vapidPublicKey || null);
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
  }, []);

  useEffect(() => {
    if (!notificationPrefs?.webPushEnabled) return;
    if (!pushSupported || !pushServerEnabled || !vapidPublicKey) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    upsertCurrentBrowserSubscription().catch(() => {
      // best effort refresh on load
    });
  }, [notificationPrefs?.webPushEnabled, pushSupported, pushServerEnabled, vapidPublicKey]);

  const canEditName = !!auth.person?.id;

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

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushPreDeliverableReminders}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushPreDeliverableReminders: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update reminder push preference', type: 'error' });
                    }
                  }}
                />
                Push pre-deliverable reminders
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushDailyDigest}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushDailyDigest: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update digest push preference', type: 'error' });
                    }
                  }}
                />
                Push daily digest
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={notificationPrefs.pushAssignmentChanges}
                  disabled={notificationBusy || !notificationPrefs.webPushEnabled}
                  onChange={async (e) => {
                    const next = { ...notificationPrefs, pushAssignmentChanges: (e.target as HTMLInputElement).checked };
                    try {
                      await saveNotificationPrefs(next);
                    } catch {
                      setToast({ message: 'Failed to update assignment push preference', type: 'error' });
                    }
                  }}
                />
                Push assignment changes
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
