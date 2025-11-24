// Runtime flag helper with Vite env defaults and localStorage overrides

const FLAG_ENV_MAP = {
  NAV_PROGRESS: 'VITE_NAV_PROGRESS',
  ROUTE_PREFETCH: 'VITE_ROUTE_PREFETCH',
  VIEW_TRANSITIONS: 'VITE_VIEW_TRANSITIONS',
  VIRTUALIZED_GRID: 'VITE_VIRTUALIZED_GRID',
  PREFETCH_CONCURRENCY: 'VITE_PREFETCH_CONCURRENCY',
  NAV_PENDING_OVERLAY: 'VITE_NAV_PENDING_OVERLAY',
  PERSONAL_DASHBOARD: 'VITE_PERSONAL_DASHBOARD',
  COMPACT_ASSIGNMENT_HEADERS: 'VITE_COMPACT_ASSIGNMENT_HEADERS',
  MOBILE_UI_DASHBOARD: 'VITE_MOBILE_UI_DASHBOARD',
  MOBILE_UI_PERSONAL: 'VITE_MOBILE_UI_PERSONAL',
  MOBILE_UI_ASSIGNMENTS_GRID: 'VITE_MOBILE_UI_ASSIGNMENTS_GRID',
  MOBILE_UI_PROJECT_ASSIGNMENTS_GRID: 'VITE_MOBILE_UI_PROJECT_ASSIGNMENTS_GRID',
  MOBILE_UI_ASSIGNMENT_LIST: 'VITE_MOBILE_UI_ASSIGNMENT_LIST',
  MOBILE_UI_ASSIGNMENT_FORM: 'VITE_MOBILE_UI_ASSIGNMENT_FORM',
  MOBILE_UI_PROJECTS: 'VITE_MOBILE_UI_PROJECTS',
  MOBILE_UI_PROJECT_FORM: 'VITE_MOBILE_UI_PROJECT_FORM',
  MOBILE_UI_PEOPLE: 'VITE_MOBILE_UI_PEOPLE',
  MOBILE_UI_PERSON_FORM: 'VITE_MOBILE_UI_PERSON_FORM',
  MOBILE_UI_DEPARTMENTS: 'VITE_MOBILE_UI_DEPARTMENTS',
  MOBILE_UI_MANAGER_DASHBOARD: 'VITE_MOBILE_UI_MANAGER_DASHBOARD',
  MOBILE_UI_DEPARTMENT_HIERARCHY: 'VITE_MOBILE_UI_DEPARTMENT_HIERARCHY',
  MOBILE_UI_DEPARTMENT_REPORTS: 'VITE_MOBILE_UI_DEPARTMENT_REPORTS',
  MOBILE_UI_DELIVERABLES_CALENDAR: 'VITE_MOBILE_UI_DELIVERABLES_CALENDAR',
  MOBILE_UI_TEAM_FORECAST: 'VITE_MOBILE_UI_TEAM_FORECAST',
  MOBILE_UI_PERSON_EXPERIENCE: 'VITE_MOBILE_UI_PERSON_EXPERIENCE',
  MOBILE_UI_ROLE_CAPACITY: 'VITE_MOBILE_UI_ROLE_CAPACITY',
  MOBILE_UI_SKILLS: 'VITE_MOBILE_UI_SKILLS',
  MOBILE_UI_PERFORMANCE: 'VITE_MOBILE_UI_PERFORMANCE',
  MOBILE_UI_SETTINGS: 'VITE_MOBILE_UI_SETTINGS',
  MOBILE_UI_PROFILE: 'VITE_MOBILE_UI_PROFILE',
  MOBILE_UI_AUTH_LOGIN: 'VITE_MOBILE_UI_AUTH_LOGIN',
  MOBILE_UI_AUTH_RESET_PASSWORD: 'VITE_MOBILE_UI_AUTH_RESET_PASSWORD',
  MOBILE_UI_AUTH_SET_PASSWORD: 'VITE_MOBILE_UI_AUTH_SET_PASSWORD',
  MOBILE_UI_HELP: 'VITE_MOBILE_UI_HELP',
} as const;

export type FlagName = keyof typeof FLAG_ENV_MAP;

function readEnv(key: string): string | undefined {
  try {
    // Vite runtime
    const env: any = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
    if (env && key in env) return String(env[key]);
  } catch {}
  try {
    // Node env (SSR or tests)
    if (typeof process !== 'undefined' && process.env && key in process.env) return String(process.env[key]);
  } catch {}
  return undefined;
}

function readRuntimeOverride(name: FlagName): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const lsKey = `flags.${name}`;
    const raw = window.localStorage.getItem(lsKey);
    if (raw != null) return raw;
    // Optional global runtime config object
    const w = window as any;
    if (w.__APP_FLAGS && name in w.__APP_FLAGS) return String(w.__APP_FLAGS[name]);
  } catch {}
  return undefined;
}

export function getFlag(name: FlagName, fallback?: boolean): boolean {
  const override = readRuntimeOverride(name);
  if (override != null) return override === 'true' || override === '1';
  const envVal = readEnv(FLAG_ENV_MAP[name]);
  if (envVal != null) return envVal === 'true' || envVal === '1';
  return Boolean(fallback);
}

export function getNumberFlag(name: FlagName, fallback?: number): number {
  const override = readRuntimeOverride(name);
  if (override != null && !Number.isNaN(Number(override))) return Number(override);
  const envVal = readEnv(FLAG_ENV_MAP[name]);
  if (envVal != null && !Number.isNaN(Number(envVal))) return Number(envVal);
  return typeof fallback === 'number' ? fallback : 0;
}

export function setRuntimeFlag(name: FlagName, value: boolean | number | string) {
  if (typeof window === 'undefined') return;
  try {
    const lsKey = `flags.${name}`;
    window.localStorage.setItem(lsKey, String(value));
  } catch {}
}
