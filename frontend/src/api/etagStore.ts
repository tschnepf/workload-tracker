// Shared ETag store across legacy and typed clients
// Normalizes keys to canonical path with trailing slash and no query string.

function normalizeKey(input: string): string {
  try {
    // If it's a full URL, parse; otherwise treat as path
    const url = input.startsWith('http') ? new URL(input) : new URL(input, 'http://local');
    let p = url.pathname || '';
    if (!p.endsWith('/')) p += '/';
    return p;
  } catch {
    // Fallback: ensure trailing slash and strip query manually
    const [p] = input.split('?');
    return p.endsWith('/') ? p : `${p}/`;
  }
}

const store = new Map<string, string>();

export const etagStore = {
  get: (key: string): string | undefined => store.get(normalizeKey(key)),
  set: (key: string, etag: string): void => {
    store.set(normalizeKey(key), etag);
  },
  delete: (key: string): void => {
    store.delete(normalizeKey(key));
  },
  clear: (): void => {
    store.clear();
  },
  normalize: normalizeKey,
};
