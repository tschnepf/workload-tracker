import * as React from 'react';
import ReactGridLayout, {
  getCompactor,
  noCompactor,
  useContainerWidth,
  type Layout,
  type ResizeHandleAxis,
} from 'react-grid-layout';
import { GridBackground } from 'react-grid-layout/extras';
import { getFlag } from '@/lib/flags';
import DashboardCardShell from './DashboardCardShell';
import DashboardToolbar from './DashboardToolbar';
import {
  type DashboardCardDefinition,
  type DashboardSurfaceId,
  type DashboardSurfaceLayout,
} from './dashboardLayoutTypes';
import {
  emitDashboardTelemetry,
  resolveUnitColumnCount,
  resolveUnitColumnCountWithHysteresis,
  widgetsToActiveLayout,
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

const ROW_HEIGHT = 176;
const MARGIN: [number, number] = [16, 16];
const CONTAINER_PADDING: [number, number] = [0, 0];

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
  const rglEnabled = getFlag('FF_DASHBOARD_RGL', true);

  const {
    unlocked,
    rearrangeEnabled,
    setUnlocked,
    resetLayout,
    applyActiveLayout,
    getWidgetsForCols,
  } = useDashboardLayoutState({
    surfaceId,
    cardIds,
    defaultLayout,
  });

  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1280 });
  const [stableCols, setStableCols] = React.useState<2 | 4 | 6 | 8 | 10>(() => resolveUnitColumnCount(width));
  React.useEffect(() => {
    setStableCols((prev) => resolveUnitColumnCountWithHysteresis(width, prev));
  }, [width]);
  const activeCols = rearrangeEnabled ? stableCols : 2;
  const forceFullWidth = !rearrangeEnabled;

  const widgetsForCols = React.useMemo(
    () => getWidgetsForCols(activeCols),
    [activeCols, getWidgetsForCols]
  );
  const projectedLayout = React.useMemo(
    () => widgetsToActiveLayout(widgetsForCols, activeCols, forceFullWidth),
    [widgetsForCols, activeCols, forceFullWidth]
  );
  const cardIdByWidgetId = React.useMemo(
    () => new Map(widgetsForCols.map((widget) => [widget.i, widget.cardId])),
    [widgetsForCols]
  );

  const [draftLayout, setDraftLayout] = React.useState<Layout>(projectedLayout);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState('');
  const [announcementKey, setAnnouncementKey] = React.useState(0);

  React.useEffect(() => {
    setDraftLayout(projectedLayout);
  }, [projectedLayout]);

  const announce = React.useCallback((message: string) => {
    setAnnouncement(message);
    setAnnouncementKey((prev) => prev + 1);
  }, []);

  const handleToggleUnlock = React.useCallback(() => {
    setUnlocked((prev) => !prev);
  }, [setUnlocked]);

  const handleReset = React.useCallback(() => {
    resetLayout();
    announce('Dashboard layout was reset to default.');
  }, [announce, resetLayout]);

  const editEnabled = rglEnabled && unlocked && rearrangeEnabled;
  const previewDragCompactor = React.useMemo(() => getCompactor(null, true, false), []);
  const settledCompactor = React.useMemo(() => noCompactor, []);
  const activeCompactor = draggingId ? previewDragCompactor : settledCompactor;

  const resizeHandle = React.useCallback((axis: ResizeHandleAxis, ref: React.Ref<HTMLElement>) => {
    if (axis !== 'se') return null;
    return (
      <span
        ref={ref}
        className="dashboard-resize-handle absolute bottom-1.5 right-1.5 z-30 inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
        data-no-drag="true"
        aria-hidden="true"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 14h8M9 11h5M12 8h2" />
        </svg>
      </span>
    );
  }, []);

  const widgetRows = React.useMemo(
    () => Math.max(6, ...draftLayout.map((item) => item.y + item.h)),
    [draftLayout]
  );
  const controlledLayout = editEnabled ? draftLayout : projectedLayout;

  const renderWidgetContent = React.useCallback((widgetId: string) => {
    const card = cardById.get(widgetId);
    if (!card) {
      return (
        <div className="h-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
          Missing card: {widgetId}
        </div>
      );
    }
    return card.render({ inGroup: false });
  }, [cardById]);
  const labelForWidgetId = React.useCallback((widgetId: string) => {
    const cardId = cardIdByWidgetId.get(widgetId) || widgetId;
    return cardById.get(cardId)?.title || cardId;
  }, [cardById, cardIdByWidgetId]);

  const isLegacyStaticPath = !rglEnabled;

  return (
    <div className={className}>
      <DashboardToolbar
        unlocked={unlocked}
        canUnlock={rearrangeEnabled && rglEnabled}
        onToggleUnlock={handleToggleUnlock}
        onResetLayout={handleReset}
      />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={announcementKey}>{announcement}</span>
      </div>

      <div ref={containerRef} className="relative" aria-label={ariaLabel}>
        {editEnabled && mounted ? (
          <GridBackground
            width={width}
            cols={activeCols}
            rowHeight={ROW_HEIGHT}
            margin={MARGIN}
            containerPadding={CONTAINER_PADDING}
            rows={widgetRows}
            color="rgba(148,163,184,0.12)"
            borderRadius={2}
          />
        ) : null}

        {isLegacyStaticPath ? (
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${activeCols}, minmax(0, 1fr))`,
              gridAutoRows: `${ROW_HEIGHT}px`,
            }}
          >
            {draftLayout.map((item) => (
              <div
                key={item.i}
                style={{
                  gridColumn: `span ${Math.max(1, Math.min(activeCols, item.w))} / span ${Math.max(1, Math.min(activeCols, item.w))}`,
                  gridRow: `span ${Math.max(1, item.h)} / span ${Math.max(1, item.h)}`,
                }}
              >
                <DashboardCardShell
                  itemId={item.i}
                  unlocked={false}
                  disableContentInteractionWhenUnlocked={disableContentInteractionWhenUnlocked}
                >
                  {renderWidgetContent(cardIdByWidgetId.get(item.i) || item.i)}
                </DashboardCardShell>
              </div>
            ))}
          </div>
        ) : (
          <ReactGridLayout
            width={width}
            layout={controlledLayout}
            gridConfig={{
              cols: activeCols,
              rowHeight: ROW_HEIGHT,
              margin: MARGIN,
              containerPadding: CONTAINER_PADDING,
            }}
            dragConfig={{
              enabled: editEnabled,
              handle: '.dashboard-drag-handle',
              cancel: '.dashboard-resize-handle,[data-no-drag=true]',
              threshold: 4,
              bounded: false,
            }}
            resizeConfig={{
              enabled: editEnabled,
              handles: ['se'],
              handleComponent: resizeHandle,
            }}
            compactor={activeCompactor}
            autoSize
            className="dashboard-rgl"
            onLayoutChange={(nextLayout) => {
              if (editEnabled) {
                setDraftLayout(nextLayout);
              }
            }}
            onDragStart={(_nextLayout, oldItem) => {
              emitDashboardTelemetry('drag_start');
              setDraggingId(oldItem?.i || null);
            }}
            onDragStop={(nextLayout, oldItem, newItem) => {
              setDraggingId(null);
              setDraftLayout(nextLayout);
              applyActiveLayout(nextLayout, activeCols);
              emitDashboardTelemetry('drag_stop_success');
              if (newItem) {
                announce(`${labelForWidgetId(newItem.i)} moved.`);
              } else if (oldItem) {
                announce(`${labelForWidgetId(oldItem.i)} moved.`);
              }
            }}
            onResizeStop={(nextLayout, _oldItem, newItem) => {
              setDraftLayout(nextLayout);
              applyActiveLayout(nextLayout, activeCols);
              emitDashboardTelemetry('resize_stop_success');
              if (newItem) {
                announce(`${labelForWidgetId(newItem.i)} resized to ${newItem.w}x${newItem.h}.`);
              }
            }}
          >
            {widgetsForCols.map((widget) => (
              <div key={widget.i} className="min-h-0">
                <DashboardCardShell
                  itemId={widget.i}
                  unlocked={editEnabled}
                  dragging={draggingId === widget.i}
                  disableContentInteractionWhenUnlocked={disableContentInteractionWhenUnlocked}
                >
                  {renderWidgetContent(widget.cardId)}
                </DashboardCardShell>
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>
    </div>
  );
};

export default DashboardSurface;
