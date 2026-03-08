import type { Project } from '@/types/models';
import type { ProjectStatusDefinition } from '@/types/models';
import {
  FALLBACK_PROJECT_STATUS_DEFINITIONS,
  buildStatusDefinitionMap,
  defaultStatusLabelFromKey,
  hexToRgba,
  normalizeStatusKey,
} from './status.catalog';

export type ProjectStatus = Project['status'];

const FALLBACK_STATUS_MAP = buildStatusDefinitionMap(FALLBACK_PROJECT_STATUS_DEFINITIONS);

export const editableStatusOptions = FALLBACK_PROJECT_STATUS_DEFINITIONS
  .filter((item) => item.isActive)
  .map((item) => item.key) as readonly string[];

export const allStatusOptions = FALLBACK_PROJECT_STATUS_DEFINITIONS.map((item) => item.key) as readonly string[];

function readStatusDefinition(
  status?: string | null,
  definitionMap?: Record<string, ProjectStatusDefinition>
): ProjectStatusDefinition | null {
  const key = normalizeStatusKey(status);
  if (!key) return null;
  return definitionMap?.[key] || FALLBACK_STATUS_MAP[key] || null;
}

export const formatStatus = (
  status?: string | null,
  definitionMap?: Record<string, ProjectStatusDefinition>
): string => {
  const def = readStatusDefinition(status, definitionMap);
  if (def?.label) return def.label;
  return defaultStatusLabelFromKey(status);
};

export const getStatusColor = (
  status?: string | null,
  definitionMap?: Record<string, ProjectStatusDefinition>
): string => {
  const def = readStatusDefinition(status, definitionMap);
  return def?.colorHex || 'var(--chart-neutral)';
};

export const getStatusBgColor = (
  status?: string | null,
  definitionMap?: Record<string, ProjectStatusDefinition>
): string => {
  return hexToRgba(getStatusColor(status, definitionMap), 0.18);
};

export const getStatusBorderColor = (
  status?: string | null,
  definitionMap?: Record<string, ProjectStatusDefinition>
): string => {
  return hexToRgba(getStatusColor(status, definitionMap), 0.45);
};

export const isStatusEditable = (
  status?: string | null,
  editableKeys?: string[]
): boolean => {
  const key = normalizeStatusKey(status);
  if (!key) return false;
  if (editableKeys && editableKeys.length > 0) return editableKeys.includes(key);
  return editableStatusOptions.includes(key);
};
