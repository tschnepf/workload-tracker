// Global feature flags (single source of truth)
// Keep flags explicit and typed; prefer environment-based overrides for rollout control.

const normalizeBoolean = (value: string | boolean | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
};

const readEnvFlag = (key: string, fallback: boolean): boolean => {
  let viteEnv: Record<string, string | boolean | undefined> | undefined;
  if (typeof import.meta !== 'undefined' && (import.meta as any)?.env) {
    viteEnv = (import.meta as any).env as Record<string, string | boolean | undefined>;
  }
  const viteValue = viteEnv ? viteEnv[key] : undefined;
  if (viteValue !== undefined) {
    return normalizeBoolean(viteValue, fallback);
  }
  if (typeof process !== 'undefined' && process.env) {
    return normalizeBoolean(process.env[key], fallback);
  }
  return fallback;
};

export const FEATURE_USE_NEW_SELECTION_HOOK_PROJECT = true;  // enable for project-centric grid only
export const FEATURE_USE_NEW_SELECTION_HOOK_PEOPLE = false;  // migrate after parity is verified

// FullCalendar rollout gates (default to false until each surface ships)
export const FEATURE_FULLCALENDAR_MYWORK = readEnvFlag('VITE_FEATURE_FULLCALENDAR_MYWORK', false);
export const FEATURE_FULLCALENDAR_ADMIN = readEnvFlag('VITE_FEATURE_FULLCALENDAR_ADMIN', false);

// In future, consider persisting flags for QA via localStorage or URL param if needed.
