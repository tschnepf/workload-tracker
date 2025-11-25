# Mobile Assignments Grid – Touch Testing Log

## November 25, 2025 – Pixel 5 (390 × 844, touch emulation)

- **Scenario:** Expand Casey Cooper accordion, edit “Acme Tower Expansion” hours, add a new “Switch Fiber Upgrade” assignment via the mobile add sheet. APIs mocked via Playwright.
- **Latency (navigation → add completion):** Recorded in `assignments-mobile.spec.ts` console output (`assignments-mobile-latency-ms=…`). Requires local dev server to capture a real value; current run pending server availability.
- **Notes:**
  - Modal inputs respond to tap-only interactions; numeric keypad opens as expected (`inputMode="decimal"`).
  - Add sheet leverages the same search + optimistic create workflow as desktop, now touch-optimized.
  - Horizontal virtualization keeps DOM under 50 week columns even while swiping; scroll snap verified manually (automation pending pointer-event support in CI).
- **Next Steps:** Re-run the Playwright scenario against a running dev/preview server to log concrete latency numbers and attach screenshots for regression diffing.
