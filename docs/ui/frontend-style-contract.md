# Frontend Theme and Accessibility Contract

This document defines the mandatory style contract for `frontend/src`.

## Core rules
1. Use semantic CSS variables only for UI colors and surfaces:
`--color-*`, `--space-*`, `--radius-*`, `--elevation-*`.
2. Do not hardcode raw hex colors, ad hoc shadows, or arbitrary spacing in app UI code.
3. Use shared UI primitives under `frontend/src/components/ui` for common controls.
4. Any `focus:outline-none` must include a visible `focus-visible` ring using semantic tokens.
5. Use typed copy keys from `frontend/src/copy/index.ts` for repeated/system UI text.

## Theme sources of truth
1. CSS token values and scheme mappings: `frontend/src/styles/themes.css`.
2. Typed token contract and scheme names: `frontend/src/theme/contract.ts`.
3. Runtime mode/scheme application: `frontend/src/theme/themeManager.ts`.

## Allowed hardcoded values
Hardcoded values are only acceptable when:
1. They are true data-visual encodings that cannot map to semantic UI tokens.
2. They are explicitly allowlisted in `frontend/scripts/ui-hardcoded-allowlist.json`.
3. The allowlist entry includes rationale and owner.

## Accessibility minimums
1. Interactive controls must have keyboard-visible focus state.
2. Text and focus contrast must remain readable across all supported schemes.
3. Native semantics are preferred (`button`, `input`, `select`) over generic roles.

## Enforcement
Run:
1. `npm run check:ui-hardcoded`
2. `npm run lint`
3. `npm run test:run`

These checks are expected to fail the build on contract violations.
