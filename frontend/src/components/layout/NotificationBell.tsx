import React from 'react';
import { useNavigate } from 'react-router';
import { useInAppNotifications } from '@/hooks/useInAppNotifications';
import type { InAppNotificationItem } from '@/services/api';

const NotificationBell: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const {
    items,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    clear,
  } = useInAppNotifications({ enabled, pollMs: 60000, limit: 50 });

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

  const openNotification = async (item: InAppNotificationItem) => {
    try {
      if (!item.readAt) await markRead([item.id]);
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

  const clearAll = async () => {
    const allIds = items
      .map((item) => Number(item.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (!allIds.length) return;
    await clear(allIds);
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
        <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-lg z-50">
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
                onClick={() => { void clearAll(); }}
                disabled={loading || items.length <= 0}
              >
                Clear all
              </button>
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto scrollbar-theme">
            {!items.length ? (
              <div className="px-3 py-4 text-sm text-[var(--muted)]">No recent notifications.</div>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id} className="border-b border-[var(--border)] last:border-b-0">
                    <div className="flex items-start gap-2 px-3 py-2">
                      <button
                        type="button"
                        className={`text-left flex-1 ${item.readAt ? 'opacity-80' : ''}`}
                        onClick={() => { void openNotification(item); }}
                      >
                        <div className="text-sm text-[var(--text)] font-medium">{item.title}</div>
                        {item.body ? <div className="text-xs text-[var(--muted)] mt-0.5">{item.body}</div> : null}
                        <div className="text-[11px] text-[var(--muted)] mt-1">{new Date(item.createdAt).toLocaleString()}</div>
                      </button>
                      <button
                        type="button"
                        className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void clear([item.id]);
                        }}
                        aria-label="Clear notification"
                        title="Clear"
                      >
                        Clear
                      </button>
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
