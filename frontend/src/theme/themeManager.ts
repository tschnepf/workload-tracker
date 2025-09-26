export type Mode = 'light' | 'dark' | 'system';

const MODE_KEY = 'theme';
const SCHEME_KEY = 'colorScheme';

function root(): HTMLElement {
  return document.documentElement;
}

export function getMode(): Mode {
  try {
    const m = (localStorage.getItem(MODE_KEY) || '').toLowerCase();
    return (m === 'light' || m === 'dark' || m === 'system') ? (m as Mode) : 'system';
  } catch {
    return 'system';
  }
}

export function setMode(mode: Mode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
  applyMode(mode);
}

export function getColorScheme(): string {
  try { return (localStorage.getItem(SCHEME_KEY) || 'default'); } catch { return 'default'; }
}

export function setColorScheme(name: string): void {
  try { localStorage.setItem(SCHEME_KEY, name); } catch {}
  applyScheme(name);
}

export function applyMode(mode?: Mode): void {
  const m = mode || getMode();
  const el = root();
  let prefersDark = false;
  try { prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch {}
  const shouldDark = (m === 'dark') || (m === 'system' && prefersDark) || (m === undefined && prefersDark);
  if (shouldDark) el.classList.add('dark'); else el.classList.remove('dark');
}

export function applyScheme(name?: string): void {
  const el = root();
  let scheme = (name || getColorScheme() || 'default').toLowerCase();
  // Backward-compat aliases and removals
  if (scheme === 'smc-navy') scheme = 'navy';
  if (scheme === 'steel-cyan' || scheme === 'topbar') scheme = 'default';
  // Remove any previous theme-* classes
  Array.from(el.classList).forEach(cls => {
    if (cls.startsWith('theme-')) el.classList.remove(cls);
  });
  el.classList.add('theme-' + scheme);
}

export function bootFromDevQuery(search: string): void {
  try {
    const params = new URLSearchParams(search || window.location.search);
    const scheme = (params.get('colorScheme') || '').trim();
    if (scheme) {
      setColorScheme(scheme);
    } else {
      // Ensure at least default is applied if not present
      applyScheme('default');
    }
  } catch {
    // fallback to default
    applyScheme('default');
  }
}

export function boot(): void {
  applyMode();
  applyScheme();
}
