import React from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SettingsSectionFrame from '@/pages/Settings/components/SettingsSectionFrame';
import { useSettingsData } from '../SettingsDataContext';
import { isAdminUser } from '@/utils/roleAccess';
import { showToast } from '@/lib/toastBus';
import {
  notificationAnalyticsApi,
  notificationTemplatesApi,
  webPushGlobalSettingsApi,
  webPushVapidKeysApi,
  type NotificationChannelMatrix,
  type NotificationEventCatalogItem,
  type NotificationTemplate,
  type NotificationAnalyticsResponse,
  type WebPushVapidKeysStatus,
} from '@/services/api';

export const PUSH_NOTIFICATIONS_SECTION_ID = 'push-notifications';

const DEFAULT_EVENT_CATALOG: NotificationEventCatalogItem[] = [
  {
    key: 'pred.reminder',
    label: 'Pre-deliverable reminder',
    description: 'Reminder for upcoming pre-deliverable work.',
    supports: { mobilePush: true, email: true, inBrowser: true },
  },
  {
    key: 'pred.digest',
    label: 'Daily digest',
    description: 'Daily summary of relevant pre-deliverables.',
    supports: { mobilePush: true, email: true, inBrowser: true },
  },
  {
    key: 'assignment.created',
    label: 'Assignment created',
    description: 'A new assignment was created for your linked person.',
    supports: { mobilePush: true, email: true, inBrowser: true },
  },
  {
    key: 'assignment.removed',
    label: 'Assignment removed',
    description: 'An assignment was removed for your linked person.',
    supports: { mobilePush: true, email: true, inBrowser: true },
  },
  {
    key: 'assignment.bulk_updated',
    label: 'Assignment bulk updated',
    description: 'Bulk assignment updates affected your linked person.',
    supports: { mobilePush: true, email: true, inBrowser: true },
  },
  {
    key: 'deliverable.reminder',
    label: 'Deliverable reminder',
    description: 'Reminder for upcoming deliverables on your assigned projects.',
    supports: { mobilePush: true, email: true, inBrowser: true },
  },
  {
    key: 'deliverable.date_changed',
    label: 'Deliverable date changed',
    description: 'A project deliverable date changed for an assigned project.',
    supports: { mobilePush: true, email: true, inBrowser: true },
  },
];

const defaultMatrix = (): NotificationChannelMatrix => ({
  'pred.reminder': { mobilePush: true, email: true, inBrowser: true },
  'pred.digest': { mobilePush: true, email: true, inBrowser: true },
  'assignment.created': { mobilePush: true, email: true, inBrowser: true },
  'assignment.removed': { mobilePush: true, email: true, inBrowser: true },
  'assignment.bulk_updated': { mobilePush: true, email: true, inBrowser: true },
  'deliverable.reminder': { mobilePush: true, email: true, inBrowser: true },
  'deliverable.date_changed': { mobilePush: true, email: true, inBrowser: true },
});

const matrixChanged = (a: NotificationChannelMatrix, b: NotificationChannelMatrix): boolean => (
  JSON.stringify(a) !== JSON.stringify(b)
);

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
  const [channelMatrix, setChannelMatrix] = React.useState<NotificationChannelMatrix>(defaultMatrix());
  const [initialChannelMatrix, setInitialChannelMatrix] = React.useState<NotificationChannelMatrix>(defaultMatrix());
  const [eventCatalog, setEventCatalog] = React.useState<NotificationEventCatalogItem[]>(DEFAULT_EVENT_CATALOG);
  const [deliverableScope, setDeliverableScope] = React.useState<'next_upcoming' | 'all_upcoming'>('next_upcoming');
  const [initialDeliverableScope, setInitialDeliverableScope] = React.useState<'next_upcoming' | 'all_upcoming'>('next_upcoming');
  const [deliverableWithinTwoWeeksOnly, setDeliverableWithinTwoWeeksOnly] = React.useState(false);
  const [initialDeliverableWithinTwoWeeksOnly, setInitialDeliverableWithinTwoWeeksOnly] = React.useState(false);
  const [activeWebSuppressionEnabled, setActiveWebSuppressionEnabled] = React.useState(true);
  const [initialActiveWebSuppressionEnabled, setInitialActiveWebSuppressionEnabled] = React.useState(true);
  const [activeWebWindowSeconds, setActiveWebWindowSeconds] = React.useState(120);
  const [initialActiveWebWindowSeconds, setInitialActiveWebWindowSeconds] = React.useState(120);
  const [inAppRetentionDays, setInAppRetentionDays] = React.useState(7);
  const [initialInAppRetentionDays, setInitialInAppRetentionDays] = React.useState(7);
  const [savedInAppRetentionDays, setSavedInAppRetentionDays] = React.useState(90);
  const [initialSavedInAppRetentionDays, setInitialSavedInAppRetentionDays] = React.useState(90);
  const [templates, setTemplates] = React.useState<NotificationTemplate[]>([]);
  const [initialTemplates, setInitialTemplates] = React.useState<NotificationTemplate[]>([]);
  const [templatesBusy, setTemplatesBusy] = React.useState(false);
  const [analytics, setAnalytics] = React.useState<NotificationAnalyticsResponse | null>(null);
  const [analyticsDays, setAnalyticsDays] = React.useState(7);
  const [analyticsBusy, setAnalyticsBusy] = React.useState(false);
  const [vapidStatus, setVapidStatus] = React.useState<WebPushVapidKeysStatus | null>(null);
  const [vapidSubject, setVapidSubject] = React.useState('');

  const load = React.useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const [globalData, keyData, templatesData, analyticsData] = await Promise.all([
        webPushGlobalSettingsApi.get(),
        webPushVapidKeysApi.get(),
        notificationTemplatesApi.list(),
        notificationAnalyticsApi.get(7),
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

      const nextMatrix = (globalData.notificationChannelMatrix || defaultMatrix()) as NotificationChannelMatrix;
      setChannelMatrix(nextMatrix);
      setInitialChannelMatrix(nextMatrix);
      setEventCatalog((globalData.notificationEventCatalog || DEFAULT_EVENT_CATALOG) as NotificationEventCatalogItem[]);

      const scope = globalData.pushDeliverableDateChangeScope === 'all_upcoming' ? 'all_upcoming' : 'next_upcoming';
      setDeliverableScope(scope);
      setInitialDeliverableScope(scope);
      const withinTwoWeeks = Boolean(globalData.pushDeliverableDateChangeWithinTwoWeeksOnly ?? false);
      setDeliverableWithinTwoWeeksOnly(withinTwoWeeks);
      setInitialDeliverableWithinTwoWeeksOnly(withinTwoWeeks);
      const nextSuppressionEnabled = Boolean(globalData.activeWebSuppressionEnabled ?? true);
      setActiveWebSuppressionEnabled(nextSuppressionEnabled);
      setInitialActiveWebSuppressionEnabled(nextSuppressionEnabled);
      const nextActiveWindow = Math.max(30, Number(globalData.activeWebWindowSeconds ?? 120));
      setActiveWebWindowSeconds(nextActiveWindow);
      setInitialActiveWebWindowSeconds(nextActiveWindow);
      const nextInAppRetention = Math.max(1, Number(globalData.inAppRetentionDays ?? 7));
      setInAppRetentionDays(nextInAppRetention);
      setInitialInAppRetentionDays(nextInAppRetention);
      const nextSavedRetention = Math.max(7, Number(globalData.savedInAppRetentionDays ?? 90));
      setSavedInAppRetentionDays(nextSavedRetention);
      setInitialSavedInAppRetentionDays(nextSavedRetention);
      setTemplates(templatesData || []);
      setInitialTemplates(templatesData || []);
      setAnalytics(analyticsData || null);
      setVapidStatus(keyData);
      setVapidSubject(keyData.subject || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setMatrixCell = (eventKey: keyof NotificationChannelMatrix, channel: 'mobilePush' | 'email' | 'inBrowser', value: boolean) => {
    setChannelMatrix((prev) => ({
      ...prev,
      [eventKey]: {
        ...(prev[eventKey] || { mobilePush: true, email: true, inBrowser: true }),
        [channel]: value,
      },
    }));
  };

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
        pushDeliverableDateChangeScope: deliverableScope,
        pushDeliverableDateChangeWithinTwoWeeksOnly: deliverableWithinTwoWeeksOnly,
        activeWebSuppressionEnabled,
        activeWebWindowSeconds,
        inAppRetentionDays,
        savedInAppRetentionDays,
        notificationChannelMatrix: channelMatrix,
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
      const savedMatrix = (data.notificationChannelMatrix || defaultMatrix()) as NotificationChannelMatrix;
      setChannelMatrix(savedMatrix);
      setInitialChannelMatrix(savedMatrix);
      setEventCatalog((data.notificationEventCatalog || DEFAULT_EVENT_CATALOG) as NotificationEventCatalogItem[]);
      const scope = data.pushDeliverableDateChangeScope === 'all_upcoming' ? 'all_upcoming' : 'next_upcoming';
      setDeliverableScope(scope);
      setInitialDeliverableScope(scope);
      const withinTwoWeeks = Boolean(data.pushDeliverableDateChangeWithinTwoWeeksOnly ?? false);
      setDeliverableWithinTwoWeeksOnly(withinTwoWeeks);
      setInitialDeliverableWithinTwoWeeksOnly(withinTwoWeeks);
      const nextSuppressionEnabled = Boolean(data.activeWebSuppressionEnabled ?? true);
      setActiveWebSuppressionEnabled(nextSuppressionEnabled);
      setInitialActiveWebSuppressionEnabled(nextSuppressionEnabled);
      const nextActiveWindow = Math.max(30, Number(data.activeWebWindowSeconds ?? 120));
      setActiveWebWindowSeconds(nextActiveWindow);
      setInitialActiveWebWindowSeconds(nextActiveWindow);
      const nextInAppRetention = Math.max(1, Number(data.inAppRetentionDays ?? 7));
      setInAppRetentionDays(nextInAppRetention);
      setInitialInAppRetentionDays(nextInAppRetention);
      const nextSavedRetention = Math.max(7, Number(data.savedInAppRetentionDays ?? 90));
      setSavedInAppRetentionDays(nextSavedRetention);
      setInitialSavedInAppRetentionDays(nextSavedRetention);
      showToast(`Notifications ${data.enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to update notification settings');
    } finally {
      setSavingGlobal(false);
    }
  };

  const updateTemplateField = (
    eventKey: string,
    field: keyof NotificationTemplate,
    value: string | number,
  ) => {
    setTemplates((prev) => prev.map((row) => (
      row.eventKey === eventKey
        ? ({ ...row, [field]: value } as NotificationTemplate)
        : row
    )));
  };

  const saveTemplates = async () => {
    setTemplatesBusy(true);
    setError(null);
    try {
      const saved = await notificationTemplatesApi.update(templates);
      setTemplates(saved || []);
      setInitialTemplates(saved || []);
      showToast('Notification templates saved', 'success');
    } catch (e: any) {
      setError(e?.message || 'Failed to save templates');
    } finally {
      setTemplatesBusy(false);
    }
  };

  const refreshAnalytics = async () => {
    setAnalyticsBusy(true);
    setError(null);
    try {
      const data = await notificationAnalyticsApi.get(analyticsDays);
      setAnalytics(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load notification analytics');
    } finally {
      setAnalyticsBusy(false);
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
    || matrixChanged(channelMatrix, initialChannelMatrix)
    || deliverableScope !== initialDeliverableScope
    || deliverableWithinTwoWeeksOnly !== initialDeliverableWithinTwoWeeksOnly
    || activeWebSuppressionEnabled !== initialActiveWebSuppressionEnabled
    || activeWebWindowSeconds !== initialActiveWebWindowSeconds
    || inAppRetentionDays !== initialInAppRetentionDays
    || savedInAppRetentionDays !== initialSavedInAppRetentionDays
  );
  const templatesDirty = JSON.stringify(templates) !== JSON.stringify(initialTemplates);

  const hasVapidKey = Boolean(vapidStatus?.configured);
  const busy = loading || savingGlobal || savingKeys;
  const deliverableRow = channelMatrix['deliverable.date_changed'];
  const deliverableAnyChannelEnabled = Boolean(
    deliverableRow?.mobilePush || deliverableRow?.email || deliverableRow?.inBrowser,
  );

  return (
    <SettingsSectionFrame
      id={PUSH_NOTIFICATIONS_SECTION_ID}
      title="Notifications"
      description="Manage notification channels, push delivery behavior, and secure VAPID key management."
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
      {loading ? <div className="text-sm text-[var(--muted)]">Loading notification settings...</div> : null}
      {!loading ? (
        <div className="space-y-4">
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Push Delivery</div>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={busy}
            />
            Enable mobile push notifications globally
          </label>
          <div className="text-xs text-[var(--muted)]">Runtime status: {caps?.pwa?.pushEnabled ? 'enabled' : 'disabled'}</div>

          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide pt-2">Global Push Features</div>

          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushRateLimitEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({ ...prev, pushRateLimitEnabled: e.target.checked }))}
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
              onChange={(e) => setFeatureToggles((prev) => ({ ...prev, pushWeekendMuteEnabled: e.target.checked }))}
              disabled={busy}
            />
            Weekend mute controls
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushQuietHoursEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({ ...prev, pushQuietHoursEnabled: e.target.checked }))}
              disabled={busy}
            />
            Quiet-hours controls
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushSnoozeEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({ ...prev, pushSnoozeEnabled: e.target.checked }))}
              disabled={busy}
            />
            Snooze controls
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushDigestWindowEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({ ...prev, pushDigestWindowEnabled: e.target.checked }))}
              disabled={busy}
            />
            Digest-window scheduling controls
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushActionsEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({ ...prev, pushActionsEnabled: e.target.checked }))}
              disabled={busy}
            />
            Notification action buttons
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushDeepLinksEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({ ...prev, pushDeepLinksEnabled: e.target.checked }))}
              disabled={busy}
            />
            Deep links from notifications
          </label>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={featureToggles.pushSubscriptionHealthcheckEnabled}
              onChange={(e) => setFeatureToggles((prev) => ({ ...prev, pushSubscriptionHealthcheckEnabled: e.target.checked }))}
              disabled={busy}
            />
            Subscription health check cleanup
          </label>

          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide pt-2">Notification Channel Availability</div>
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
                {eventCatalog.map((row) => (
                  <tr key={row.key} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-2 align-top">
                      <div className="text-[var(--text)] font-medium">{row.label}</div>
                      <div className="text-xs text-[var(--muted)]">{row.description}</div>
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={Boolean(channelMatrix[row.key]?.mobilePush)}
                        onChange={(e) => setMatrixCell(row.key, 'mobilePush', e.target.checked)}
                        disabled={busy || !row.supports.mobilePush}
                      />
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={Boolean(channelMatrix[row.key]?.email)}
                        onChange={(e) => setMatrixCell(row.key, 'email', e.target.checked)}
                        disabled={busy || !row.supports.email}
                      />
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={Boolean(channelMatrix[row.key]?.inBrowser)}
                        onChange={(e) => setMatrixCell(row.key, 'inBrowser', e.target.checked)}
                        disabled={busy || !row.supports.inBrowser}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide pt-2">Deliverable Date-Change Scope</div>
          <div className="pl-1 space-y-2">
            <select
              className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
              value={deliverableScope}
              onChange={(e) => setDeliverableScope(e.target.value === 'all_upcoming' ? 'all_upcoming' : 'next_upcoming')}
              disabled={busy || !deliverableAnyChannelEnabled}
            >
              <option value="next_upcoming">Only next upcoming deliverable</option>
              <option value="all_upcoming">All upcoming deliverables</option>
            </select>
            <label className="flex items-center gap-3 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={deliverableWithinTwoWeeksOnly}
                onChange={(e) => setDeliverableWithinTwoWeeksOnly(e.target.checked)}
                disabled={busy || !deliverableAnyChannelEnabled}
              />
              Only include date changes within the next 2 weeks
            </label>
          </div>

          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide pt-2">Active-Web Suppression</div>
          <label className="flex items-center gap-3 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={activeWebSuppressionEnabled}
              onChange={(e) => setActiveWebSuppressionEnabled(e.target.checked)}
              disabled={busy}
            />
            Prefer in-browser over push/email for active web users
          </label>
          <div className="flex items-center gap-2 text-sm text-[var(--text)]">
            <span className="text-xs text-[var(--muted)]">Active window (seconds):</span>
            <input
              type="number"
              min={30}
              max={3600}
              step={10}
              className="w-28 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
              value={activeWebWindowSeconds}
              disabled={busy || !activeWebSuppressionEnabled}
              onChange={(e) => setActiveWebWindowSeconds(Math.max(30, Math.min(3600, Number(e.target.value) || 120)))}
            />
          </div>

          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide pt-2">Retention</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-sm text-[var(--text)]">
              <span className="text-xs text-[var(--muted)]">In-app retention days:</span>
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                className="w-24 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
                value={inAppRetentionDays}
                disabled={busy}
                onChange={(e) => setInAppRetentionDays(Math.max(1, Math.min(365, Number(e.target.value) || 7)))}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--text)]">
              <span className="text-xs text-[var(--muted)]">Saved retention days:</span>
              <input
                type="number"
                min={7}
                max={3650}
                step={1}
                className="w-24 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
                value={savedInAppRetentionDays}
                disabled={busy}
                onChange={(e) => setSavedInAppRetentionDays(Math.max(7, Math.min(3650, Number(e.target.value) || 90)))}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)]" />
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Notification Templates</div>
          <div className="text-xs text-[var(--muted)]">
            Edit per-event copy for Mobile Push, Email, and In Browser notifications.
          </div>
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.eventKey} className="border border-[var(--border)] rounded p-3 space-y-2">
                <div className="text-sm font-medium text-[var(--text)]">{template.eventKey}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input
                    label="Push title"
                    value={template.pushTitleTemplate}
                    onChange={(e) => updateTemplateField(template.eventKey, 'pushTitleTemplate', (e.target as HTMLInputElement).value)}
                    disabled={templatesBusy}
                  />
                  <Input
                    label="Push body"
                    value={template.pushBodyTemplate}
                    onChange={(e) => updateTemplateField(template.eventKey, 'pushBodyTemplate', (e.target as HTMLInputElement).value)}
                    disabled={templatesBusy}
                  />
                  <Input
                    label="Email subject"
                    value={template.emailSubjectTemplate}
                    onChange={(e) => updateTemplateField(template.eventKey, 'emailSubjectTemplate', (e.target as HTMLInputElement).value)}
                    disabled={templatesBusy}
                  />
                  <Input
                    label="Email body"
                    value={template.emailBodyTemplate}
                    onChange={(e) => updateTemplateField(template.eventKey, 'emailBodyTemplate', (e.target as HTMLInputElement).value)}
                    disabled={templatesBusy}
                  />
                  <Input
                    label="In-app title"
                    value={template.inAppTitleTemplate}
                    onChange={(e) => updateTemplateField(template.eventKey, 'inAppTitleTemplate', (e.target as HTMLInputElement).value)}
                    disabled={templatesBusy}
                  />
                  <Input
                    label="In-app body"
                    value={template.inAppBodyTemplate}
                    onChange={(e) => updateTemplateField(template.eventKey, 'inAppBodyTemplate', (e.target as HTMLInputElement).value)}
                    disabled={templatesBusy}
                  />
                  <div className="flex items-center gap-2 text-sm text-[var(--text)]">
                    <span className="text-xs text-[var(--muted)]">Push TTL (s):</span>
                    <input
                      type="number"
                      min={60}
                      max={2419200}
                      className="w-28 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
                      value={template.pushTtlSeconds}
                      onChange={(e) => updateTemplateField(template.eventKey, 'pushTtlSeconds', Math.max(60, Math.min(2419200, Number(e.target.value) || 3600)))}
                      disabled={templatesBusy}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text)]">
                    <span className="text-xs text-[var(--muted)]">Urgency:</span>
                    <select
                      className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
                      value={template.pushUrgency}
                      onChange={(e) => updateTemplateField(template.eventKey, 'pushUrgency', (e.target as HTMLSelectElement).value)}
                      disabled={templatesBusy}
                    >
                      <option value="very-low">very-low</option>
                      <option value="low">low</option>
                      <option value="normal">normal</option>
                      <option value="high">high</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[var(--text)]">
                    <span className="text-xs text-[var(--muted)]">Topic mode:</span>
                    <select
                      className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
                      value={template.pushTopicMode}
                      onChange={(e) => updateTemplateField(template.eventKey, 'pushTopicMode', (e.target as HTMLSelectElement).value)}
                      disabled={templatesBusy}
                    >
                      <option value="none">none</option>
                      <option value="event">event</option>
                      <option value="project">project</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <div>
              <Button variant="secondary" size="sm" onClick={saveTemplates} disabled={templatesBusy || !templatesDirty}>
                {templatesBusy ? 'Saving...' : 'Save Templates'}
              </Button>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)]" />
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Delivery Analytics</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={90}
              className="w-20 bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-sm text-[var(--text)]"
              value={analyticsDays}
              onChange={(e) => setAnalyticsDays(Math.max(1, Math.min(90, Number(e.target.value) || 7)))}
              disabled={analyticsBusy}
            />
            <Button variant="secondary" size="sm" onClick={refreshAnalytics} disabled={analyticsBusy}>
              {analyticsBusy ? 'Loading...' : 'Refresh Analytics'}
            </Button>
          </div>
          {analytics ? (
            <div className="text-xs text-[var(--muted)]">
              Window: {analytics.windowDays} day(s) | Total events: {analytics.total}
            </div>
          ) : null}
          {analytics?.byChannel?.length ? (
            <div className="text-xs text-[var(--muted)]">
              {analytics.byChannel.map((row) => `${row.channel}: ${row.count}`).join(' | ')}
            </div>
          ) : null}

          <div className="pt-2 border-t border-[var(--border)]" />
          <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">VAPID Keys</div>
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
