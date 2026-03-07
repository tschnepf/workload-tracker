import type React from 'react';

export const DASHBOARD_LAYOUT_VERSION = 2 as const;

export type DashboardSurfaceId = 'team-dashboard' | 'my-work-dashboard';
export type DashboardSizeStep = 1 | 2 | 3 | 4;
export type DashboardItemSize = { w: DashboardSizeStep; h: DashboardSizeStep };

export type DashboardLayoutItem =
  | { type: 'card'; cardId: string }
  | { type: 'group'; groupId: string };

export type DashboardGroup = {
  id: string;
  title: string;
  cardIds: string[];
};

export type DashboardSurfaceLayout = {
  items: DashboardLayoutItem[];
  groups: Record<string, DashboardGroup>;
  cardSizes: Record<string, DashboardItemSize>;
  groupSizes: Record<string, DashboardItemSize>;
  hiddenCardIds: string[];
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
  defaultSize?: DashboardItemSize;
};

export const DASHBOARD_LOCAL_STORAGE_PREFIX = 'dashboard-layout:v2';
export const DASHBOARD_LOCAL_STORAGE_PREFIX_V1 = 'dashboard-layout:v1';
export const DASHBOARD_MEDIUM_ITEM_SIZE: DashboardItemSize = { w: 2, h: 2 };

const DASHBOARD_SIZE_UNITS: Record<DashboardSizeStep, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
};

export function isDashboardSizeStep(value: unknown): value is DashboardSizeStep {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function sizeStepToUnits(step: DashboardSizeStep): number {
  return DASHBOARD_SIZE_UNITS[step];
}

export function dashboardItemId(item: DashboardLayoutItem): string {
  return item.type === 'card' ? `card:${item.cardId}` : `group:${item.groupId}`;
}

export function parseDashboardItemId(value: string): { type: 'card'; cardId: string } | { type: 'group'; groupId: string } | null {
  if (typeof value !== 'string') return null;
  if (value.startsWith('card:')) {
    const cardId = value.slice('card:'.length);
    return cardId ? { type: 'card', cardId } : null;
  }
  if (value.startsWith('group:')) {
    const groupId = value.slice('group:'.length);
    return groupId ? { type: 'group', groupId } : null;
  }
  return null;
}

export function nowIso(): string {
  return new Date().toISOString();
}
