import * as React from 'react';
import type { Layout } from 'react-grid-layout';
import { useAuth } from '@/hooks/useAuth';
import { setSettings } from '@/store/auth';
import { showToast } from '@/lib/toastBus';
import {
  DASHBOARD_BREAKPOINT_COLS,
  CANONICAL_COLS,
  DASHBOARD_LAYOUT_VERSION,
  DASHBOARD_LOCAL_STORAGE_PREFIX,
  DASHBOARD_LOCAL_STORAGE_PREFIX_V3,
  DASHBOARD_LOCAL_STORAGE_PREFIX_V1,
  DASHBOARD_LOCAL_STORAGE_PREFIX_V2,
  DASHBOARD_MEDIUM_SIZE,
  MAX_WIDGET_HEIGHT_UNITS,
  type DashboardBreakpointCols,
  type DashboardBreakpointKey,
  type DashboardLayoutSettings,
  type DashboardWidthUnit,
  type DashboardSurfaceId,
  type DashboardSurfaceLayout,
  type DashboardWidgetLayoutItem,
  clampDashboardHeightUnits,
  clampDashboardWidthUnit,
  nowIso,
  widgetKey,
} from './dashboardLayoutTypes';

const DASHBOARD_SURFACES: DashboardSurfaceId[] = ['team-dashboard', 'my-work-dashboard'];
const DASHBOARD_UPGRADE_TOAST_KEY = 'dashboard-layout:v4:reset-toast-shown';

export function emitDashboardTelemetry(eventName: string) {
  if (typeof window === 'undefined') return;
  try {
    const key = '__dashboardTelemetryCounters';
    const counters = (window as any)[key] || {};
    counters[eventName] = Number(counters[eventName] || 0) + 1;
    (window as any)[key] = counters;
    window.dispatchEvent(new CustomEvent('dashboard-layout-telemetry', { detail: { eventName, count: counters[eventName] } }));
  } catch {
    // Best effort only.
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  return fallback;
}

function colsToKey(cols: DashboardBreakpointCols): DashboardBreakpointKey {
  return String(cols) as DashboardBreakpointKey;
}

function keyToCols(key: string): DashboardBreakpointCols | null {
  const numeric = Number(key);
  if (numeric === 2 || numeric === 4 || numeric === 6 || numeric === 8 || numeric === 10) {
    return numeric;
  }
  return null;
}

function clampWidth(value: unknown, maxUnits: number = CANONICAL_COLS): DashboardWidthUnit {
  return clampDashboardWidthUnit(value, 2, maxUnits);
}

function clampHeight(value: unknown): number {
  return clampDashboardHeightUnits(value, DASHBOARD_MEDIUM_SIZE.h, MAX_WIDGET_HEIGHT_UNITS);
}

function normalizeWidget(
  rawWidget: unknown,
  allowedCardIds: Set<string>,
  usedCardIds: Set<string>,
  maxCols: number,
  fallbackWidget?: DashboardWidgetLayoutItem
): DashboardWidgetLayoutItem | null {
  const widget = asRecord(rawWidget);
  const cardIdRaw = typeof widget.cardId === 'string' ? widget.cardId.trim() : '';
  const cardId = cardIdRaw || fallbackWidget?.cardId || '';
  if (!cardId || !allowedCardIds.has(cardId) || usedCardIds.has(cardId)) {
    return null;
  }

  const w = clampWidth(widget.w ?? fallbackWidget?.w ?? DASHBOARD_MEDIUM_SIZE.w, maxCols);
  const h = clampHeight(widget.h ?? fallbackWidget?.h ?? DASHBOARD_MEDIUM_SIZE.h);
  const xFallback = fallbackWidget?.x ?? 0;
  const yFallback = fallbackWidget?.y ?? 0;
  const xRaw = parseNonNegativeInt(widget.x, xFallback);
  const y = parseNonNegativeInt(widget.y, yFallback);
  const x = Math.max(0, Math.min(Math.max(0, maxCols - w), xRaw));
  const iRaw = typeof widget.i === 'string' ? widget.i.trim() : '';

  usedCardIds.add(cardId);
  return {
    i: iRaw || widgetKey(cardId),
    cardId,
    x,
    y,
    w,
    h,
  };
}

function normalizeWidgets(
  rawWidgets: unknown,
  allowedCardIds: string[],
  defaultWidgets: DashboardWidgetLayoutItem[],
  maxCols: number
): DashboardWidgetLayoutItem[] {
  const allowed = new Set(allowedCardIds);
  const defaultByCard = new Map(defaultWidgets.map((widget) => [widget.cardId, widget]));
  const usedCardIds = new Set<string>();
  const widgets: DashboardWidgetLayoutItem[] = [];
  const rawList = Array.isArray(rawWidgets) ? rawWidgets : [];

  for (const rawWidget of rawList) {
    const cardId = typeof asRecord(rawWidget).cardId === 'string' ? String(asRecord(rawWidget).cardId).trim() : '';
    const fallback = cardId ? defaultByCard.get(cardId) : undefined;
    const normalized = normalizeWidget(rawWidget, allowed, usedCardIds, maxCols, fallback);
    if (normalized) widgets.push(normalized);
  }

  let appendY = widgets.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0);
  for (const cardId of allowedCardIds) {
    if (usedCardIds.has(cardId)) continue;
    const fallback = defaultByCard.get(cardId);
    const candidate = normalizeWidget(
      {
        i: widgetKey(cardId),
        cardId,
        x: fallback?.x ?? 0,
        y: fallback?.y ?? appendY,
        w: fallback?.w ?? DASHBOARD_MEDIUM_SIZE.w,
        h: fallback?.h ?? DASHBOARD_MEDIUM_SIZE.h,
      },
      allowed,
      usedCardIds,
      maxCols,
      fallback
    );

    if (!candidate) continue;

    if (!fallback) {
      candidate.x = 0;
      candidate.y = appendY;
      appendY += candidate.h;
    }

    widgets.push(candidate);
  }

  return widgets;
}

function isLayoutEqual(a: DashboardSurfaceLayout, b: DashboardSurfaceLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type ParsedLayoutSettings = DashboardLayoutSettings & { hasPayload: boolean };

function parseLayoutSettings(raw: unknown): ParsedLayoutSettings {
  const obj = asRecord(raw);
  const hasPayload = Object.prototype.hasOwnProperty.call(obj, 'version')
    || Object.prototype.hasOwnProperty.call(obj, 'surfaces');
  const versionRaw = Number(obj.version);
  const version = Number.isFinite(versionRaw) ? versionRaw : 0;
  const surfacesObj = asRecord(obj.surfaces);

  return {
    hasPayload,
    version,
    surfaces: {
      'team-dashboard': surfacesObj['team-dashboard'] as DashboardSurfaceLayout | undefined,
      'my-work-dashboard': surfacesObj['my-work-dashboard'] as DashboardSurfaceLayout | undefined,
    },
  };
}

function localStorageKey(prefix: string, userId: number | null, surfaceId: DashboardSurfaceId): string {
  const userSegment = userId != null ? String(userId) : 'anon';
  return `${prefix}:${userSegment}:${surfaceId}`;
}

function readLocalLayoutV3(userId: number | null, surfaceId: DashboardSurfaceId): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX, userId, surfaceId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalLayoutV3(userId: number | null, surfaceId: DashboardSurfaceId, layout: DashboardSurfaceLayout) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX, userId, surfaceId),
      JSON.stringify(layout)
    );
  } catch {
    // Ignore storage failures.
  }
}

function clearLocalLayoutV3(userId: number | null, surfaceId: DashboardSurfaceId) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX, userId, surfaceId));
  } catch {
    // Ignore storage failures.
  }
}

function hasLegacyLocalLayout(userId: number | null, surfaceId: DashboardSurfaceId): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      window.localStorage.getItem(localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX_V3, userId, surfaceId)) ||
      window.localStorage.getItem(localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX_V1, userId, surfaceId)) ||
      window.localStorage.getItem(localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX_V2, userId, surfaceId))
    );
  } catch {
    return false;
  }
}

function clearLegacyLocalLayouts(userId: number | null) {
  if (typeof window === 'undefined') return;
  try {
    for (const surfaceId of DASHBOARD_SURFACES) {
      window.localStorage.removeItem(localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX_V3, userId, surfaceId));
      window.localStorage.removeItem(localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX_V1, userId, surfaceId));
      window.localStorage.removeItem(localStorageKey(DASHBOARD_LOCAL_STORAGE_PREFIX_V2, userId, surfaceId));
    }
  } catch {
    // Ignore storage failures.
  }
}

function announceUpgradeResetOnce() {
  if (typeof window === 'undefined') return;
  try {
    const shown = window.sessionStorage.getItem(DASHBOARD_UPGRADE_TOAST_KEY);
    if (shown === '1') return;
    window.sessionStorage.setItem(DASHBOARD_UPGRADE_TOAST_KEY, '1');
  } catch {
    // Best effort; still show toast.
  }
  emitDashboardTelemetry('reset_triggered_initialization');
  showToast('Dashboard layout reset due to layout engine upgrade.', 'info');
}

export function resolveUnitColumnCount(width?: number): 2 | 4 | 6 | 8 | 10 {
  if (!width || !Number.isFinite(width)) return 2;
  if (width >= 2200) return 10;
  if (width >= 1700) return 8;
  if (width >= 1200) return 6;
  if (width >= 760) return 4;
  return 2;
}

export function resolveUnitColumnCountWithHysteresis(
  width: number | undefined,
  previousCols: 2 | 4 | 6 | 8 | 10,
  hysteresisPx = 24
): 2 | 4 | 6 | 8 | 10 {
  const safeWidth = Number.isFinite(width) ? Number(width) : 0;
  const h = Math.max(0, Math.floor(hysteresisPx));
  const low760 = 760 - h;
  const low1200 = 1200 - h;
  const low1700 = 1700 - h;
  const low2200 = 2200 - h;
  const high760 = 760 + h;
  const high1200 = 1200 + h;
  const high1700 = 1700 + h;
  const high2200 = 2200 + h;

  switch (previousCols) {
    case 2:
      if (safeWidth >= high2200) return 10;
      if (safeWidth >= high1700) return 8;
      if (safeWidth >= high1200) return 6;
      if (safeWidth >= high760) return 4;
      return 2;
    case 4:
      if (safeWidth < low760) return 2;
      if (safeWidth >= high2200) return 10;
      if (safeWidth >= high1700) return 8;
      if (safeWidth >= high1200) return 6;
      return 4;
    case 6:
      if (safeWidth < low1200) {
        if (safeWidth < low760) return 2;
        return 4;
      }
      if (safeWidth >= high2200) return 10;
      if (safeWidth >= high1700) return 8;
      return 6;
    case 8:
      if (safeWidth < low1700) {
        if (safeWidth < low760) return 2;
        if (safeWidth < low1200) return 4;
        return 6;
      }
      if (safeWidth >= high2200) return 10;
      return 8;
    case 10:
      if (safeWidth < low2200) {
        if (safeWidth < low760) return 2;
        if (safeWidth < low1200) return 4;
        if (safeWidth < low1700) return 6;
        return 8;
      }
      return 10;
    default:
      return resolveUnitColumnCount(safeWidth);
  }
}

function scaleInt(value: number, fromCols: number, toCols: number): number {
  if (fromCols <= 0 || toCols <= 0) return 0;
  return Math.round((value * toCols) / fromCols);
}

type GridRect = Pick<Layout[number], 'x' | 'y' | 'w' | 'h'>;

function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

export function resolveProjectedLayoutCollisions(layout: Layout, activeCols: number): Layout {
  const maxW = Math.max(1, activeCols);
  let placed: Layout = [];

  for (const item of layout) {
    const w = Math.max(1, Math.min(maxW, parseNonNegativeInt(item.w, 1)));
    const h = Math.max(1, clampHeight(item.h));
    const candidate = {
      ...item,
      x: Math.max(0, Math.min(Math.max(0, activeCols - w), parseNonNegativeInt(item.x, 0))),
      y: Math.max(0, parseNonNegativeInt(item.y, 0)),
      w,
      h,
      minW: 1,
      minH: 1,
      maxW,
      maxH: MAX_WIDGET_HEIGHT_UNITS,
    };

    while (placed.some((existing) => rectsOverlap(candidate, existing))) {
      candidate.y += 1;
    }

    placed = [...placed, candidate];
  }

  return placed;
}

export function widgetsToActiveLayout(
  widgets: DashboardWidgetLayoutItem[],
  activeCols: number,
  forceFullWidth: boolean
): Layout {
  const base = widgets.map((widget) => {
    const w = forceFullWidth
      ? activeCols
      : Math.max(1, Math.min(activeCols, clampWidth(widget.w, activeCols)));
    const x = forceFullWidth
      ? 0
      : Math.max(0, Math.min(Math.max(0, activeCols - w), parseNonNegativeInt(widget.x, 0)));

    return {
      i: widget.i,
      x,
      y: Math.max(0, parseNonNegativeInt(widget.y, 0)),
      w,
      h: Math.max(1, clampHeight(widget.h)),
      minW: 1,
      minH: 1,
      maxW: Math.max(1, activeCols),
      maxH: MAX_WIDGET_HEIGHT_UNITS,
    };
  });

  return resolveProjectedLayoutCollisions(base, activeCols);
}

export function layoutToWidgetsForCols(
  activeLayout: Layout,
  previousWidgets: DashboardWidgetLayoutItem[],
  activeCols: number
): DashboardWidgetLayoutItem[] {
  const previousById = new Map(previousWidgets.map((widget) => [widget.i, widget]));
  return [...activeLayout]
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((item) => {
      const previous = previousById.get(item.i);
      const cardId = previous?.cardId || item.i;
      const w = clampWidth(item.w, activeCols);
      const h = clampHeight(item.h);
      const x = Math.max(0, Math.min(Math.max(0, activeCols - w), parseNonNegativeInt(item.x, previous?.x ?? 0)));
      const y = parseNonNegativeInt(item.y, previous?.y ?? 0);
      return { i: item.i, cardId, x, y, w, h };
    });
}

export function projectWidgetsToCols(
  widgets: DashboardWidgetLayoutItem[],
  fromCols: number,
  toCols: DashboardBreakpointCols
): DashboardWidgetLayoutItem[] {
  const cardIdByWidgetId = new Map(widgets.map((widget) => [widget.i, widget.cardId]));
  const projected = widgets.map((widget) => {
    const scaledW = Math.max(1, scaleInt(clampWidth(widget.w, fromCols), fromCols, toCols));
    const w = Math.max(1, Math.min(toCols, scaledW));
    const scaledX = scaleInt(widget.x, fromCols, toCols);
    const x = Math.max(0, Math.min(Math.max(0, toCols - w), scaledX));
    return {
      i: widget.i,
      x,
      y: widget.y,
      w,
      h: widget.h,
      minW: 1,
      minH: 1,
      maxW: Math.max(1, toCols),
      maxH: MAX_WIDGET_HEIGHT_UNITS,
    };
  });

  const settled = resolveProjectedLayoutCollisions(projected, toCols);
  return settled.map((item) => ({
    i: item.i,
    cardId: cardIdByWidgetId.get(item.i) || item.i,
    x: item.x,
    y: item.y,
    w: clampWidth(item.w, toCols),
    h: clampHeight(item.h),
  }));
}

export function projectCanonicalToActiveLayout(
  widgets: DashboardWidgetLayoutItem[],
  activeCols: number,
  forceFullWidth: boolean
): Layout {
  const projected = widgets.map((widget) => {
    const scaledW = Math.max(1, scaleInt(widget.w, CANONICAL_COLS, activeCols));
    const maxWidth = Math.max(1, activeCols);
    const w = forceFullWidth ? activeCols : Math.min(maxWidth, scaledW);
    const scaledX = scaleInt(widget.x, CANONICAL_COLS, activeCols);
    const x = forceFullWidth ? 0 : Math.max(0, Math.min(Math.max(0, activeCols - w), scaledX));

    return {
      i: widget.i,
      x,
      y: widget.y,
      w,
      h: widget.h,
      minW: 1,
      minH: 1,
      maxW: Math.max(1, activeCols),
      maxH: MAX_WIDGET_HEIGHT_UNITS,
    };
  });

  return resolveProjectedLayoutCollisions(projected, activeCols);
}

export function projectActiveToCanonicalWidgets(
  activeLayout: Layout,
  previousWidgets: DashboardWidgetLayoutItem[],
  activeCols: number
): DashboardWidgetLayoutItem[] {
  const previousById = new Map(previousWidgets.map((widget) => [widget.i, widget]));

  return [...activeLayout]
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((item) => {
      const previous = previousById.get(item.i);
      const cardId = previous?.cardId || item.i;
      const w = clampWidth(scaleInt(item.w, activeCols, CANONICAL_COLS));
      const h = clampHeight(item.h);
      const x = Math.max(0, Math.min(CANONICAL_COLS - w, scaleInt(item.x, activeCols, CANONICAL_COLS)));
      const y = parseNonNegativeInt(item.y, previous?.y ?? 0);

      return {
        i: item.i,
        cardId,
        x,
        y,
        w,
        h,
      };
    });
}

export function createDefaultSurfaceLayout(args: {
  widgets: Array<Partial<DashboardWidgetLayoutItem> & { cardId: string }>;
}): DashboardSurfaceLayout {
  const initial: DashboardWidgetLayoutItem[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const widget of args.widgets) {
    const cardId = widget.cardId;
    const i = typeof widget.i === 'string' && widget.i.trim() ? widget.i.trim() : widgetKey(cardId);
    const w = clampWidth(widget.w ?? DASHBOARD_MEDIUM_SIZE.w, CANONICAL_COLS);
    const h = clampHeight(widget.h ?? DASHBOARD_MEDIUM_SIZE.h);
    const hasPosition = typeof widget.x === 'number' && Number.isFinite(widget.x) && typeof widget.y === 'number' && Number.isFinite(widget.y);

    let x: number;
    let y: number;

    if (hasPosition) {
      x = Math.max(0, Math.min(CANONICAL_COLS - w, Math.floor(widget.x!)));
      y = Math.max(0, Math.floor(widget.y!));
    } else {
      if (cursorX + w > CANONICAL_COLS) {
        cursorX = 0;
        cursorY += Math.max(1, rowHeight);
        rowHeight = 0;
      }
      x = cursorX;
      y = cursorY;
      cursorX += w;
      rowHeight = Math.max(rowHeight, h);
    }

    initial.push({ i, cardId, x, y, w, h });
  }

  const allowedCardIds = args.widgets.map((widget) => widget.cardId);
  const canonicalWidgets = normalizeWidgets(initial, allowedCardIds, initial, CANONICAL_COLS);
  const widgetsByCols: DashboardSurfaceLayout['widgetsByCols'] = {};
  for (const cols of DASHBOARD_BREAKPOINT_COLS) {
    const key = colsToKey(cols);
    widgetsByCols[key] = cols === CANONICAL_COLS
      ? canonicalWidgets
      : projectWidgetsToCols(canonicalWidgets, CANONICAL_COLS, cols);
  }

  return {
    widgets: canonicalWidgets,
    widgetsByCols,
    updatedAt: nowIso(),
  };
}

export function normalizeSurfaceLayout(
  rawLayout: unknown,
  allowedCardIds: string[],
  defaultLayout: DashboardSurfaceLayout
): DashboardSurfaceLayout {
  const layoutObj = asRecord(rawLayout);
  const widgets = normalizeWidgets(layoutObj.widgets, allowedCardIds, defaultLayout.widgets, CANONICAL_COLS);
  const rawByCols = asRecord(layoutObj.widgetsByCols);
  const widgetsByCols: DashboardSurfaceLayout['widgetsByCols'] = {};

  for (const cols of DASHBOARD_BREAKPOINT_COLS) {
    const key = colsToKey(cols);
    const fallbackWidgets = cols === CANONICAL_COLS
      ? widgets
      : projectWidgetsToCols(widgets, CANONICAL_COLS, cols);
    const rawWidgetsForCols = rawByCols[key];
    widgetsByCols[key] = normalizeWidgets(rawWidgetsForCols, allowedCardIds, fallbackWidgets, cols);
  }

  const updatedAt = typeof layoutObj.updatedAt === 'string' && layoutObj.updatedAt.trim()
    ? layoutObj.updatedAt
    : nowIso();

  return {
    widgets,
    widgetsByCols,
    updatedAt,
  };
}

export function getSurfaceWidgetsForCols(
  layout: DashboardSurfaceLayout,
  activeCols: DashboardBreakpointCols
): DashboardWidgetLayoutItem[] {
  const key = colsToKey(activeCols);
  const explicit = layout.widgetsByCols[key];
  if (Array.isArray(explicit) && explicit.length > 0) return explicit;
  if (activeCols === CANONICAL_COLS) return layout.widgets;
  return projectWidgetsToCols(layout.widgets, CANONICAL_COLS, activeCols);
}

export function mergeSurfaceIntoSettings(
  rawSettings: unknown,
  surfaceId: DashboardSurfaceId,
  layout: DashboardSurfaceLayout
): DashboardLayoutSettings {
  const parsed = parseLayoutSettings(rawSettings);
  const nextSurfaces: DashboardLayoutSettings['surfaces'] = {
    ...(parsed.version === DASHBOARD_LAYOUT_VERSION ? parsed.surfaces : {}),
    [surfaceId]: layout,
  };

  return {
    version: DASHBOARD_LAYOUT_VERSION,
    surfaces: nextSurfaces,
  };
}

export function useDashboardLayoutState(args: {
  surfaceId: DashboardSurfaceId;
  cardIds: string[];
  defaultLayout: DashboardSurfaceLayout;
  saveDebounceMs?: number;
}) {
  const {
    surfaceId,
    cardIds,
    defaultLayout,
    saveDebounceMs = 800,
  } = args;

  const auth = useAuth();
  const userId = auth.user?.id ?? null;

  const normalizedDefault = React.useMemo(
    () => normalizeSurfaceLayout(defaultLayout, cardIds, defaultLayout),
    [defaultLayout, cardIds]
  );

  const [layout, setLayout] = React.useState<DashboardSurfaceLayout>(normalizedDefault);
  const [unlocked, setUnlocked] = React.useState(false);
  const [rearrangeEnabled, setRearrangeEnabled] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 768;
  });

  const saveTimerRef = React.useRef<number | null>(null);
  const pendingLayoutRef = React.useRef<DashboardSurfaceLayout | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setRearrangeEnabled(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    if (!rearrangeEnabled) {
      setUnlocked(false);
    }
  }, [rearrangeEnabled]);

  React.useEffect(() => {
    const parsed = parseLayoutSettings((auth.settings as Record<string, unknown> | undefined)?.dashboardLayouts);
    const serverV4 = parsed.version === DASHBOARD_LAYOUT_VERSION;
    const serverSurface = serverV4 ? parsed.surfaces[surfaceId] : undefined;
    const localV4 = readLocalLayoutV3(userId, surfaceId);

    const legacyLocalPresent = DASHBOARD_SURFACES.some((sid) => hasLegacyLocalLayout(userId, sid));
    if (!serverV4 && parsed.hasPayload) {
      clearLegacyLocalLayouts(userId);
      announceUpgradeResetOnce();
    } else if (legacyLocalPresent) {
      clearLegacyLocalLayouts(userId);
      announceUpgradeResetOnce();
    }

    const next = serverSurface
      ? normalizeSurfaceLayout(serverSurface, cardIds, normalizedDefault)
      : localV4
        ? normalizeSurfaceLayout(localV4, cardIds, normalizedDefault)
        : normalizedDefault;

    setLayout((prev) => (isLayoutEqual(prev, next) ? prev : next));
  }, [
    auth.settings,
    userId,
    surfaceId,
    cardIds,
    normalizedDefault,
  ]);

  React.useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const persistLayout = React.useCallback((nextLayout: DashboardSurfaceLayout) => {
    pendingLayoutRef.current = nextLayout;

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      const pending = pendingLayoutRef.current;
      if (!pending) return;

      const rawSettingsLayouts = (auth.settings as Record<string, unknown> | undefined)?.dashboardLayouts;
      const nextSettingsLayouts = mergeSurfaceIntoSettings(rawSettingsLayouts, surfaceId, pending);

      try {
        await setSettings({ dashboardLayouts: nextSettingsLayouts } as any);
        clearLocalLayoutV3(userId, surfaceId);
      } catch {
        emitDashboardTelemetry('layout_save_failure');
        writeLocalLayoutV3(userId, surfaceId, pending);
        showToast('Dashboard layout was saved locally because server sync failed.', 'warning');
      }
    }, saveDebounceMs);
  }, [auth.settings, saveDebounceMs, surfaceId, userId]);

  const updateLayout = React.useCallback((updater: (prev: DashboardSurfaceLayout) => DashboardSurfaceLayout) => {
    setLayout((prev) => {
      const next = normalizeSurfaceLayout(updater(prev), cardIds, normalizedDefault);
      if (isLayoutEqual(prev, next)) return prev;
      persistLayout(next);
      return next;
    });
  }, [cardIds, normalizedDefault, persistLayout]);

  const resetLayout = React.useCallback(() => {
    setLayout((prev) => {
      if (isLayoutEqual(prev, normalizedDefault)) return prev;
      persistLayout(normalizedDefault);
      return normalizedDefault;
    });
  }, [normalizedDefault, persistLayout]);

  const applyActiveLayout = React.useCallback((nextActiveLayout: Layout, activeCols: number) => {
    const collisionFreeActive = resolveProjectedLayoutCollisions(nextActiveLayout, activeCols);
    const breakpointCols = keyToCols(String(activeCols)) || CANONICAL_COLS;
    updateLayout((prev) => ({
      ...prev,
      widgets: projectActiveToCanonicalWidgets(collisionFreeActive, prev.widgets, activeCols),
      widgetsByCols: {
        ...(prev.widgetsByCols || {}),
        [colsToKey(breakpointCols)]: layoutToWidgetsForCols(
          collisionFreeActive,
          getSurfaceWidgetsForCols(prev, breakpointCols),
          activeCols
        ),
      },
      updatedAt: nowIso(),
    }));
  }, [updateLayout]);

  const getWidgetsForCols = React.useCallback((activeCols: DashboardBreakpointCols) => {
    return getSurfaceWidgetsForCols(layout, activeCols);
  }, [layout]);

  return {
    layout,
    unlocked,
    rearrangeEnabled,
    setUnlocked,
    resetLayout,
    applyActiveLayout,
    getWidgetsForCols,
  };
}
