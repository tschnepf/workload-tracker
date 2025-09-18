export function resolveApiBase(raw?: string): string {
  const fallback = (typeof window !== 'undefined' && window.location)
    ? `${window.location.origin.replace(/\/$/, '')}/api`
    : 'http://localhost:8000/api';

  if (!raw || raw.trim() === '') {
    if (typeof window !== 'undefined' && window.location) {
      console.info('[apiBase] using fallback', fallback);
    }
    return fallback;
  }

  const value = raw.trim();

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin.replace(/\/$/, '');
      const resolved = `${origin}${value}`;
      console.info('[apiBase] using relative base', resolved);
      return resolved;
    }
    return value;
  }

  try {
    const url = new URL(value);
    if (!url.hostname) throw new Error('empty-host');
    return value;
  } catch {
    if (typeof window !== 'undefined' && window.location) {
      console.warn('[apiBase] invalid base', value, 'falling back to', fallback);
    }
    return fallback;
  }
}
