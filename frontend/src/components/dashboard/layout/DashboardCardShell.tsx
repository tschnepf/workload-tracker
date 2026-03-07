import * as React from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';

type Props = {
  itemId: string;
  children: React.ReactNode;
  unlocked: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: Record<string, Function | undefined>;
  dragging?: boolean;
  style?: React.CSSProperties;
  disableContentInteractionWhenUnlocked?: boolean;
};

const DashboardCardShell: React.FC<Props> = ({
  itemId,
  children,
  unlocked,
  selected,
  onToggleSelected,
  dragAttributes,
  dragListeners,
  dragging = false,
  style,
  disableContentInteractionWhenUnlocked = true,
}) => {
  return (
    <div
      className={`relative min-h-0 h-[var(--dashboard-card-height)] ${dragging ? 'z-20 opacity-90' : ''}`}
      style={style}
      data-dashboard-item-id={itemId}
    >
      {unlocked ? (
        <div className="pointer-events-auto absolute right-2 top-2 z-30 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)]/95 px-2 py-1 shadow">
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text)]">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              aria-label="Select card"
              className="h-3.5 w-3.5"
            />
            Select
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
            aria-label="Drag card"
            title="Drag to reorder"
            {...dragAttributes}
            {...dragListeners}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="5" r="1"/>
              <circle cx="5" cy="10" r="1"/>
              <circle cx="5" cy="15" r="1"/>
              <circle cx="10" cy="5" r="1"/>
              <circle cx="10" cy="10" r="1"/>
              <circle cx="10" cy="15" r="1"/>
            </svg>
            Drag
          </button>
        </div>
      ) : null}

      <div className={`h-full min-h-0 ${unlocked && disableContentInteractionWhenUnlocked ? 'pointer-events-none' : ''}`}>
        {children}
      </div>
    </div>
  );
};

export default DashboardCardShell;
