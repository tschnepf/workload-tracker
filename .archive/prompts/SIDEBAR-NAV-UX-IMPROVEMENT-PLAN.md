# Sidebar Navigation UX Improvement Plan

A phased, prescriptive plan to make sidebar link clicks feel instant, communicative, and smooth — addressing lazy route chunk loads, heavy page mounts, and lack of global navigation feedback.

Goals
- Immediate feedback on click (~150ms): visible progress indicator in the chrome (header/sidebar), not just in content.
- Predictable, fast first paint: show skeletons while data loads and defer heavy work until after first paint.
- Reduce perceived latency: prefetch route chunks and warm key queries on link hover.
- Keep accessibility strong: indicators are perceivable, announced, and keyboard-friendly.

Success Criteria
- On first navigation to any route, a top progress indicator becomes visible within 150ms.
- Skeleton content appears within 200ms, then replaces with real content once data arrives.
- Measure a baseline first-interaction nav time and improve it by ≥ 20%; subsequent cached navs target < 500ms.

---

## Phase 0 — Foundation (Router/Layout/Monitoring)

Verify router hooks, injection points, and monitoring so subsequent phases are compatible with the current app.

Deliverables
- Confirm we are using React Router v6.4+ Data Router and can import `useNavigation` from `react-router-dom`.
- Confirm a central layout exists and is used by pages (`components/layout/Layout.tsx`) and is the correct injection point for any chrome indicators.
- Decide to extend the existing monitoring in `utils/monitoring` for nav timing (avoid parallel systems).

Agent Implementation Prompt
```
Task: Verify router/Layout/monitoring foundations.

Steps:
1) In src/main.tsx, confirm routes are created with `createBrowserRouter` and check the installed React Router version.
2) In src/components/layout/Layout.tsx, confirm header area where we can render a fixed, top-edge progress bar.
3) In src/utils/monitoring (or equivalent), confirm entry points to extend with navigation timing (do not create a separate telemetry system).
4) Document that `useNavigation` should be imported from `react-router-dom` (Data Router APIs live in react-router-dom for v6.4+).
```

---

## Phase 1 — Global Navigation Feedback

Add a lightweight top progress bar bound to the router’s navigation state so users immediately see feedback after clicking a sidebar link (and during any data-driven navigations that don’t swap chunks).

Deliverables
- `src/components/ui/TopProgress.tsx` that animates on pending navigation and announces status to screen readers.
- Wire `TopProgress` into the global chrome (via a portal) so it is not clipped by layout containers.

Agent Implementation Prompt
```
Task: Add a router-bound top progress bar that shows when navigation is pending (React Router v6.4+ compatible) and is accessible.

Files to edit/add:
1) Add src/components/ui/TopProgress.tsx
   - Export a component that:
     - Uses the router navigation state (import { useNavigation } from 'react-router-dom') to detect `state !== 'idle'`.
     - Applies a show-delay of ~120–150ms to avoid flicker on fast navigations.
     - Enforces a minimum visible time of ~200–300ms once shown, then hides.
     - Renders a thin fixed bar at the very top with CSS-driven indeterminate animation.
     - Respects reduced motion (prefers-reduced-motion).
     - Announces status only on idle→pending transitions via a visually hidden `role="status"` with `aria-live="polite"`.
     - Renders via a portal to `document.body` with `position: fixed; top: 0; left: 0; right: 0; height: 2-3px; z-index` above the header.
2) Edit src/components/layout/Layout.tsx
   - Include <TopProgress /> at layout mount (no reflow of header content; position is fixed via portal).

Constraints:
- Keep styles inline or Tailwind (consistent with project).
- Do not block rendering; component must be as light as possible.
```

---

## Phase 2 — Route Chunk Prefetch on Hover

Prefetch lazy route chunks on link hover to avoid “stall on first click.”

Deliverables
- `src/routes/prefetch.ts` exposing `prefetchRoute(path: string): void` that locates the matched route and triggers its `lazy`/dynamic import.
- Update `Sidebar.tsx` to call `prefetchRoute(path)` on `onMouseEnter` and `onFocus` with an intent delay.

Agent Implementation Prompt
```
Task: Prefetch route chunks on hover/focus using the existing lazy importers without duplicating route mappings.

Files to add/edit:
1) Add src/routes/prefetch.ts
   - Export `prefetchRoute(path: string): void`.
   - Use `matchRoutes(router.routes, path)` (or equivalent) to find matched routes.
   - If a matched route has a `lazy` or a dynamic import, call it to warm the chunk.
   - Deduplicate in-flight prefetches and keep a simple in-memory set of prefetched paths.
   - Add a small intent delay (~100–150ms) before prefetching to avoid accidental hovers.
   - Gate by auth (only when authenticated) and by connection heuristics (skip when `navigator.connection?.saveData` is true or `effectiveType` is slow like '2g').
   - Catch and ignore errors (prefetch is best-effort; do not surface errors to users).
2) Edit src/components/layout/Sidebar.tsx
   - For every <Link to={item.path}> add onMouseEnter and onFocus handlers to call `prefetchRoute(item.path)`.

Constraints:
- No behavior change besides prefetch; do not navigate on hover.
- Handle dynamic/param routes via pattern matching, not strict string equality.
```

---

## Phase 3 — Page Skeletons (Assignments, Projects, Departments)

Show lightweight skeletons immediately after navigation so the page feels responsive while data is fetched and heavy UI mounts.

Deliverables
- Skeleton components `src/components/skeletons/{Assignments,Projects,Departments}Skeleton.tsx` with minimal boxes.
- Integrate skeletons into respective pages using existing loading states (react-query `isLoading`/`isFetching`).

Agent Implementation Prompt
```
Task: Add skeleton components and render them while primary data queries are loading.

Files to add:
- src/components/skeletons/AssignmentsSkeleton.tsx
- src/components/skeletons/ProjectsSkeleton.tsx
- src/components/skeletons/DepartmentsSkeleton.tsx

Files to edit:
- src/pages/Assignments/AssignmentGrid.tsx
- src/pages/Projects/index.tsx (or relevant list component)
- src/pages/Departments/DepartmentsList.tsx

Instructions:
1) Import the skeleton component in each page.
2) Replace current "Loading..." text with the skeleton when the initial query is `isLoading`.
3) Keep pagination/toolbars visible if inexpensive, but avoid SSR-incompatible APIs.
4) Use skeletons where initial load regularly exceeds ~200–300ms; otherwise keep current lightweight loaders.
```

---

## Phase 4 — Defer Heavy Work Until After First Paint (Measured)

Avoid long main-thread blocks on initial page mount (e.g., deriving deliverable bars, large per-row computations).

Deliverables
- Profile AssignmentGrid and other heavy pages under CPU throttling to identify mount-time blockers.
- Wrap expensive derivations in `useMemo` and schedule with `requestIdleCallback` (fallback to setTimeout) after first paint.
- Use small progressive rendering (first render minimal rows, then hydrate additional visuals).

Agent Implementation Prompt
```
Task: Defer expensive computations in AssignmentGrid to post-paint and memoize results.

Files to edit:
- src/pages/Assignments/AssignmentGrid.tsx

Steps:
1) Profile to identify hot paths on initial mount (React Profiler + DevTools 4x CPU throttle).
2) Abstract deliverable bar derivation into a pure function.
3) Memoize per-assignment results with `useMemo` keyed by project/week arrays.
4) On mount, schedule a `requestIdleCallback` (with setTimeout fallback) to compute non-critical visuals; before that, render a minimal row to get first paint.
5) Guard effects with flags to avoid recomputing on every minor state change.
6) Feature-detect `requestIdleCallback`; cancel callbacks on unmount; no polyfill is required, but keep the setTimeout fallback.
```

---

## Phase 5 — Query Prefetching (Stale-While-Revalidate)

Warm queries for the destination route on hover so data is available faster on navigation.

Deliverables
- A central `prefetchDataForRoute(path)` that uses react-query’s `queryClient.prefetchQuery` for the route’s primary endpoints.
- Hook it into Sidebar hover alongside chunk prefetch.

Agent Implementation Prompt
```
Task: Prefetch page data via react-query on link hover.

Files to add/edit:
1) Add src/routes/prefetchData.ts with `prefetchDataForRoute(path: string, client: QueryClient)`.
   - Implement per-route prefetch for commonly viewed pages (e.g., assignments list/grid, projects list).
   - Use explicit react-query settings: e.g., `staleTime: 30_000` and a modest `cacheTime`.
   - Avoid double-fetch with route loaders; choose a primary source of truth and integrate (e.g., provide `initialData` from loader or unify on react-query).
2) Edit src/components/layout/Sidebar.tsx
   - In hover/focus handlers, call both `prefetchRoute(path)` and `prefetchDataForRoute(path, queryClient)`.
3) Access a shared QueryClient via a minimal context or import from `lib/queryClient`.

Constraints:
- Only prefetch when authenticated; handle errors silently.
- Gate by connection heuristics and apply the same hover intent delay used for chunk prefetch.
```

---

## Phase 6 — Virtualization (Rows/Columns) [Feature-Flagged]

Reduce DOM work and layout thrash for large grids with row virtualization.

Deliverables
- Use `@tanstack/react-virtual` (already in deps) for row virtualization in AssignmentGrid.
- Gate behind `VITE_VIRTUALIZED_GRID=true` to allow staged rollout.

Agent Implementation Prompt
```
Task: Add row virtualization to AssignmentGrid behind a feature flag.

Files to edit:
- src/pages/Assignments/AssignmentGrid.tsx

Steps:
1) Read feature flag from `import.meta.env.VITE_VIRTUALIZED_GRID`.
2) If enabled, render visible rows using `useVirtualizer` based on container height.
3) Keep keyboard navigation and focus management intact; update ARIA if necessary.
4) Provide a fallback (non-virtualized) path when flag is off.
```

---

## Phase 7 — A11y and UX Validation

Ensure changes are perceivable, operable, and predictable.

Checklist
- Progress bar visible within ~150ms of navigation (inspect with throttled CPU) and announces status via aria-live (no announcement spam).
- Skeletons have sufficient contrast and, where appropriate, are announced as "loading" via aria-live.
- Sidebar links retain correct ARIA and keyboard focus moves predictably.

Agent Validation Prompt
```
Task: Validate accessibility and UX of navigation improvements.

Steps:
1) Run Lighthouse and axe on the main routes to confirm no regressions.
2) Test keyboard-only navigation: tab to link, press Enter; ensure progress indicator appears and focus lands in main content.
3) With DevTools CPU throttling (4x), confirm progress bar shows within ~150ms (or first meaningful feedback within 150–200ms) and skeleton appears soon after.
```

---

## Phase 8 — Telemetry and Measurement (Extend Existing Monitoring)

Add basic performance traces to measure improvements.

Deliverables
- In the existing monitoring module (`utils/monitoring`), capture navigation start/complete timestamps and log deltas.
- Emit a small counter for "navigation > 1.5s" to analyze outliers.

Agent Implementation Prompt
```
Task: Add simple navigation timing telemetry.

Files to edit:
- src/utils/monitoring (extend existing)
- src/components/layout/Sidebar.tsx (emit start) or use a router listener

Steps:
1) On link click, record start time; on route ready (Outlet painted), record end (rAF after paint for consistency).
2) Log to console in dev and send to Sentry (breadcrumb) when > 1.5s.
```

---

## Phase 9 — Rollout & Flags

Flags (Vite env defaults)
- `VITE_NAV_PROGRESS=true` (default true): show top progress bar.
- `VITE_ROUTE_PREFETCH=true` (default true): enable chunk/data prefetch.
- `VITE_VIRTUALIZED_GRID=false` (default false): enable virtualization.

Important: Vite env flags are compile-time defaults. Changing them requires a rebuild/redeploy. If instant toggles are required, add a runtime override (e.g., merge env defaults with `localStorage` or remote-config values) and read flags via a small helper: `getFlag('NAV_PROGRESS', import.meta.env.VITE_NAV_PROGRESS)`.

Deployment Steps
1) Implement Phases 1–3; ship with env flags enabled by default (or via runtime overrides if needed).
2) Roll out Phase 4–5 and monitor timing telemetry.
3) Enable Phase 6 (virtualization) for a subset of users (environment-based or runtime-flag), then enable broadly.

Rollback Plan
- To disable features instantly, flip runtime overrides (if implemented). Otherwise, toggle env flags and rebuild.

