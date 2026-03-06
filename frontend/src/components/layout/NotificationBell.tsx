import React from 'react';
import { useNavigate } from 'react-router';
import { useInAppNotifications } from '@/hooks/useInAppNotifications';
import type { InAppNotificationItem, InAppNotificationStatusFilter } from '@/services/api';

const TABS: Array<{ key: InAppNotificationStatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'saved', label: 'Saved' },
  { key: 'snoozed', label: 'Snoozed' },
  { key: 'read', label: 'Read' },
];

const NotificationBell: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [statusTab, setStatusTab] = React.useState<InAppNotificationStatusFilter>('all');
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const {
    items,
    unreadCount,
    loading,
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
    enabled,
    panelOpen: open,
    pollVisibleMs: 60000,
    pollHiddenMs: 180000,
    pollPanelOpenMs: 15000,
    limit: 50,
    initialFilters: { status: 'all' },
  });

  React.useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  React.useEffect(() => {
    setFilters({
      ...filters,
      status: statusTab,
    });
  }, [statusTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNotification = async (item: InAppNotificationItem) => {
    try {
      if (!item.readAt) await markRead([item.id], true);
    } catch {
      // non-blocking
    }
    setOpen(false);
    const target = String(item.url || '/').trim() || '/';
    if (/^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(target);
  };

  const clearAllCurrent = async () => {
    await clearAll({
      eventKey: filters.eventKey,
      projectId: filters.projectId ?? undefined,
      includeRead: statusTab !== 'unread',
    });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surfaceHover)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
          <path d="M9 17a3 3 0 0 0 6 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-[420px] max-w-[95vw] rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <div className="text-sm font-semibold text-[var(--text)]">Notifications</div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
                onClick={() => { void markAllRead(); }}
                disabled={loading || unreadCount <= 0}
              >
                Mark all read
              </button>
              <button
                type="button"
                className="text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
                onClick={() => { void clearAllCurrent(); }}
                disabled={loading || items.length <= 0}
              >
                Clear all
              </button>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-theme">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`px-2 py-1 rounded text-xs border ${
                    statusTab === tab.key
                      ? 'border-[var(--text)] text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--muted)]'
                  }`}
                  onClick={() => setStatusTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-xs text-[var(--muted)] hover:text-[var(--text)] whitespace-nowrap"
              onClick={() => {
                setOpen(false);
                navigate('/notifications');
              }}
            >
              View all
            </button>
          </div>

          <div className="max-h-[480px] overflow-y-auto scrollbar-theme">
            {!items.length ? (
              <div className="px-3 py-4 text-sm text-[var(--muted)]">No notifications in this view.</div>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id} className="border-b border-[var(--border)] last:border-b-0">
                    <div className="px-3 py-2">
                      <button
                        type="button"
                        className={`text-left w-full ${item.readAt ? 'opacity-80' : ''}`}
                        onClick={() => { void openNotification(item); }}
                      >
                        <div className="text-sm text-[var(--text)] font-medium">{item.title}</div>
                        {item.body ? <div className="text-xs text-[var(--muted)] mt-0.5">{item.body}</div> : null}
                        <div className="text-[11px] text-[var(--muted)] mt-1">{new Date(item.createdAt).toLocaleString()}</div>
                      </button>
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          type="button"
                          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void (item.readAt ? markUnread([item.id]) : markRead([item.id], false));
                          }}
                        >
                          {item.readAt ? 'Mark unread' : 'Mark read'}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void save([item.id], !item.isSaved);
                          }}
                        >
                          {item.isSaved ? 'Unsave' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                            void snooze([item.id], until);
                          }}
                        >
                          Snooze 1h
                        </button>
                        <button
                          type="button"
                          className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void clear([item.id]);
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NotificationBell;
