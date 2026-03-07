import * as React from 'react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { DashboardItemSize } from './dashboardLayoutTypes';

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
  itemSize?: DashboardItemSize;
  resizeEnabled?: boolean;
  resizeStepWidthPx?: number;
  resizeStepHeightPx?: number;
  maxWidthUnits?: number;
  maxHeightUnits?: number;
  onSetItemSize?: (size: DashboardItemSize) => void;
  onResizeCommit?: (size: DashboardItemSize) => void;
};

function clampUnit(value: number, min: number, max: number): 1 | 2 | 3 | 4 {
  const next = Math.max(min, Math.min(max, Math.round(value)));
  return Math.max(1, Math.min(4, next)) as 1 | 2 | 3 | 4;
}

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
  itemSize,
  resizeEnabled = false,
  resizeStepWidthPx = 1,
  resizeStepHeightPx = 1,
  maxWidthUnits = 4,
  maxHeightUnits = 4,
  onSetItemSize,
  onResizeCommit,
}) => {
  const [isResizing, setIsResizing] = React.useState(false);
  const startRef = React.useRef<{ x: number; y: number; size: DashboardItemSize } | null>(null);
  const latestSizeRef = React.useRef<DashboardItemSize | null>(itemSize ?? null);

  React.useEffect(() => {
    latestSizeRef.current = itemSize ?? null;
  }, [itemSize]);

  const showResizeHandle = unlocked && resizeEnabled && !!itemSize && !!onSetItemSize;

  React.useEffect(() => {
    if (!isResizing) return;

    const onMove = (event: PointerEvent) => {
      if (!startRef.current || !itemSize || !onSetItemSize) return;
      const start = startRef.current;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;

      const nextW = clampUnit(
        start.size.w + (deltaX / Math.max(1, resizeStepWidthPx)),
        1,
        Math.max(1, Math.min(4, maxWidthUnits))
      );
      const nextH = clampUnit(
        start.size.h + (deltaY / Math.max(1, resizeStepHeightPx)),
        1,
        Math.max(1, Math.min(4, maxHeightUnits))
      );

      const previous = latestSizeRef.current;
      if (previous && previous.w === nextW && previous.h === nextH) return;

      const next = { w: nextW, h: nextH };
      latestSizeRef.current = next;
      onSetItemSize(next);
    };

    const onUp = () => {
      setIsResizing(false);
      startRef.current = null;
      if (latestSizeRef.current && onResizeCommit) {
        onResizeCommit(latestSizeRef.current);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isResizing, itemSize, maxHeightUnits, maxWidthUnits, onResizeCommit, onSetItemSize, resizeStepHeightPx, resizeStepWidthPx]);

  return (
    <div
      className={`relative min-h-0 h-full ${dragging ? 'z-20 opacity-90' : ''} ${isResizing ? 'ring-2 ring-[var(--primary)] ring-offset-2 ring-offset-[var(--surface)]' : ''}`}
      style={style}
      data-dashboard-item-id={itemId}
    >
      {unlocked ? (
        <div className="pointer-events-auto absolute left-2 right-2 top-2 z-30 flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)]/95 px-2 py-1 shadow">
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

      {showResizeHandle ? (
        <button
          type="button"
          aria-label="Resize card"
          title="Drag to resize"
          className="pointer-events-auto absolute bottom-2 right-2 z-30 h-6 w-6 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]"
          onPointerDown={(event) => {
            if (!itemSize || !onSetItemSize) return;
            event.preventDefault();
            event.stopPropagation();
            startRef.current = { x: event.clientX, y: event.clientY, size: itemSize };
            latestSizeRef.current = itemSize;
            setIsResizing(true);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M6 14h8M9 11h5M12 8h2" />
          </svg>
        </button>
      ) : null}

      <div className={`h-full min-h-0 ${unlocked && disableContentInteractionWhenUnlocked ? 'pointer-events-none' : ''}`}>
        {children}
      </div>
    </div>
  );
};

export default DashboardCardShell;
