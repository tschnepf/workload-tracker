import React from 'react';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useInAppNotifications } from '@/hooks/useInAppNotifications';
import { authApi, type InAppNotificationStatusFilter, type NotificationProjectMuteItem } from '@/services/api';

const TABS: Array<{ key: InAppNotificationStatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'saved', label: 'Saved' },
  { key: 'snoozed', label: 'Snoozed' },
  { key: 'read', label: 'Read' },
];

const toIsoOrNull = (value: string): string | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const NotificationsPage: React.FC = () => {
  const [statusTab, setStatusTab] = React.useState<InAppNotificationStatusFilter>('all');
  const [projectMutes, setProjectMutes] = React.useState<NotificationProjectMuteItem[]>([]);
  const [projectIdInput, setProjectIdInput] = React.useState('');
  const [mutePushUntil, setMutePushUntil] = React.useState('');
  const [muteEmailUntil, setMuteEmailUntil] = React.useState('');
  const [muteBrowserUntil, setMuteBrowserUntil] = React.useState('');
  const [muteBusy, setMuteBusy] = React.useState(false);
  const [muteError, setMuteError] = React.useState<string | null>(null);
  const {
    items,
    unreadCount,
    filters,
    setFilters,
    markRead,
    markUnread,
    markAllRead,
    save,
    snooze,
    clear,
    clearAll,
  } = useInAppNotifications({
    enabled: true,
    pollVisibleMs: 60000,
    pollHiddenMs: 180000,
    pollPanelOpenMs: 15000,
    limit: 100,
    initialFilters: { status: 'all' },
  });

  React.useEffect(() => {
    setFilters({
      ...filters,
      status: statusTab,
    });
  }, [statusTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProjectMutes = React.useCallback(async () => {
    try {
      const rows = await authApi.listNotificationProjectMutes();
      setProjectMutes(rows);
      setMuteError(null);
    } catch (err: any) {
      setMuteError(err?.message || 'Failed to load project mutes');
    }
  }, []);

  React.useEffect(() => {
    void loadProjectMutes();
  }, [loadProjectMutes]);

  const saveProjectMute = async () => {
    const projectId = Number(projectIdInput || 0);
    if (!projectId || !Number.isFinite(projectId)) {
      setMuteError('Project ID is required.');
      return;
    }
    setMuteBusy(true);
    setMuteError(null);
    try {
      await authApi.upsertNotificationProjectMute({
        projectId,
        mobilePushMutedUntil: toIsoOrNull(mutePushUntil),
        emailMutedUntil: toIsoOrNull(muteEmailUntil),
        inBrowserMutedUntil: toIsoOrNull(muteBrowserUntil),
      });
      setProjectIdInput('');
      setMutePushUntil('');
      setMuteEmailUntil('');
      setMuteBrowserUntil('');
      await loadProjectMutes();
    } catch (err: any) {
      setMuteError(err?.message || 'Failed to save project mute');
    } finally {
      setMuteBusy(false);
    }
  };

  return (
    <Layout>
      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">Notifications</h1>
            <p className="text-sm text-[var(--muted)]">Unread: {unreadCount}</p>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            <div className="flex items-center gap-2 flex-wrap">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`px-3 py-1 rounded text-sm border ${
                    statusTab === tab.key
                      ? 'border-[var(--text)] text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--muted)]'
                  }`}
                  onClick={() => setStatusTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <Button onClick={() => void markAllRead()} disabled={unreadCount <= 0}>Mark All Read</Button>
                <Button onClick={() => void clearAll({ includeRead: statusTab !== 'unread' })}>Clear All</Button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {!items.length ? (
                <div className="text-sm text-[var(--muted)]">No notifications in this view.</div>
              ) : items.map((item) => (
                <div key={item.id} className="border border-[var(--border)] rounded p-3">
                  <div className="text-sm text-[var(--text)] font-semibold">{item.title}</div>
                  {item.body ? <div className="text-sm text-[var(--muted)] mt-1">{item.body}</div> : null}
                  <div className="text-xs text-[var(--muted)] mt-1">{new Date(item.createdAt).toLocaleString()}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button onClick={() => void (item.readAt ? markUnread([item.id]) : markRead([item.id]))}>
                      {item.readAt ? 'Mark Unread' : 'Mark Read'}
                    </Button>
                    <Button onClick={() => void save([item.id], !item.isSaved)}>
                      {item.isSaved ? 'Unsave' : 'Save'}
                    </Button>
                    <Button onClick={() => void snooze([item.id], new Date(Date.now() + 60 * 60 * 1000).toISOString())}>
                      Snooze 1 Hour
                    </Button>
                    <Button onClick={() => void clear([item.id])}>Clear</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            <h2 className="text-lg font-semibold text-[var(--text)]">Project Notification Mutes</h2>
            <p className="text-xs text-[var(--muted)] mt-1">Mute notification channels per project until a selected time.</p>
            {muteError ? <div className="text-sm text-red-400 mt-2">{muteError}</div> : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Input
                label="Project ID"
                type="number"
                value={projectIdInput}
                onChange={(e) => setProjectIdInput((e.target as HTMLInputElement).value)}
              />
              <div />
              <Input
                label="Mobile Push Mute Until"
                type="datetime-local"
                value={mutePushUntil}
                onChange={(e) => setMutePushUntil((e.target as HTMLInputElement).value)}
              />
              <Input
                label="Email Mute Until"
                type="datetime-local"
                value={muteEmailUntil}
                onChange={(e) => setMuteEmailUntil((e.target as HTMLInputElement).value)}
              />
              <Input
                label="In Browser Mute Until"
                type="datetime-local"
                value={muteBrowserUntil}
                onChange={(e) => setMuteBrowserUntil((e.target as HTMLInputElement).value)}
              />
              <div className="flex items-end">
                <Button onClick={saveProjectMute} disabled={muteBusy}>
                  {muteBusy ? 'Saving…' : 'Save Project Mute'}
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {projectMutes.length === 0 ? (
                <div className="text-sm text-[var(--muted)]">No project mutes configured.</div>
              ) : projectMutes.map((mute) => (
                <div key={mute.id} className="flex items-center justify-between gap-3 border border-[var(--border)] rounded p-2">
                  <div className="text-sm text-[var(--text)]">
                    Project {mute.projectId}{mute.projectName ? ` - ${mute.projectName}` : ''}<br />
                    <span className="text-xs text-[var(--muted)]">
                      Push: {mute.mobilePushMutedUntil ? new Date(mute.mobilePushMutedUntil).toLocaleString() : 'not muted'} | Email: {mute.emailMutedUntil ? new Date(mute.emailMutedUntil).toLocaleString() : 'not muted'} | Browser: {mute.inBrowserMutedUntil ? new Date(mute.inBrowserMutedUntil).toLocaleString() : 'not muted'}
                    </span>
                  </div>
                  <Button onClick={() => void authApi.deleteNotificationProjectMute(mute.id).then(loadProjectMutes)}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default NotificationsPage;
