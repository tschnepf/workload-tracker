import * as React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { setSettings } from '@/store/auth';
import { showToast } from '@/lib/toastBus';
import {
  DASHBOARD_LAYOUT_VERSION,
  DASHBOARD_LOCAL_STORAGE_PREFIX,
  type DashboardLayoutSettings,
  type DashboardLayoutItem,
  type DashboardSurfaceId,
  type DashboardSurfaceLayout,
  dashboardItemId,
  nowIso,
} from './dashboardLayoutTypes';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

function normalizeItems(rawItems: unknown[]): DashboardLayoutItem[] {
  const out: DashboardLayoutItem[] = [];
  rawItems.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;
    if (obj.type === 'card' && typeof obj.cardId === 'string' && obj.cardId) {
      out.push({ type: 'card', cardId: obj.cardId });
      return;
    }
    if (obj.type === 'group' && typeof obj.groupId === 'string' && obj.groupId) {
      out.push({ type: 'group', groupId: obj.groupId });
    }
  });
  return out;
}

export function resolveColumnCount(width?: number): number {
  if (!width || !Number.isFinite(width)) return 1;
  if (width >= 2200) return 5;
  if (width >= 1700) return 4;
  if (width >= 1200) return 3;
  if (width >= 760) return 2;
  return 1;
}

export function createDefaultSurfaceLayout(args: {
  items: DashboardLayoutItem[];
  groups?: Record<string, { title: string; cardIds: string[] }>;
}): DashboardSurfaceLayout {
  const groups: Record<string, { id: string; title: string; cardIds: string[] }> = {};
  Object.entries(args.groups || {}).forEach(([id, group]) => {
    groups[id] = {
      id,
      title: group.title,
      cardIds: uniqueStrings(group.cardIds || []),
    };
  });
  return {
    items: args.items,
    groups,
    hiddenCardIds: [],
    updatedAt: nowIso(),
  };
}

export function normalizeSurfaceLayout(
  rawLayout: unknown,
  allowedCardIds: string[]
): DashboardSurfaceLayout {
  const allowed = new Set(allowedCardIds);
  const layoutObj = asRecord(rawLayout);
  const groupsObj = asRecord(layoutObj.groups);

  const groups: DashboardSurfaceLayout['groups'] = {};
  Object.entries(groupsObj).forEach(([groupId, groupValue]) => {
    const group = asRecord(groupValue);
    const title = typeof group.title === 'string' && group.title.trim() ? group.title.trim() : 'Group';
    const cardIdsRaw = Array.isArray(group.cardIds) ? group.cardIds : [];
    const cardIds = uniqueStrings(
      cardIdsRaw
        .filter((id): id is string => typeof id === 'string')
        .filter((id) => allowed.has(id))
    );
    if (groupId && cardIds.length > 0) {
      groups[groupId] = {
        id: groupId,
        title,
        cardIds,
      };
    }
  });

  const rawItems = Array.isArray(layoutObj.items) ? normalizeItems(layoutObj.items) : [];
  const seenCards = new Set<string>();
  const items: DashboardLayoutItem[] = [];

  rawItems.forEach((item) => {
    if (item.type === 'card') {
      if (!allowed.has(item.cardId) || seenCards.has(item.cardId)) return;
      seenCards.add(item.cardId);
      items.push(item);
      return;
    }

    const group = groups[item.groupId];
    if (!group) return;

    const remaining = group.cardIds.filter((cardId) => !seenCards.has(cardId));
    if (remaining.length === 0) {
      delete groups[item.groupId];
      return;
    }

    group.cardIds = remaining;
    remaining.forEach((cardId) => seenCards.add(cardId));
    items.push(item);
  });

  allowedCardIds.forEach((cardId) => {
    if (seenCards.has(cardId)) return;
    seenCards.add(cardId);
    items.push({ type: 'card', cardId });
  });

  const hiddenRaw = Array.isArray(layoutObj.hiddenCardIds) ? layoutObj.hiddenCardIds : [];
  const hiddenCardIds = uniqueStrings(
    hiddenRaw
      .filter((id): id is string => typeof id === 'string')
      .filter((id) => allowed.has(id))
  );

  const updatedAt = typeof layoutObj.updatedAt === 'string' && layoutObj.updatedAt ? layoutObj.updatedAt : nowIso();

  return {
    items,
    groups,
    hiddenCardIds,
    updatedAt,
  };
}

function isLayoutEqual(a: DashboardSurfaceLayout, b: DashboardSurfaceLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseLayoutSettings(raw: unknown): DashboardLayoutSettings {
  const obj = asRecord(raw);
  const version = Number(obj.version) || DASHBOARD_LAYOUT_VERSION;
  const surfacesObj = asRecord(obj.surfaces);
  return {
    version,
    surfaces: {
      'team-dashboard': surfacesObj['team-dashboard'] as DashboardSurfaceLayout | undefined,
      'my-work-dashboard': surfacesObj['my-work-dashboard'] as DashboardSurfaceLayout | undefined,
    },
  };
}

function localStorageKey(userId: number | null, surfaceId: DashboardSurfaceId): string {
  const userSegment = userId != null ? String(userId) : 'anon';
  return `${DASHBOARD_LOCAL_STORAGE_PREFIX}:${userSegment}:${surfaceId}`;
}

function readLocalLayout(userId: number | null, surfaceId: DashboardSurfaceId): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localStorageKey(userId, surfaceId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeLocalLayout(userId: number | null, surfaceId: DashboardSurfaceId, layout: DashboardSurfaceLayout) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(localStorageKey(userId, surfaceId), JSON.stringify(layout));
  } catch {
    // Ignore storage failures.
  }
}

function clearLocalLayout(userId: number | null, surfaceId: DashboardSurfaceId) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(localStorageKey(userId, surfaceId));
  } catch {
    // Ignore storage failures.
  }
}

function nextGroupId(groups: DashboardSurfaceLayout['groups']): string {
  let idx = Object.keys(groups).length + 1;
  let id = `group-${idx}`;
  while (groups[id]) {
    idx += 1;
    id = `group-${idx}`;
  }
  return id;
}

export function reorderLayoutItems(
  layout: DashboardSurfaceLayout,
  activeItemId: string,
  overItemId: string
): DashboardSurfaceLayout {
  if (!activeItemId || !overItemId || activeItemId === overItemId) return layout;
  const items = layout.items.slice();
  const fromIndex = items.findIndex((item) => dashboardItemId(item) === activeItemId);
  const toIndex = items.findIndex((item) => dashboardItemId(item) === overItemId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return layout;
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  return {
    ...layout,
    items,
    updatedAt: nowIso(),
  };
}

export function groupSelectedItems(
  layout: DashboardSurfaceLayout,
  selectedItemIds: string[]
): DashboardSurfaceLayout {
  const selectedSet = new Set(selectedItemIds);
  if (selectedSet.size < 2) return layout;

  const indexedSelected = layout.items
    .map((item, index) => ({ item, index, id: dashboardItemId(item) }))
    .filter((entry) => selectedSet.has(entry.id));

  if (indexedSelected.length < 2) return layout;

  const groups = { ...layout.groups };
  const selectedIndices = new Set(indexedSelected.map((entry) => entry.index));
  const mergedCardIds: string[] = [];
  let baseGroupId: string | null = null;
  let baseGroupTitle = 'Group';

  indexedSelected.forEach(({ item }) => {
    if (item.type === 'card') {
      if (!mergedCardIds.includes(item.cardId)) mergedCardIds.push(item.cardId);
      return;
    }

    const group = groups[item.groupId];
    if (!group) return;
    if (!baseGroupId) {
      baseGroupId = group.id;
      baseGroupTitle = group.title || 'Group';
    }
    group.cardIds.forEach((cardId) => {
      if (!mergedCardIds.includes(cardId)) mergedCardIds.push(cardId);
    });
  });

  if (mergedCardIds.length < 2) return layout;

  if (!baseGroupId) {
    baseGroupId = nextGroupId(groups);
    baseGroupTitle = `Group ${Object.keys(groups).length + 1}`;
  }

  groups[baseGroupId] = {
    id: baseGroupId,
    title: baseGroupTitle,
    cardIds: mergedCardIds,
  };

  indexedSelected.forEach(({ item }) => {
    if (item.type === 'group' && item.groupId !== baseGroupId) {
      delete groups[item.groupId];
    }
  });

  const insertIndex = Math.min(...indexedSelected.map((entry) => entry.index));
  const nextItems = layout.items.filter((_, index) => !selectedIndices.has(index));
  nextItems.splice(insertIndex, 0, { type: 'group', groupId: baseGroupId });

  return {
    ...layout,
    items: nextItems,
    groups,
    updatedAt: nowIso(),
  };
}

export function splitSelectedGroups(
  layout: DashboardSurfaceLayout,
  selectedItemIds: string[]
): DashboardSurfaceLayout {
  const selectedSet = new Set(selectedItemIds);
  if (!selectedSet.size) return layout;

  const groups = { ...layout.groups };
  const nextItems: DashboardLayoutItem[] = [];
  let didSplit = false;

  layout.items.forEach((item) => {
    const itemId = dashboardItemId(item);
    if (item.type === 'group' && selectedSet.has(itemId)) {
      const group = groups[item.groupId];
      if (!group) return;
      group.cardIds.forEach((cardId) => {
        nextItems.push({ type: 'card', cardId });
      });
      delete groups[item.groupId];
      didSplit = true;
      return;
    }
    nextItems.push(item);
  });

  if (!didSplit) return layout;

  return {
    ...layout,
    items: nextItems,
    groups,
    updatedAt: nowIso(),
  };
}

export function mergeSurfaceIntoSettings(
  rawSettings: unknown,
  surfaceId: DashboardSurfaceId,
  layout: DashboardSurfaceLayout
): DashboardLayoutSettings {
  const base = parseLayoutSettings(rawSettings);
  return {
    version: DASHBOARD_LAYOUT_VERSION,
    surfaces: {
      ...base.surfaces,
      [surfaceId]: layout,
    },
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
    () => normalizeSurfaceLayout(defaultLayout, cardIds),
    [defaultLayout, cardIds.join('|')]
  );

  const [layout, setLayout] = React.useState<DashboardSurfaceLayout>(normalizedDefault);
  const [selectedItemIds, setSelectedItemIds] = React.useState<string[]>([]);
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
      setSelectedItemIds([]);
    }
  }, [rearrangeEnabled]);

  React.useEffect(() => {
    const settingsLayouts = parseLayoutSettings((auth.settings as Record<string, unknown> | undefined)?.dashboardLayouts);
    const serverSurface = settingsLayouts.surfaces[surfaceId];
    const localSurface = readLocalLayout(userId, surfaceId);

    const next = serverSurface
      ? normalizeSurfaceLayout(serverSurface, cardIds)
      : localSurface
        ? normalizeSurfaceLayout(localSurface, cardIds)
        : normalizedDefault;

    setLayout((prev) => (isLayoutEqual(prev, next) ? prev : next));
    setSelectedItemIds([]);
  }, [
    auth.settings,
    userId,
    surfaceId,
    cardIds.join('|'),
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
        clearLocalLayout(userId, surfaceId);
      } catch {
        writeLocalLayout(userId, surfaceId, pending);
        showToast('Dashboard layout was saved locally because server sync failed.', 'warning');
      }
    }, saveDebounceMs);
  }, [auth.settings, saveDebounceMs, surfaceId, userId]);

  const updateLayout = React.useCallback((updater: (prev: DashboardSurfaceLayout) => DashboardSurfaceLayout) => {
    setLayout((prev) => {
      const next = normalizeSurfaceLayout(updater(prev), cardIds);
      if (isLayoutEqual(prev, next)) return prev;
      persistLayout(next);
      return next;
    });
  }, [cardIds, persistLayout]);

  const toggleSelected = React.useCallback((itemId: string) => {
    setSelectedItemIds((prev) => (
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    ));
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelectedItemIds([]);
  }, []);

  const groupSelected = React.useCallback(() => {
    updateLayout((prev) => groupSelectedItems(prev, selectedItemIds));
    setSelectedItemIds([]);
  }, [selectedItemIds, updateLayout]);

  const splitSelected = React.useCallback(() => {
    updateLayout((prev) => splitSelectedGroups(prev, selectedItemIds));
    setSelectedItemIds([]);
  }, [selectedItemIds, updateLayout]);

  const resetLayout = React.useCallback(() => {
    const reset = normalizeSurfaceLayout(defaultLayout, cardIds);
    setLayout((prev) => {
      if (isLayoutEqual(prev, reset)) return prev;
      persistLayout(reset);
      return reset;
    });
    setSelectedItemIds([]);
  }, [cardIds, defaultLayout, persistLayout]);

  const reorder = React.useCallback((activeId: string, overId: string) => {
    updateLayout((prev) => reorderLayoutItems(prev, activeId, overId));
  }, [updateLayout]);

  return {
    layout,
    selectedItemIds,
    unlocked,
    rearrangeEnabled,
    setUnlocked,
    toggleSelected,
    clearSelection,
    groupSelected,
    splitSelected,
    resetLayout,
    reorder,
  };
}
