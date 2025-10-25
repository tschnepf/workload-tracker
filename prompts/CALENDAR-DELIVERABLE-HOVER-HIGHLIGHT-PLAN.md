# Calendar Hover Highlight Plan

Goal: In the Deliverables Calendar, when the user hovers a deliverable card for a project, dim all other projects' items and keep only that project's deliverables and pre‑deliverables fully visible. No permanent selection is required—hover only—with keyboard focus as an accessibility fallback. No backend data changes are needed.

Scope: Frontend‑only enhancement inside the calendar view; keep lean, minimal state, no quick fixes, no global mutable state. Ensure code remains readable and consistent with existing patterns.

Editing Rules for Any Patch
- Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set‑Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches. After edits, run the frontend type check/build to validate.
- Only use best‑practice programming. Do not use shortcuts or band‑aid style fixes just to make a test pass. Never remove code or functionality to make tests pass.

Acceptance Criteria
- Hovering any deliverable card highlights all items of the same `project` across the entire grid and dims all others.
- Hovering any pre‑deliverable grouped card highlights the parent `project` and dims all others.
- Exiting hover restores normal appearance (no “stuck” state).
- Keyboard users can tab to a card to trigger the same effect (focus/blur). Esc clears.
- Behavior degrades gracefully on touch/mobile (no hover effects).

Assumptions
- Deliverable items expose `project` (number) via `DeliverableCalendarItem` (already true).
- Pre‑deliverable items passed to the grid include `project` (already true via `calendar_with_pre_items`).
- Current grouping: pre‑deliverables are grouped by `project` per day. Deliverables are individual.

Non‑Goals
- No sticky “pin highlight” toggle in this iteration (can be a later enhancement).
- No backend changes; API payloads are sufficient.

Identified Risks and Mitigations
- Hover flicker between cards: Clear highlight at a stable, grid‑level `onMouseLeave`, not from every card’s `onMouseLeave`.
- Missing/invalid project id on items: Introduce a helper to safely extract/validate project id and skip highlight if absent.
- Accessibility: Ensure `role="button"`, `tabIndex={0}`, and keyboard handlers (Space/Enter simulate hover; Esc clears).
- Performance: Avoid reflow; toggle only CSS classes (`opacity-*`, transitions), no layout changes.
- State stuck after data changes: Clear highlight when `items`, `anchor`, or `showPre` change.

Phases and Prescriptive Steps (feed each step as a prompt)

## Phase 1 — Inventory and Baseline

1) Prompt: "Open and read the calendar components to confirm render points for deliverable and pre‑deliverable cards. Specifically inspect: `frontend/src/pages/Deliverables/Calendar.tsx` and `frontend/src/components/deliverables/CalendarGrid.tsx`. List where each card is produced and identify the properties available on each card (id, project, date, itemType). Do not change code."

## Phase 2 — State Design (Lean, local, explicit)

2) Prompt: "In `frontend/src/components/deliverables/CalendarGrid.tsx`, add a minimal hover state: `const [hoveredProjectId, setHoveredProjectId] = useState<number | null>(null);`. Keep this state local to `CalendarGrid` (not global, not context). Outline where it is read and set for both deliverable cards and pre‑deliverable grouped cards. Do not implement class changes yet."

## Phase 3 — Event Wiring (Mouse + Keyboard)

3) Prompt: "In `CalendarGrid.tsx`, wire events as follows:
- Per card (deliverable or pre‑deliverable group) add `onMouseEnter` and `onFocus` that set `hoveredProjectId` to that card/group project id.
- Do NOT clear from per‑card `onMouseLeave`. Instead, add a single `onMouseLeave` on a stable grid wrapper (the outer container that encompasses all day cells) to set `hoveredProjectId` to `null`. Also clear on per‑card `onBlur` as a safety.
- Ensure `tabIndex={0}` and `role="button"` are present on cards.
- Add `onKeyDown`: Space/Enter → `preventDefault()` and set `hoveredProjectId` to the card project; Esc → clear.
Implement handlers only; do not style yet."

4) Prompt: "Add a local helper in `CalendarGrid.tsx`:
```ts
function getProjectIdForBlock(x: any): number | null {
  // For deliverables, read x.project; for pre‑deliverable groups, use the first item's project.
  // Return null if not a finite number; callers must skip state changes for null.
}
```
Use it for both card types to avoid duplication."

## Phase 4 — Dimming/Highlight Styles (Theme‑aware, minimal CSS)

5) Prompt: "Apply conditional classes to cards based on `hoveredProjectId`:
- Dim rule: when `hoveredProjectId !== null && cardProjectId !== hoveredProjectId`, add `opacity-40 transition-opacity duration-150`.
- Otherwise, keep default classes. Avoid arbitrary value utilities (e.g., `grayscale-[20%]`); if grayscale is desired later, use `filter grayscale` only if verified in Tailwind config.
- Respect `prefers-reduced-motion` by keeping transitions short and non‑essential."

6) Prompt: "Ensure the day cell wrapper and sizing logic are untouched. Only toggle per‑card classes so min‑height measurement remains stable and there is no layout shift."

## Phase 5 — Pre‑Deliverable Group Integration

7) Prompt: "For grouped pre‑deliverables, compute `groupProjectId` from the first item of the group (already available in the grouping code). Pass it into the same handlers and dimming checks as deliverables. Keep grouping/labels unchanged."

## Phase 6 — Accessibility and Edge Cases

8) Prompt: "Keyboard and ARIA:
- Cards have `role="button"`, `tabIndex={0}`.
- `onKeyDown`: Space/Enter → `preventDefault()` and set `hoveredProjectId` to the card project; Esc → clear.
- `onBlur`: clear highlight.
- Document that mobile/touch has no hover effect."

9) Prompt: "Null project safety:
- Use `getProjectIdForBlock` and only set hover when the returned id is a finite number; otherwise skip state changes for that card."

## Phase 7 — State Reset on Data/View Changes

10) Prompt: "Add `useEffect(() => setHoveredProjectId(null), [items, anchor, showPre])` so highlight never persists after data or view changes (week nav, filters, toggles)."

## Phase 8 — Performance Considerations

11) Prompt: "Keep computations O(n) over visible cards:
- No new `useMemo` for dimming; reuse existing data structures.
- Avoid touching element sizes/styles that cause reflow; toggle opacity only.
- Confirm behavior under React StrictMode: no side effects outside event handlers."

## Phase 9 — Testing Plan (Agent‑executable)

12) Prompt: "Run `cd frontend && npm run dev`, open `/deliverables/calendar`. Manually verify:
- Hover a deliverable card: only that project’s items remain fully visible across the grid; others dim.
- Hover a pre‑deliverable grouped card (multi‑item bullet and single‑item cases): same behavior.
- Rapidly move cursor between projects: no visible flicker (grid‑level clear prevents flashes).
- Toggle “Show Pre‑Deliverables” while highlighting: highlight resets automatically.
- With a person filter active, highlight only affects currently visible items.
- Keyboard: Tab to a card → highlight; Shift+Tab away or Esc → clear; Enter/Space behaves like hover without navigation.
Capture any console errors."

13) Prompt: "Optional E2E (if Playwright is already configured): add a minimal test that mounts the calendar with two projects and asserts that hovering one card toggles `opacity-40` on the other project’s card. If E2E harness is not ready, skip adding new tests (do not scaffold)."

## Phase 10 — Code Review Checklist

14) Prompt: "Open a PR checklist:
- No backend changes introduced.
- No new dependencies added.
- Only `CalendarGrid.tsx` (and optionally minimal CSS) modified.
- Accessibility: focusable cards, keyboard handlers added, Esc clears state.
- Theming intact; no hardcoded colors; relies on existing classes/variables.
- No global state; no context; no prop drilling into parent components.
- Hover clear handled at grid wrapper, not per card, to avoid flicker.
- `useEffect` added to clear highlight on data/view changes."

## Phase 11 — Rollout & Doc

15) Prompt: "Update `FUTURE_FEATURES.md` or relevant UI docs with a brief note: Calendar supports hover highlight by project (deliverables + pre‑deliverables), keyboard behavior, and how it behaves on mobile."

Notes on Best Practices
- Favor clear, small, single‑purpose changes over broad refactors.
- Don’t mutate existing arrays/objects; use pure functions.
- Don’t introduce hidden coupling between components.
- Keep naming explicit (`hoveredProjectId`), avoid abbreviations.
- No TODO debt: code shipped must be complete, legible, and unit‑safe.
