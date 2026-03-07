import * as React from 'react';

type Props = {
  itemId: string;
  children: React.ReactNode;
  unlocked: boolean;
  dragging?: boolean;
  disableContentInteractionWhenUnlocked?: boolean;
};

const DashboardCardShell: React.FC<Props> = ({
  itemId,
  children,
  unlocked,
  dragging = false,
  disableContentInteractionWhenUnlocked = true,
}) => {
  return (
    <div
      className={`relative h-full min-h-0 ${dragging ? 'z-20 opacity-95' : ''}`}
      data-dashboard-item-id={itemId}
    >
      {unlocked ? (
        <div className="pointer-events-auto absolute left-2 right-2 top-2 z-30 flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--card)]/95 px-2 py-1 shadow">
          <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Edit mode</span>
          <button
            type="button"
            className="dashboard-drag-handle inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
            aria-label="Drag card"
            title="Drag to reposition"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="5" r="1" />
              <circle cx="5" cy="10" r="1" />
              <circle cx="5" cy="15" r="1" />
              <circle cx="10" cy="5" r="1" />
              <circle cx="10" cy="10" r="1" />
              <circle cx="10" cy="15" r="1" />
            </svg>
            Move
          </button>
        </div>
      ) : null}

      <div
        className={`h-full min-h-0 ${unlocked && disableContentInteractionWhenUnlocked ? 'pointer-events-none' : ''}`}
      >
        {children}
      </div>
    </div>
  );
};

export default DashboardCardShell;
