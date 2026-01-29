export type UtilizationLevel = 'empty' | 'blue' | 'green' | 'orange' | 'red';

export type UtilizationMode = 'absolute_hours' | 'percent';

export type UtilizationScheme = {
  mode: UtilizationMode;
  blue_min: number; blue_max: number;
  green_min: number; green_max: number;
  orange_min: number; orange_max: number;
  red_min: number;
  full_capacity_hours: number;
  zero_is_blank: boolean;
};

export const defaultUtilizationScheme: UtilizationScheme = {
  mode: 'absolute_hours',
  blue_min: 1, blue_max: 29,
  green_min: 30, green_max: 36,
  orange_min: 37, orange_max: 40,
  red_min: 41,
  full_capacity_hours: 36,
  zero_is_blank: true,
};

export function resolveUtilizationLevel(args: {
  hours?: number;
  capacity?: number | null;
  percent?: number;
  scheme: UtilizationScheme;
}): UtilizationLevel {
  const { hours, capacity, percent, scheme } = args;
  const h = Number.isFinite(hours as number) ? Math.max(0, Number(hours)) : 0;

  // Absolute hours mode uses hour buckets including explicit 'empty' when h === 0
  if (scheme.mode === 'absolute_hours') {
    if (h === 0) return 'empty';
    return classifyHours(h, scheme);
  }

  // Percent mode or fallback if capacity missing
  let p = Number.isFinite(percent as number) ? Number(percent) : undefined;
  if (p == null && capacity && capacity > 0) {
    p = (h / capacity) * 100;
  }
  if (p == null) {
    // Fallback to default percent scheme thresholds: <=70 blue? historic mapping was
    // available/optimal/high/red; we map to our colors: blue, green, orange, red
    return classifyPercent(0, { blue: 70, green: 85, orange: 100 });
  }
  return classifyPercent(p, { blue: 70, green: 85, orange: 100 });
}

function classifyHours(h: number, s: UtilizationScheme): UtilizationLevel {
  if (h >= s.red_min) return 'red';
  if (h >= s.orange_min && h <= s.orange_max) return 'orange';
  if (h >= s.green_min && h <= s.green_max) return 'green';
  if (h >= s.blue_min && h <= s.blue_max) return 'blue';
  // If outside configured bounds (shouldn't happen if contiguous), clamp
  if (h < s.blue_min) return 'blue';
  return 'red';
}

function classifyPercent(p: number, bands: { blue: number; green: number; orange: number }): UtilizationLevel {
  if (p <= bands.blue) return 'blue';
  if (p <= bands.green) return 'green';
  if (p <= bands.orange) return 'orange';
  return 'red';
}

export function utilizationLevelToClasses(level: UtilizationLevel): string {
  switch (level) {
    case 'empty':
      return 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--borderSubtle)]';
    case 'blue':
      return [
        'border',
        'bg-blue-100 text-blue-700 border-blue-300',
        'dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
      ].join(' ');
    case 'green':
      return [
        'border',
        'bg-emerald-100 text-emerald-700 border-emerald-300',
        'dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
      ].join(' ');
    case 'orange':
      return [
        'border',
        'bg-amber-100 text-amber-700 border-amber-300',
        'dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
      ].join(' ');
    case 'red':
      return [
        'border',
        'bg-red-100 text-red-700 border-red-300',
        'dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
      ].join(' ');
  }
}

export function utilizationLevelToTokens(level: UtilizationLevel): { bg: string; text: string; border?: string } {
  switch (level) {
    case 'empty':
      return { bg: 'var(--surface)', text: 'var(--muted)', border: 'var(--borderSubtle)' };
    case 'blue':
      return { bg: '#3b82f6', text: '#93c5fd' };
    case 'green':
      return { bg: '#10b981', text: '#6ee7b7' };
    case 'orange':
      return { bg: '#f59e0b', text: '#fbbf24' };
    case 'red':
      return { bg: '#ef4444', text: '#fca5a5' };
  }
}

export function formatUtilizationLabel(hours: number, zeroIsBlank: boolean): string {
  const h = Math.max(0, Math.round(Number(hours) || 0));
  if (h === 0 && zeroIsBlank) return '';
  return `${h}h`;
}

export function getUtilizationPill(args: {
  hours?: number;
  capacity?: number | null;
  percent?: number;
  scheme: UtilizationScheme;
  output: 'classes' | 'token';
}): { level: UtilizationLevel; classes?: string; tokens?: { bg: string; text: string; border?: string }; label: string } {
  const { hours, capacity, percent, scheme, output } = args;
  const level = resolveUtilizationLevel({ hours, capacity, percent, scheme });
  const label = formatUtilizationLabel(Number(hours) || 0, scheme.zero_is_blank);
  if (output === 'classes') {
    return { level, classes: utilizationLevelToClasses(level), label };
  }
  return { level, tokens: utilizationLevelToTokens(level), label };
}
