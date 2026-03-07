import type React from 'react';

export const DASHBOARD_LAYOUT_VERSION = 4 as const;
export const CANONICAL_COLS = 10 as const;
export const MIN_WIDGET_UNITS = 1 as const;
export const MAX_WIDGET_WIDTH_UNITS = CANONICAL_COLS;
export const MAX_WIDGET_HEIGHT_UNITS = 60 as const;
export const DASHBOARD_BREAKPOINT_COLS = [2, 4, 6, 8, 10] as const;

export type DashboardSurfaceId = 'team-dashboard' | 'my-work-dashboard';
export type DashboardWidthUnit = number;
export type DashboardBreakpointCols = (typeof DASHBOARD_BREAKPOINT_COLS)[number];
export type DashboardBreakpointKey = `${DashboardBreakpointCols}`;

export type DashboardWidgetLayoutItem = {
  i: string;
  cardId: string;
  x: number;
  y: number;
  w: DashboardWidthUnit;
  h: number;
};

export type DashboardSurfaceLayout = {
  widgets: DashboardWidgetLayoutItem[];
  widgetsByCols: Partial<Record<DashboardBreakpointKey, DashboardWidgetLayoutItem[]>>;
  updatedAt: string;
};

export type DashboardLayoutSettings = {
  version: number;
  surfaces: Partial<Record<DashboardSurfaceId, DashboardSurfaceLayout>>;
};

export type DashboardCardDefinition = {
  id: string;
  title: string;
  render: (ctx: { inGroup: boolean }) => React.ReactNode;
  renderPreview?: () => React.ReactNode;
};

export const DASHBOARD_LOCAL_STORAGE_PREFIX = 'dashboard-layout:v4';
export const DASHBOARD_LOCAL_STORAGE_PREFIX_V3 = 'dashboard-layout:v3';
export const DASHBOARD_LOCAL_STORAGE_PREFIX_V2 = 'dashboard-layout:v2';
export const DASHBOARD_LOCAL_STORAGE_PREFIX_V1 = 'dashboard-layout:v1';

export const DASHBOARD_MEDIUM_SIZE: Pick<DashboardWidgetLayoutItem, 'w' | 'h'> = {
  w: 2,
  h: 2,
};

export function isDashboardWidthUnit(value: unknown): value is DashboardWidthUnit {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= MIN_WIDGET_UNITS
    && value <= MAX_WIDGET_WIDTH_UNITS;
}

export function clampDashboardWidthUnit(
  value: unknown,
  fallback: DashboardWidthUnit = DASHBOARD_MEDIUM_SIZE.w,
  maxUnits: number = MAX_WIDGET_WIDTH_UNITS
): DashboardWidthUnit {
  const min = MIN_WIDGET_UNITS;
  const max = Math.max(min, Math.floor(maxUnits));
  if (isDashboardWidthUnit(value)) return value;
  if (typeof value === 'number') {
    const rounded = Math.round(value);
    if (rounded >= min && rounded <= max) return rounded as DashboardWidthUnit;
  }
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'sm' || normalized === 'small') return 1;
    if (normalized === 'md' || normalized === 'medium') return 2;
    if (normalized === 'lg' || normalized === 'large') return 3;
    if (normalized === 'xl' || normalized === 'xlarge' || normalized === 'x-large') return 4;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return Math.max(min, Math.min(max, Math.round(parsed)));
    }
  }
  return Math.max(min, Math.min(max, Math.round(fallback)));
}

export function clampDashboardHeightUnits(
  value: unknown,
  fallback: number = DASHBOARD_MEDIUM_SIZE.h,
  maxUnits: number = MAX_WIDGET_HEIGHT_UNITS
): number {
  const min = MIN_WIDGET_UNITS;
  const max = Math.max(min, Math.floor(maxUnits));
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'sm' || normalized === 'small') return 1;
    if (normalized === 'md' || normalized === 'medium') return 2;
    if (normalized === 'lg' || normalized === 'large') return 3;
    if (normalized === 'xl' || normalized === 'xlarge' || normalized === 'x-large') return 4;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return Math.max(min, Math.min(max, Math.round(parsed)));
    }
  }
  return Math.max(min, Math.min(max, Math.round(fallback)));
}

export function widgetKey(cardId: string): string {
  return cardId;
}

export function nowIso(): string {
  return new Date().toISOString();
}
