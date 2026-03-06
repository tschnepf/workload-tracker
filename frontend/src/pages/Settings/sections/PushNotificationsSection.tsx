import React from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import { isAdminUser } from '@/utils/roleAccess';
import { showToast } from '@/lib/toastBus';
import { webPushGlobalSettingsApi, webPushVapidKeysApi, type WebPushVapidKeysStatus } from '@/services/api';

export const PUSH_NOTIFICATIONS_SECTION_ID = 'push-notifications';

const PushNotificationsSection: React.FC = () => {
  const { auth, caps } = useSettingsData();
  const isAdmin = isAdminUser(auth.user);
  const [loading, setLoading] = React.useState(true);
  const [savingGlobal, setSavingGlobal] = React.useState(false);
  const [savingKeys, setSavingKeys] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enabled, setEnabled] = React.useState(true);
  const [initialEnabled, setInitialEnabled] = React.useState(true);
  const [rateLimitPerHour, setRateLimitPerHour] = React.useState(3);
  const [initialRateLimitPerHour, setInitialRateLimitPerHour] = React.useState(3);
  const [featureToggles, setFeatureToggles] = React.useState({
    pushRateLimitEnabled: true,
    pushWeekendMuteEnabled: true,
    pushQuietHoursEnabled: true,
    pushSnoozeEnabled: true,
    pushDigestWindowEnabled: true,
    pushActionsEnabled: true,
    pushDeepLinksEnabled: true,
    pushSubscriptionHealthcheckEnabled: true,
  });
  const [initialFeatureToggles, setInitialFeatureToggles] = React.useState({
    pushRateLimitEnabled: true,
    pushWeekendMuteEnabled: true,
    pushQuietHoursEnabled: true,
    pushSnoozeEnabled: true,
    pushDigestWindowEnabled: true,
    pushActionsEnabled: true,
    pushDeepLinksEnabled: true,
    pushSubscriptionHealthcheckEnabled: true,
  });
  const [eventToggles, setEventToggles] = React.useState({
    pushPreDeliverableRemindersEnabled: true,
    pushDailyDigestEnabled: true,
    pushAssignmentChangesEnabled: true,
    pushDeliverableDateChangesEnabled: true,
  });
  const [initialEventToggles, setInitialEventToggles] = React.useState({
    pushPreDeliverableRemindersEnabled: true,
    pushDailyDigestEnabled: true,
    pushAssignmentChangesEnabled: true,
    pushDeliverableDateChangesEnabled: true,
  });
  const [deliverableScope, setDeliverableScope] = React.useState<'next_upcoming' | 'all_upcoming'>('next_upcoming');
  const [initialDeliverableScope, setInitialDeliverableScope] = React.useState<'next_upcoming' | 'all_upcoming'>('next_upcoming');
  const [deliverableWithinTwoWeeksOnly, setDeliverableWithinTwoWeeksOnly] = React.useState(false);
  const [initialDeliverableWithinTwoWeeksOnly, setInitialDeliverableWithinTwoWeeksOnly] = React.useState(false);
  const [vapidStatus, setVapidStatus] = React.useState<WebPushVapidKeysStatus | null>(null);
  const [vapidSubject, setVapidSubject] = React.useState('');

  const load = React.useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [globalData, keyData] = await Promise.all([
        webPushGlobalSettingsApi.get(),
        webPushVapidKeysApi.get(),
      ]);
      setEnabled(Boolean(globalData.enabled));
      setInitialEnabled(Boolean(globalData.enabled));
      const rateLimit = Math.max(1, Number(globalData.pushRateLimitPerHour ?? 3));
      setRateLimitPerHour(rateLimit);
      setInitialRateLimitPerHour(rateLimit);
      const nextFeatures = {
        pushRateLimitEnabled: Boolean(globalData.pushRateLimitEnabled ?? true),
        pushWeekendMuteEnabled: Boolean(globalData.pushWeekendMuteEnabled ?? true),
        pushQuietHoursEnabled: Boolean(globalData.pushQuietHoursEnabled ?? true),
        pushSnoozeEnabled: Boolean(globalData.pushSnoozeEnabled ?? true),
        pushDigestWindowEnabled: Boolean(globalData.pushDigestWindowEnabled ?? true),
        pushActionsEnabled: Boolean(globalData.pushActionsEnabled ?? true),
        pushDeepLinksEnabled: Boolean(globalData.pushDeepLinksEnabled ?? true),
        pushSubscriptionHealthcheckEnabled: Boolean(globalData.pushSubscriptionHealthcheckEnabled ?? true),
      };
      setFeatureToggles(nextFeatures);
      setInitialFeatureToggles(nextFeatures);
      const nextEvents = {
        pushPreDeliverableRemindersEnabled: Boolean(globalData.pushPreDeliverableRemindersEnabled ?? true),
        pushDailyDigestEnabled: Boolean(globalData.pushDailyDigestEnabled ?? true),
        pushAssignmentChangesEnabled: Boolean(globalData.pushAssignmentChangesEnabled ?? true),
        pushDeliverableDateChangesEnabled: Boolean(globalData.pushDeliverableDateChangesEnabled ?? true),
      };
      setEventToggles(nextEvents);
      setInitialEventToggles(nextEvents);
      const scope = globalData.pushDeliverableDateChangeScope === 'all_upcoming' ? 'all_upcoming' : 'next_upcoming';
      setDeliverableScope(scope);
      setInitialDeliverableScope(scope);
      const withinTwoWeeks = Boolean(globalData.pushDeliverableDateChangeWithinTwoWeeksOnly ?? false);
      setDeliverableWithinTwoWeeksOnly(withinTwoWeeks);
      setInitialDeliverableWithinTwoWeeksOnly(withinTwoWeeks);
      setVapidStatus(keyData);
      setVapidSubject(keyData.subject || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load mobile push settings');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveGlobal = async () => {
    setSavingGlobal(true);
    setError(null);
    try {
      const data = await webPushGlobalSettingsApi.update({
        enabled,
        pushRateLimitEnabled: featureToggles.pushRateLimitEnabled,
        pushRateLimitPerHour: rateLimitPerHour,
        pushWeekendMuteEnabled: featureToggles.pushWeekendMuteEnabled,
        pushQuietHoursEnabled: featureToggles.pushQuietHoursEnabled,
        pushSnoozeEnabled: featureToggles.pushSnoozeEnabled,
        pushDigestWindowEnabled: featureToggles.pushDigestWindowEnabled,
        pushActionsEnabled: featureToggles.pushActionsEnabled,
        pushDeepLinksEnabled: featureToggles.pushDeepLinksEnabled,
        pushSubscriptionHealthcheckEnabled: featureToggles.pushSubscriptionHealthcheckEnabled,
        pushPreDeliverableRemindersEnabled: eventToggles.pushPreDeliverableRemindersEnabled,
        pushDailyDigestEnabled: eventToggles.pushDailyDigestEnabled,
        pushAssignmentChangesEnabled: eventToggles.pushAssignmentChangesEnabled,
        pushDeliverableDateChangesEnabled: eventToggles.pushDeliverableDateChangesEnabled,
        pushDeliverableDateChangeScope: deliverableScope,
        pushDeliverableDateChangeWithinTwoWeeksOnly: deliverableWithinTwoWeeksOnly,
      });
      setEnabled(Boolean(data.enabled));
      setInitialEnabled(Boolean(data.enabled));
      const rateLimit = Math.max(1, Number(data.pushRateLimitPerHour ?? 3));
      setRateLimitPerHour(rateLimit);
      setInitialRateLimitPerHour(rateLimit);
      const nextFeatures = {
        pushRateLimitEnabled: Boolean(data.pushRateLimitEnabled ?? true),
        pushWeekendMuteEnabled: Boolean(data.pushWeekendMuteEnabled ?? true),
        pushQuietHoursEnabled: Boolean(data.pushQuietHoursEnabled ?? true),
        pushSnoozeEnabled: Boolean(data.pushSnoozeEnabled ?? true),
        pushDigestWindowEnabled: Boolean(data.pushDigestWindowEnabled ?? true),
        pushActionsEnabled: Boolean(data.pushActionsEnabled ?? true),
        pushDeepLinksEnabled: Boolean(data.pushDeepLinksEnabled ?? true),
        pushSubscriptionHealthcheckEnabled: Boolean(data.pushSubscriptionHealthcheckEnabled ?? true),
      };
      setFeatureToggles(nextFeatures);
      setInitialFeatureToggles(nextFeatures);
      const nextEvents = {
        pushPreDeliverableRemindersEnabled: Boolean(data.pushPreDeliverableRemindersEnabled ?? true),
        pushDailyDigestEnabled: Boolean(data.pushDailyDigestEnabled ?? true),
        pushAssignmentChangesEnabled: Boolean(data.pushAssignmentChangesEnabled ?? true),
        pushDeliverableDateChangesEnabled: Boolean(data.pushDeliverableDateChangesEnabled ?? true),
      };
      setEventToggles(nextEvents);
      setInitialEventToggles(nextEvents);
      const scope = data.pushDeliverableDateChangeScope === 'all_upcoming' ? 'all_upcoming' : 'next_upcoming';
      setDeliverableScope(scope);
      setInitialDeliverableScope(scope);
      const withinTwoWeeks = Boolean(data.pushDeliverableDateChangeWithinTwoWeeksOnly ?? false);
      setDeliverableWithinTwoWeeksOnly(withinTwoWeeks);
      setInitialDeliverableWithinTwoWeeksOnly(withinTwoWeeks);
      showToast(`Push notifications ${data.enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to update push notification settings');
    } finally {
      setSavingGlobal(false);
    }
  };

  const generateVapidKeys = async () => {
    const subject = vapidSubject.trim();
    if (!subject) {
      setError('VAPID subject is required (example: mailto:alerts@yourcompany.com)');
      return;
    }
    setSavingKeys(true);
    setError(null);
    try {
      const data = await webPushVapidKeysApi.generate({ subject });
      setVapidStatus(data);
      setVapidSubject(data.subject || subject);
      showToast('VAPID keys saved securely', 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to generate VAPID keys');
    } finally {
      setSavingKeys(false);
    }
  };

  if (!isAdmin) return null;

  const dirty = (
    enabled !== initialEnabled
    || rateLimitPerHour !== initialRateLimitPerHour
    || featureToggles.pushRateLimitEnabled !== initialFeatureToggles.pushRateLimitEnabled
    || featureToggles.pushWeekendMuteEnabled !== initialFeatureToggles.pushWeekendMuteEnabled
    || featureToggles.pushQuietHoursEnabled !== initialFeatureToggles.pushQuietHoursEnabled
    || featureToggles.pushSnoozeEnabled !== initialFeatureToggles.pushSnoozeEnabled
    || featureToggles.pushDigestWindowEnabled !== initialFeatureToggles.pushDigestWindowEnabled
    || featureToggles.pushActionsEnabled !== initialFeatureToggles.pushActionsEnabled
    || featureToggles.pushDeepLinksEnabled !== initialFeatureToggles.pushDeepLinksEnabled
    || featureToggles.pushSubscriptionHealthcheckEnabled !== initialFeatureToggles.pushSubscriptionHealthcheckEnabled
    || eventToggles.pushPreDeliverableRemindersEnabled !== initialEventToggles.pushPreDeliverableRemindersEnabled
    || eventToggles.pushDailyDigestEnabled !== initialEventToggles.pushDailyDigestEnabled
    || eventToggles.pushAssignmentChangesEnabled !== initialEventToggles.pushAssignmentChangesEnabled
    || eventToggles.pushDeliverableDateChangesEnabled !== initialEventToggles.pushDeliverableDateChangesEnabled
    || deliverableScope !== initialDeliverableScope
    || deliverableWithinTwoWeeksOnly !== initialDeliverableWithinTwoWeeksOnly
  );
  const hasVapidKey = Boolean(vapidStatus?.configured);
  const busy = loading || savingGlobal || savingKeys;

  return (
    <SettingsSectionFrame
      id={PUSH_NOTIFICATIONS_SECTION_ID}
      title="Mobile"
      description="Manage mobile app behavior: web push delivery and secure VAPID key management."
      className="mt-6"
      actions={(
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={saveGlobal} disabled={busy || !dirty}>
            {savingGlobal ? 'Saving...' : 'Save'}
          </Button>
        </div>
      )}
    >
      {error ? <div className="text-sm text-red-400 mb-3">{error}</div> : null}
      {loading ? <div className="text-sm text-[var(--muted)]">Loading mobile settings...</div> : null}
      {!loading ? (
        <div className="space-y-3">
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
            Push Delivery
          </div>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={busy}
            />
            Enable push notifications globally
          </label>
          <div className="text-xs text-[var(--muted)]">
            Runtime status: {caps?.pwa?.pushEnabled ? 'enabled' : 'disabled'}
          </div>
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide pt-2">
            Global Push Features
          </div>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushRateLimitEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({
                ...prev,
                pushRateLimitEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Rate limiting and bundled overflow
          </label>
          <div className="flex items-center gap-2 text-sm text-[var(--text)]">
            <span className="text-xs text-[var(--muted)]">Max push events per user per hour:</span>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              className="w-24 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
              value={rateLimitPerHour}
              disabled={busy || !featureToggles.pushRateLimitEnabled}
              onChange={(e) => setRateLimitPerHour(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            />
          </div>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushWeekendMuteEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({
                ...prev,
                pushWeekendMuteEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Weekend mute controls
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushQuietHoursEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({
                ...prev,
                pushQuietHoursEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Quiet-hours controls
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushSnoozeEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({
                ...prev,
                pushSnoozeEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Snooze controls
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushDigestWindowEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({
                ...prev,
                pushDigestWindowEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Digest-window scheduling controls
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushActionsEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({
                ...prev,
                pushActionsEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Notification action buttons
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushDeepLinksEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({
                ...prev,
                pushDeepLinksEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Deep links from notifications
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushSubscriptionHealthcheckEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({
                ...prev,
                pushSubscriptionHealthcheckEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Subscription health check cleanup
          </label>
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide pt-2">
            Global Push Event Types
          </div>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={eventToggles.pushPreDeliverableRemindersEnabled}
              onChange={(e) => setEventToggles((prev) => ({
                ...prev,
                pushPreDeliverableRemindersEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Pre-deliverable reminders
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={eventToggles.pushDailyDigestEnabled}
              onChange={(e) => setEventToggles((prev) => ({
                ...prev,
                pushDailyDigestEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Daily digest
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={eventToggles.pushAssignmentChangesEnabled}
              onChange={(e) => setEventToggles((prev) => ({
                ...prev,
                pushAssignmentChangesEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Assignment changes
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={eventToggles.pushDeliverableDateChangesEnabled}
              onChange={(e) => setEventToggles((prev) => ({
                ...prev,
                pushDeliverableDateChangesEnabled: e.target.checked,
              }))}
              disabled={busy}
            />
            Deliverable date changes
          </label>
          <div className="pl-6 space-y-2">
            <label className="block text-xs text-[var(--muted)]">
              Deliverable date-change scope
            </label>
            <select
              className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
              value={deliverableScope}
              onChange={(e) => setDeliverableScope(e.target.value === 'all_upcoming' ? 'all_upcoming' : 'next_upcoming')}
              disabled={busy || !eventToggles.pushDeliverableDateChangesEnabled}
            >
              <option value="next_upcoming">Only next upcoming deliverable</option>
              <option value="all_upcoming">All upcoming deliverables</option>
            </select>
            <label className="flex items-center gap-3 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={deliverableWithinTwoWeeksOnly}
                onChange={(e) => setDeliverableWithinTwoWeeksOnly(e.target.checked)}
                disabled={busy || !eventToggles.pushDeliverableDateChangesEnabled}
              />
              Only include date changes within the next 2 weeks
            </label>
          </div>
          <div className="text-xs text-[var(--muted)]">
            Disabled features or events are blocked globally and users cannot opt into them in Profile.
          </div>

          <div className="pt-2 border-t border-[var(--border)]" />
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
            VAPID Keys
          </div>
          <div className="text-xs text-[var(--muted)]">
            Status: {vapidStatus?.configured ? 'configured' : 'not configured'} (source: {vapidStatus?.source || 'none'})
          </div>
          <Input
            label="VAPID subject"
            value={vapidSubject}
            onChange={(e) => setVapidSubject((e.target as HTMLInputElement).value)}
            placeholder="mailto:alerts@yourcompany.com"
            autoComplete="off"
            disabled={busy}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[var(--muted)] mb-1">Public key (masked)</div>
              <code className="block px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)]">
                {vapidStatus?.publicKeyMasked || 'not configured'}
              </code>
            </div>
            <div>
              <div className="text-[var(--muted)] mb-1">Private key (masked)</div>
              <code className="block px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)]">
                {vapidStatus?.privateKeyMasked || 'not configured'}
              </code>
            </div>
          </div>
          <div>
            <Button variant="secondary" size="sm" onClick={generateVapidKeys} disabled={busy}>
              {savingKeys ? 'Saving...' : (vapidStatus?.configured ? 'Regenerate Keys' : 'Generate Keys')}
            </Button>
          </div>
          <div className="text-xs text-amber-300">
            Regenerating VAPID keys invalidates existing browser subscriptions. Users may need to re-enable push.
          </div>
          {!hasVapidKey ? (
            <div className="text-xs text-amber-300">
              VAPID keys are not configured on the server, so push delivery will remain unavailable until keys are set.
            </div>
          ) : null}
        </div>
      ) : null}
    </SettingsSectionFrame>
  );
};

export default PushNotificationsSection;
