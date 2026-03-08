## Summary

- What changed:
- Why:

## Frontend Consistency and Accessibility Checklist

- [ ] UI colors are tokenized (`--color-*`) or approved chart tokens (`--chart-*`).
- [ ] No non-allowlisted hardcoded style violations (`npm run check:ui-hardcoded` passes).
- [ ] Interactive controls keep visible `:focus-visible` states.
- [ ] Shared UI primitives are used where applicable (`src/components/ui/*`).
- [ ] Reused UI text uses centralized copy (`src/copy/index.ts` + `t()`).
- [ ] Updated routes/components were verified for keyboard flow and readable contrast.

## Validation

- [ ] `npm run check:ui-hardcoded`
- [ ] `npm run test`
- [ ] Other checks run:

## Risk / Rollback

- Risk notes:
- Rollback plan:
