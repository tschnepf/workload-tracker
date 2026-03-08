/**
 * Frontend theme contract.
 * This is the single typed source of truth for semantic token names used by UI code.
 */

export const THEME_TOKEN_GROUPS = {
  color: [
    'color-bg',
    'color-surface',
    'color-surface-elevated',
    'color-surface-overlay',
    'color-surface-hover',
    'color-card-hover',
    'color-border',
    'color-border-subtle',
    'color-border-overlay',
    'color-text-primary',
    'color-text-secondary',
    'color-focus-ring',
    'color-state-info',
    'color-state-success',
    'color-state-warning',
    'color-state-danger',
    'color-action-primary',
    'color-action-primary-hover',
  ],
  space: [
    'space-1',
    'space-2',
    'space-3',
    'space-4',
    'space-5',
    'space-6',
  ],
  radius: [
    'radius-xs',
    'radius-sm',
    'radius-md',
    'radius-lg',
    'radius-xl',
  ],
  elevation: [
    'elevation-1',
    'elevation-2',
    'elevation-3',
  ],
  chart: [
    'chart-person',
    'chart-project',
    'chart-client',
    'chart-neutral',
    'chart-accent-a',
    'chart-accent-b',
    'chart-accent-c',
    'chart-phase-bulletin',
    'chart-phase-cd',
    'chart-phase-dd',
    'chart-phase-ifc',
    'chart-phase-ifp',
    'chart-phase-masterplan',
    'chart-phase-sd',
    'chart-phase-milestone',
  ],
} as const;

export type ThemeTokenGroup = keyof typeof THEME_TOKEN_GROUPS;
export type ThemeTokenName = (typeof THEME_TOKEN_GROUPS)[ThemeTokenGroup][number];

export const THEME_COLOR_SCHEMES = ['default', 'light', 'navy', 'triad', 'midnight', 'sky'] as const;
export type ThemeColorScheme = (typeof THEME_COLOR_SCHEMES)[number];

export function cssVar(token: ThemeTokenName): string {
  return `var(--${token})`;
}
