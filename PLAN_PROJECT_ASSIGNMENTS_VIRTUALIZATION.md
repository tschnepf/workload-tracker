# Project Assignments Grid Virtualization Plan

## Goal
Make the Project Assignments page responsive by virtualizing the row rendering of expanded projects/assignments, so selection and scrolling are fast even with many rows.

## Scope
- Project Assignments page (`frontend/src/pages/Assignments/ProjectAssignmentsGrid.tsx`)
- Row virtualization only (columns remain as-is)
- Preserve existing UX: sticky header, expand/collapse, selection, editing, add person row

## Key Decision (must choose before implementation)
**Vertical scroll owner**
- Current `bodyScrollRef` only scrolls horizontally; vertical scroll is on the page (`<main>`).
- Virtualizer needs a vertical scroll element.
- Choose one:
  1) **Window/Main scroll**: attach virtualizer to the main content scroll container.
  2) **Introduce a vertical scroll container** inside ProjectAssignmentsGrid and move vertical scrolling there.

This decision affects sticky headers, scroll sync, and layout.

## Approach
Use TanStack React Virtual (already in repo) to render only visible rows. Maintain layout using a spacer and positioned virtual items.

## Step-by-step

### 1) Define the vertical scroll element
- If using window/main scroll: pass the main scroll element to `getScrollElement`.
- If adding internal scroll container: move vertical overflow to the grid container and keep header sticky within it.

### 2) Build a flat “row model” (render order)
- Create a memoized array of rows in render order:
  - Project header row
  - Add person row (if open)
  - Assignment row(s)
  - Empty state row (if no assignments)
- Each row entry should include:
  - `type` (projectHeader | addPerson | assignment | empty)
  - `projectId`
  - `assignmentId?`
  - `heightEstimate`
  - any data needed to render

### 3) Keep selection mapping separate
- Selection should remain **assignment-only**.
- Maintain `rowOrder`/`rowIndexByKey` based on assignment rows only.
- Row model is for rendering only; selection indices must not include non-assignment rows.

### 4) Add virtualizer hook
- Use `useVirtualizer` (or `useVirtualRows` helper)
- Configure:
  - `count = rowModel.length`
  - `getScrollElement = chosen vertical scroll element`
  - `estimateSize = row.heightEstimate`
  - `overscan = 6–10`

### 5) Render virtualized rows
- Replace direct `.map(sortedProjects...)` with:
  - A wrapper `div` with `height: totalSize`
  - Only render `virtualItems`
  - Each row uses `style={{ position: 'absolute', top: 0, transform: translateY(virtualItem.start) }}`

### 6) Handle variable row heights
- Project header/add-person/empty rows may be taller.
- If jitter appears, enable `measureElement` per row and store actual sizes.

### 7) Preserve sticky header + horizontal scroll alignment
- Header stays sticky
- Ensure horizontal scroll sync still works between header and body
- If scroll container changes, update the scroll sync wiring accordingly

### 8) Editing, focus, and selection
- Ensure active editing cell remains mounted during edit (or lock virtualizer to keep it visible).
- Keep click/drag selection within one project (already enforced).

### 9) QA scenarios
- Expand/collapse projects
- Add person row opens and stays visible
- Selection and editing across multiple rows in a project
- Scroll + edit + commit on outside click
- Keyboard entry on selected cell
- Horizontal scroll + header sync

## Risks / Gotchas
- Virtualizer needs a **real vertical scroll element**
- Variable row heights can cause jumpiness if not measured
- Selection must stay assignment-only despite extra row types
- Drag selection won’t work across rows that aren’t rendered (unless auto-scroll is added)

## Estimated Effort
- 1–2 focused dev sessions
- Low functional risk; mainly rendering logic changes
