Utilization Scheme — Contract and Helper Signatures

Goal
- Provide a single, well‑defined scheme for mapping utilization (hours or percent) to semantic levels and UI colors.
- Support both Tailwind class consumers and theme token consumers without duplicating logic.

TypeScript Interfaces

```ts
export type UtilizationLevel = 'empty' | 'blue' | 'green' | 'orange' | 'red';

export type UtilizationMode = 'absolute_hours' | 'percent';

export interface UtilizationRange {
  id: 'blue' | 'green' | 'orange' | 'red';
  min: number;      // inclusive
  max?: number;     // inclusive, optional for open upper bound (red)
}

export interface UtilizationScheme {
  mode: UtilizationMode;            // default: 'absolute_hours'
  ranges: UtilizationRange[];       // ordered, contiguous, non‑overlapping
  zeroIsBlank: boolean;             // default: true
  version?: number;                 // server‑managed
  updatedAt?: string;               // server‑managed ISO timestamp
}
```

Helpers (signatures)

```ts
export function resolveUtilizationLevel(args: {
  hours?: number;
  capacity?: number | null;
  percent?: number;                // optional, used as fallback
  scheme: UtilizationScheme;
}): UtilizationLevel;

export function utilizationLevelToClasses(level: UtilizationLevel): string;

export function utilizationLevelToTokens(level: UtilizationLevel): {
  bg: string;                      // CSS color value (hex or var)
  text: string;
  border?: string;
};

export function formatUtilizationLabel(hours: number, zeroIsBlank: boolean): string;  // e.g., "15h" or ""

export function getUtilizationPill(args: {
  hours?: number;
  capacity?: number | null;
  percent?: number;
  scheme: UtilizationScheme;
  output: 'classes' | 'token';
}): { level: UtilizationLevel; classes?: string; tokens?: { bg: string; text: string; border?: string }; label: string };
```

Behavior Notes
- Inclusive boundaries: values falling exactly on min/max map deterministically.
- Negative hours are clamped to 0; NaNs map to 'empty'.
- Fallback policy: when mode is 'absolute_hours' but capacity is unknown and only percent is available, classify via a default percent scheme equivalent to today’s behavior (<=70, <=85, <=100, >100).
- Zero handling: when `zeroIsBlank` is true, labels are blank but pill size stays fixed; provide `aria-label` with hours for accessibility.

Output Strategies
- Use `utilizationLevelToClasses` for Tailwind components.
- Use `utilizationLevelToTokens` for theme token / inline style components.

Testing Guidance
- Boundary cases to cover: 0, 1, 29, 30, 36, 37, 40, 41 (using default ranges).
- Snapshot class/token outputs per level to prevent drift.

