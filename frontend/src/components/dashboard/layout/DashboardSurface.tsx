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
  type DashboardCardDefinition,
  type DashboardLayoutItem,
  type DashboardSurfaceId,
  type DashboardSurfaceLayout,
  dashboardItemId,
  parseDashboardItemId,
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
};

const SortableItem: React.FC<SortableItemProps> = ({
  item,
  unlocked,
  selected,
  onToggleSelected,
  renderContent,
  disableContentInteractionWhenUnlocked,
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
    <div ref={setNodeRef} className="min-h-0">
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
  } = useDashboardLayoutState({
    surfaceId,
    cardIds,
    defaultLayout,
  });

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { width } = useContainerWidth(containerRef);
  const columnCount = rearrangeEnabled ? resolveColumnCount(width) : 1;
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
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          ['--dashboard-card-height' as any]: '22rem',
        }}
        aria-label={ariaLabel}
      >
        {unlocked && rearrangeEnabled ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={itemKeys} strategy={rectSortingStrategy}>
              {layout.items.map((item) => {
                const itemId = dashboardItemId(item);
                return (
                  <SortableItem
                    key={itemId}
                    item={item}
                    unlocked={unlocked}
                    selected={selectedItemIds.includes(itemId)}
                    onToggleSelected={() => toggleSelected(itemId)}
                    renderContent={renderItemContent}
                    disableContentInteractionWhenUnlocked={disableContentInteractionWhenUnlocked}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        ) : (
          layout.items.map((item) => {
            const itemId = dashboardItemId(item);
            return (
              <DashboardCardShell
                key={itemId}
                itemId={itemId}
                unlocked={false}
                selected={false}
                onToggleSelected={() => {}}
              >
                {renderItemContent(item)}
              </DashboardCardShell>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DashboardSurface;
