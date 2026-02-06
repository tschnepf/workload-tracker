// Helper utilities for parsing/serializing vertical filter URL params

function parseIntSafe(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Parse from a search string like '?vertical=3'
export function parseVerticalFromSearch(search: string): number | null {
  const sp = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const raw = sp.get('vertical');
  return parseIntSafe(raw);
}

// Apply vertical state to a URL (mutates provided instance).
export function applyVerticalToUrl(url: URL, verticalId: number | null) {
  const sp = url.searchParams;
  if (verticalId == null) {
    sp.delete('vertical');
  } else {
    sp.set('vertical', String(verticalId));
  }
}
