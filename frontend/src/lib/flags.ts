// Runtime flag helper with Vite env defaults and localStorage overrides

type FlagName =
  | 'NAV_PROGRESS'
  | 'ROUTE_PREFETCH'
  | 'VIEW_TRANSITIONS'
  | 'VIRTUALIZED_GRID'
  | 'PREFETCH_CONCURRENCY'
  | 'NAV_PENDING_OVERLAY'
  | 'PERSONAL_DASHBOARD'
  | 'COMPACT_ASSIGNMENT_HEADERS';

const ENV_KEYS: Record<FlagName, string> = {
  NAV_PROGRESS: 'VITE_NAV_PROGRESS',
  ROUTE_PREFETCH: 'VITE_ROUTE_PREFETCH',
  VIEW_TRANSITIONS: 'VITE_VIEW_TRANSITIONS',
  VIRTUALIZED_GRID: 'VITE_VIRTUALIZED_GRID',
  PREFETCH_CONCURRENCY: 'VITE_PREFETCH_CONCURRENCY',
  NAV_PENDING_OVERLAY: 'VITE_NAV_PENDING_OVERLAY',
  PERSONAL_DASHBOARD: 'VITE_PERSONAL_DASHBOARD',
  COMPACT_ASSIGNMENT_HEADERS: 'VITE_COMPACT_ASSIGNMENT_HEADERS',
};

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
  const envVal = readEnv(ENV_KEYS[name]);
  if (envVal != null) return envVal === 'true' || envVal === '1';
  return Boolean(fallback);
}

export function getNumberFlag(name: FlagName, fallback?: number): number {
  const override = readRuntimeOverride(name);
  if (override != null && !Number.isNaN(Number(override))) return Number(override);
  const envVal = readEnv(ENV_KEYS[name]);
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
