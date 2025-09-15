/**
 * Date utilities for consistent UTC -> local formatting
 * Backend emits ISO-8601 in UTC; frontend formats for user locale.
 */

export function formatUtcToLocal(
  iso: string | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const formatter = new Intl.DateTimeFormat(undefined, opts ?? { dateStyle: 'medium' });
    return formatter.format(d);
  } catch {
    return '';
  }
}

