import type { ProjectStatusDefinition } from '@/types/models';

export const FALLBACK_PROJECT_STATUS_DEFINITIONS: ProjectStatusDefinition[] = [
  { key: 'planning', label: 'Planning', colorHex: '#60a5fa', includeInAnalytics: false, treatAsCaWhenNoDeliverable: false, isSystem: true, isActive: true, sortOrder: 10, canDelete: false, inUseCount: 0 },
  { key: 'active', label: 'Active', colorHex: '#34d399', includeInAnalytics: true, treatAsCaWhenNoDeliverable: false, isSystem: true, isActive: true, sortOrder: 20, canDelete: false, inUseCount: 0 },
  { key: 'active_ca', label: 'Active CA', colorHex: '#60a5fa', includeInAnalytics: true, treatAsCaWhenNoDeliverable: true, isSystem: true, isActive: true, sortOrder: 30, canDelete: false, inUseCount: 0 },
  { key: 'on_hold', label: 'On Hold', colorHex: '#f59e0b', includeInAnalytics: false, treatAsCaWhenNoDeliverable: false, isSystem: true, isActive: true, sortOrder: 40, canDelete: false, inUseCount: 0 },
  { key: 'completed', label: 'Completed', colorHex: '#9ca3af', includeInAnalytics: false, treatAsCaWhenNoDeliverable: false, isSystem: true, isActive: true, sortOrder: 50, canDelete: false, inUseCount: 0 },
  { key: 'cancelled', label: 'Cancelled', colorHex: '#ef4444', includeInAnalytics: false, treatAsCaWhenNoDeliverable: false, isSystem: true, isActive: true, sortOrder: 60, canDelete: false, inUseCount: 0 },
  { key: 'inactive', label: 'Inactive', colorHex: '#64748b', includeInAnalytics: false, treatAsCaWhenNoDeliverable: false, isSystem: true, isActive: true, sortOrder: 70, canDelete: false, inUseCount: 0 },
];

export const SPECIAL_PROJECT_STATUS_FILTER_TOKENS = [
  'active_with_dates',
  'active_no_deliverables',
  'no_assignments',
  'missing_qa',
  'Show All',
] as const;

export const DEFAULT_PROJECT_STATUS_FILTER_KEYS = ['active', 'active_ca'] as const;

export function normalizeStatusKey(status: string | null | undefined): string {
  return (status || '').trim().toLowerCase();
}

export function buildStatusDefinitionMap(definitions: ProjectStatusDefinition[]): Record<string, ProjectStatusDefinition> {
  const map: Record<string, ProjectStatusDefinition> = {};
  for (const item of definitions) {
    const key = normalizeStatusKey(item.key);
    if (!key) continue;
    map[key] = item;
  }
  return map;
}

export function defaultStatusLabelFromKey(status: string | null | undefined): string {
  const key = normalizeStatusKey(status);
  if (!key) return 'Unknown';
  if (key === 'active_ca') return 'Active CA';
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = (hex || '').trim().toLowerCase();
  const match = /^#([0-9a-f]{6})$/.exec(normalized);
  if (!match) return `rgba(100, 116, 139, ${alpha})`;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
