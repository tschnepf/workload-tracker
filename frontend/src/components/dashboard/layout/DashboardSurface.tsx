import * as React from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import DashboardCardShell from './DashboardCardShell';
import DashboardToolbar from './DashboardToolbar';
import DashboardGroupCard from './DashboardGroupCard';
import {
  DASHBOARD_MEDIUM_ITEM_SIZE,
  type DashboardCardDefinition,
  type DashboardLayoutItem,
  type DashboardSurfaceId,
  type DashboardSurfaceLayout,
  dashboardItemId,
  parseDashboardItemId,
  sizeStepToUnits,
} from './dashboardLayoutTypes';
import {
  resolveColumnCount,
  useDashboardLayoutState,
} from './dashboardLayoutState';

type Props = {
  surfaceId: DashboardSurfaceId;
  cards: DashboardCardDefinition[];
  defaultLayout: DashboardSurfaceLayout;
  className?: string;
  ariaLabel?: string;
  disableContentInteractionWhenUnlocked?: boolean;
};

type SortableItemProps = {
  item: DashboardLayoutItem;
  unlocked: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  renderContent: (item: DashboardLayoutItem) => React.ReactNode;
  disableContentInteractionWhenUnlocked?: boolean;
  gridStyle: React.CSSProperties;
  itemSize: { w: 1 | 2 | 3 | 4; h: 1 | 2 | 3 | 4 };
  resizeEnabled: boolean;
  resizeStepWidthPx: number;
  resizeStepHeightPx: number;
  maxWidthUnits: number;
  maxHeightUnits: number;
  onSetItemSize: (size: { w: 1 | 2 | 3 | 4; h: 1 | 2 | 3 | 4 }) => void;
  onResizeCommit: (size: { w: 1 | 2 | 3 | 4; h: 1 | 2 | 3 | 4 }) => void;
};

const SortableItem: React.FC<SortableItemProps> = ({
  item,
  unlocked,
  selected,
  onToggleSelected,
  renderContent,
  disableContentInteractionWhenUnlocked,
  gridStyle,
  itemSize,
  resizeEnabled,
  resizeStepWidthPx,
  resizeStepHeightPx,
  maxWidthUnits,
  maxHeightUnits,
  onSetItemSize,
  onResizeCommit,
}) => {
  const itemKey = dashboardItemId(item);
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemKey, disabled: !unlocked });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} className="min-h-0" style={gridStyle}>
      <DashboardCardShell
        itemId={itemKey}
        unlocked={unlocked}
        selected={selected}
        onToggleSelected={onToggleSelected}
        dragAttributes={attributes}
        dragListeners={listeners}
        dragging={isDragging}
        style={style}
        disableContentInteractionWhenUnlocked={disableContentInteractionWhenUnlocked}
        itemSize={itemSize}
        resizeEnabled={resizeEnabled}
        resizeStepWidthPx={resizeStepWidthPx}
        resizeStepHeightPx={resizeStepHeightPx}
        maxWidthUnits={maxWidthUnits}
        maxHeightUnits={maxHeightUnits}
        onSetItemSize={onSetItemSize}
        onResizeCommit={onResizeCommit}
      >
        {renderContent(item)}
      </DashboardCardShell>
    </div>
  );
};

const DashboardSurface: React.FC<Props> = ({
  surfaceId,
  cards,
  defaultLayout,
  className,
  ariaLabel = 'Dashboard cards',
  disableContentInteractionWhenUnlocked = true,
}) => {
  const cardIds = React.useMemo(() => cards.map((card) => card.id), [cards]);
  const cardById = React.useMemo(
    () => new Map(cards.map((card) => [card.id, card])),
    [cards]
  );

  const {
    layout,
    unlocked,
    rearrangeEnabled,
    selectedItemIds,
    setUnlocked,
    toggleSelected,
    clearSelection,
    groupSelected,
    splitSelected,
    resetLayout,
    reorder,
    setItemSize,
  } = useDashboardLayoutState({
    surfaceId,
    cardIds,
    defaultLayout,
  });

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { width } = useContainerWidth(containerRef);
  const visualColumnCount = rearrangeEnabled ? resolveColumnCount(width) : 1;
  const unitColumns = Math.max(1, visualColumnCount * 2);
  const maxResizableWidthUnits = Math.max(1, Math.min(4, unitColumns));

  const gridGapPx = 16;
  const rootFontPx = React.useMemo(() => {
    if (typeof window === 'undefined') return 16;
    const parsed = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize || '16');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
  }, []);
  const rowHeightPx = 11 * rootFontPx;
  const unitTrackWidthPx = React.useMemo(() => {
    if (!width || unitColumns <= 0) return 1;
    const available = width - (gridGapPx * Math.max(0, unitColumns - 1));
    return Math.max(1, available / unitColumns);
  }, [gridGapPx, unitColumns, width]);

  const resizeStepWidthPx = unitTrackWidthPx + gridGapPx;
  const resizeStepHeightPx = rowHeightPx + gridGapPx;

  const [announcement, setAnnouncement] = React.useState('');
  const [announcementKey, setAnnouncementKey] = React.useState(0);

  const announce = React.useCallback((message: string) => {
    setAnnouncement(message);
    setAnnouncementKey((prev) => prev + 1);
  }, []);

  const itemKeys = React.useMemo(
    () => layout.items.map((item) => dashboardItemId(item)),
    [layout.items]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const labelForItemId = React.useCallback((itemId: string): string => {
    const parsed = parseDashboardItemId(itemId);
    if (!parsed) return 'Item';
    if (parsed.type === 'card') {
      return cardById.get(parsed.cardId)?.title || parsed.cardId;
    }
    return layout.groups[parsed.groupId]?.title || parsed.groupId;
  }, [cardById, layout.groups]);

  const sizeForItemId = React.useCallback((itemId: string) => {
    const parsed = parseDashboardItemId(itemId);
    if (!parsed) return DASHBOARD_MEDIUM_ITEM_SIZE;
    if (parsed.type === 'card') {
      return layout.cardSizes[parsed.cardId] || DASHBOARD_MEDIUM_ITEM_SIZE;
    }
    return layout.groupSizes[parsed.groupId] || DASHBOARD_MEDIUM_ITEM_SIZE;
  }, [layout.cardSizes, layout.groupSizes]);

  const itemGridStyleForId = React.useCallback((itemId: string): React.CSSProperties => {
    const itemSize = sizeForItemId(itemId);
    const rowSpan = Math.max(1, Math.min(4, sizeStepToUnits(itemSize.h)));
    const desiredColSpan = Math.max(1, Math.min(4, sizeStepToUnits(itemSize.w)));
    const colSpan = rearrangeEnabled
      ? Math.max(1, Math.min(unitColumns, desiredColSpan))
      : unitColumns;

    return {
      gridColumn: `span ${colSpan} / span ${colSpan}`,
      gridRow: `span ${rowSpan} / span ${rowSpan}`,
    };
  }, [rearrangeEnabled, sizeForItemId, unitColumns]);

  const canSplitSelected = React.useMemo(
    () => selectedItemIds.some((itemId) => {
      const parsed = parseDashboardItemId(itemId);
      return parsed?.type === 'group' && Boolean(layout.groups[parsed.groupId]);
    }),
    [layout.groups, selectedItemIds]
  );

  const handleDragEnd = React.useCallback((event: DragEndEvent) => {
    const activeId = String(event.active?.id || '');
    const overId = String(event.over?.id || '');
    if (!activeId || !overId || activeId === overId) return;
    const activeLabel = labelForItemId(activeId);
    const overLabel = labelForItemId(overId);
    reorder(activeId, overId);
    announce(`${activeLabel} moved near ${overLabel}.`);
  }, [announce, labelForItemId, reorder]);

  const handleToggleUnlock = React.useCallback(() => {
    setUnlocked((prev) => {
      const next = !prev;
      if (!next) clearSelection();
      return next;
    });
  }, [clearSelection, setUnlocked]);

  const renderItemContent = React.useCallback((item: DashboardLayoutItem) => {
    if (item.type === 'card') {
      const card = cardById.get(item.cardId);
      if (!card) {
        return (
          <div className="h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
            Missing card: {item.cardId}
          </div>
        );
      }
      return card.render({ inGroup: false });
    }

    const group = layout.groups[item.groupId];
    if (!group) {
      return (
        <div className="h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
          Missing group: {item.groupId}
        </div>
      );
    }

    return (
      <DashboardGroupCard
        title={group.title}
        cardIds={group.cardIds}
        cardTitleForId={(cardId) => cardById.get(cardId)?.title || cardId}
        renderPreview={(cardId) => {
          const card = cardById.get(cardId);
          if (!card) return 'Unavailable';
          return card.renderPreview ? card.renderPreview() : 'Preview unavailable';
        }}
      />
    );
  }, [cardById, layout.groups]);

  const editGridBackgroundStyle: React.CSSProperties = unlocked && rearrangeEnabled
    ? {
      backgroundImage: 'repeating-linear-gradient(to right, rgba(148,163,184,0.25) 0, rgba(148,163,184,0.25) 1px, transparent 1px, transparent var(--dashboard-grid-unit-width)), repeating-linear-gradient(to bottom, rgba(148,163,184,0.25) 0, rgba(148,163,184,0.25) 1px, transparent 1px, transparent var(--dashboard-grid-unit-height))',
      ['--dashboard-grid-unit-width' as never]: `${resizeStepWidthPx}px`,
      ['--dashboard-grid-unit-height' as never]: `${resizeStepHeightPx}px`,
      backgroundOrigin: 'content-box',
    }
    : {};

  return (
    <div className={className}>
      <DashboardToolbar
        unlocked={unlocked}
        canUnlock={rearrangeEnabled}
        selectedCount={selectedItemIds.length}
        canSplitSelected={canSplitSelected}
        onToggleUnlock={handleToggleUnlock}
        onGroupSelected={() => {
          groupSelected();
          clearSelection();
          announce('Selected items were grouped.');
        }}
        onSplitSelected={() => {
          splitSelected();
          clearSelection();
          announce('Selected groups were split into cards.');
        }}
        onResetLayout={() => {
          resetLayout();
          clearSelection();
          announce('Dashboard layout was reset to default.');
        }}
      />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={announcementKey}>{announcement}</span>
      </div>

      <div
        ref={containerRef}
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${unitColumns}, minmax(0, 1fr))`,
          gridAutoRows: 'var(--dashboard-grid-row-height)',
          ['--dashboard-grid-row-height' as never]: '11rem',
          ...editGridBackgroundStyle,
        }}
        aria-label={ariaLabel}
      >
        {unlocked && rearrangeEnabled ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itemKeys} strategy={rectSortingStrategy}>
              {layout.items.map((item) => {
                const itemId = dashboardItemId(item);
                const itemSize = sizeForItemId(itemId);
                return (
                  <SortableItem
                    key={itemId}
                    item={item}
                    unlocked={unlocked}
                    selected={selectedItemIds.includes(itemId)}
                    onToggleSelected={() => toggleSelected(itemId)}
                    renderContent={renderItemContent}
                    disableContentInteractionWhenUnlocked={disableContentInteractionWhenUnlocked}
                    gridStyle={itemGridStyleForId(itemId)}
                    itemSize={itemSize}
                    resizeEnabled={rearrangeEnabled}
                    resizeStepWidthPx={resizeStepWidthPx}
                    resizeStepHeightPx={resizeStepHeightPx}
                    maxWidthUnits={maxResizableWidthUnits}
                    maxHeightUnits={4}
                    onSetItemSize={(size) => setItemSize(itemId, size)}
                    onResizeCommit={(size) => {
                      announce(`${labelForItemId(itemId)} resized to ${size.w}x${size.h}.`);
                    }}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        ) : (
          layout.items.map((item) => {
            const itemId = dashboardItemId(item);
            return (
              <div key={itemId} className="min-h-0" style={itemGridStyleForId(itemId)}>
                <DashboardCardShell
                  itemId={itemId}
                  unlocked={false}
                  selected={false}
                  onToggleSelected={() => {}}
                >
                  {renderItemContent(item)}
                </DashboardCardShell>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DashboardSurface;
