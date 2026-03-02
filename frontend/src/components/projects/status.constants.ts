import { FALLBACK_PROJECT_STATUS_DEFINITIONS, SPECIAL_PROJECT_STATUS_FILTER_TOKENS } from './status.catalog';

// Fallback options used before server definitions load.
export const statusOptions = [
  ...FALLBACK_PROJECT_STATUS_DEFINITIONS.filter((item) => item.isActive).map((item) => item.key),
  ...SPECIAL_PROJECT_STATUS_FILTER_TOKENS,
] as const;
