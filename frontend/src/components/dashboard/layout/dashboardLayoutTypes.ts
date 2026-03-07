import type React from 'react';

export const DASHBOARD_LAYOUT_VERSION = 1 as const;

export type DashboardSurfaceId = 'team-dashboard' | 'my-work-dashboard';

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
};

export const DASHBOARD_LOCAL_STORAGE_PREFIX = 'dashboard-layout:v1';

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
