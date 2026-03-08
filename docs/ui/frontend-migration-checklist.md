# Frontend Migration Checklist

Use this checklist for every frontend UI change that touches `src/pages`, `src/components`, or `src/features`.

## Theme and Tokens

- [ ] All colors use semantic tokens (`var(--color-*)`) or approved chart tokens (`var(--chart-*)`).
- [ ] No raw hex values in page/component/feature code unless explicitly allowlisted for data-viz.
- [ ] Radius, spacing, and elevation use tokenized values (`--radius-*`, `--space-*`, `--elevation-*`).
- [ ] No arbitrary Tailwind shadow/radius/spacing values unless tokenized with `var(--token)`.

## Focus and Accessibility

- [ ] Every interactive control has visible `:focus-visible` treatment.
- [ ] `focus:outline-none` is only used with tokenized visible focus replacement.
- [ ] Interactive text is readable (avoid sub-12px interactive labels unless non-interactive metadata).
- [ ] Keyboard-only navigation works for all updated controls.
- [ ] Contrast remains readable in all supported color schemes.

## Shared Primitives

- [ ] Prefer shared UI primitives from `src/components/ui/*` for controls.
- [ ] New bespoke control styles are avoided when a primitive variant can be used.
- [ ] State styles (hover/active/disabled/error) are tokenized.

## Copy

- [ ] Reused UI strings are centralized through `src/copy/index.ts` and `t()`.
- [ ] Added copy keys are typed and preserve current English output.
- [ ] Interpolated copy uses typed params.

## Verification

- [ ] `npm run check:ui-hardcoded` passes.
- [ ] Related tests pass (`npm run test` at minimum).
- [ ] A11y coverage is updated for touched critical routes/components when behavior changes.
- [ ] Any allowlist additions include an explicit data-viz justification.
