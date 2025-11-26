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

/**
 * Format a date string with weekday, e.g., "Mon, Nov 10, 2025".
 * Accepts ISO date or YYYY-MM-DD. Returns empty string on invalid input.
 */
export function formatDateWithWeekday(
  iso: string | null | undefined,
  includeYear: boolean = true
): string {
  if (!iso) return '';
  try {
    const trimmed = iso.trim();
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      d = new Date(year, (month || 1) - 1, day || 1);
    } else {
      d = new Date(trimmed);
    }
    if (Number.isNaN(d.getTime())) return '';
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    };
    if (includeYear) opts.year = 'numeric';
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  } catch {
    return '';
  }
}
