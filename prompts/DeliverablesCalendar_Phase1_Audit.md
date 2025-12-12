## Deliverables Calendar – `frontend/src/pages/Deliverables/Calendar.tsx`

### Overview

- The Deliverables Calendar page surfaces **project deliverables and pre‑deliverables** in a multi‑week view driven by FullCalendar.
- It is used for:
  - Reviewing upcoming milestones across all projects.
  - Optionally including pre‑deliverable items (checklist-style tasks).
  - Narrowing the view to a single person via a name filter.
- Layout today:
  - Header row with page title, a **Show Pre‑Deliverables** toggle, a **Weeks** selector (4/8/12), and a **Person Filter** autocomplete (desktop only).
  - Main content is a `Card` wrapping `FullCalendarWrapper`:
    - Desktop/tablet: custom `deliverablesMultiWeek` grid view (dayGrid, N weeks wide).
    - Mobile: responsive override to FullCalendar’s `listWeek` view.

### Data Flow and Backend Dependencies

- **Calendar range state**
  - `weeks` – UI control for 4/8/12 week window (default 8).
  - `range: CalendarRange` – `{ start: string; end: string }`, ISO dates.
  - `buildCalendarRange(weeks, anchor?)`:
    - Clamps `weeks` via `clampWeeks` (1–12).
    - Computes `start` as **Sunday of the anchor week** (or current week).
    - Computes `end` as `start + (weeks * 7 - 1)` days, converted to ISO yyyy‑mm‑dd.
  - `handleWeeksChange(value)`:
    - Updates `weeks`.
    - Rebuilds `range` anchored to the current `range.start` so navigation is stable.
  - `handleDatesSet(arg)` (from FullCalendar):
    - Receives `arg.start` / `arg.end` (where `end` is exclusive).
    - Updates `range` to:
      - `start: toIsoDate(arg.start)`
      - `end: toIsoDate(subtractOneDay(arg.end))`
    - This keeps the React Query range **inclusive** while staying aligned with the calendar viewport.

- **Primary calendar query – `useDeliverablesCalendar`**
  - Called as `useDeliverablesCalendar(range, { mineOnly: false })`.
  - Query key: `['deliverables-calendar', 'all', range.start, range.end, 0, 'all']`.
  - Enabled while `range.start` and `range.end` are defined.
  - `fetchDeliverableCalendar(range, { mineOnly, personId, typeId })`:
    1. **Preferred path – aggregated endpoint**
       - `apiClient.GET('/deliverables/calendar_with_pre_items/', { query: { start, end, mine_only?, type_id? } })`
       - Expects an array of `DeliverableCalendarUnion` items that already include:
         - Deliverables (`DeliverableCalendarItem`) and pre‑deliverables.
         - Project name/client metadata used for labels and grouping.
    2. **Fallback path – legacy fan‑out**
       - `deliverablesApi.calendar(start, end)` → base deliverables.
       - `deliverableAssignmentsApi.byPerson(personId)` (only when `mineOnly && personId`).
       - `apiClient.GET('/assignments/by_person/', { person_id })` (only when `mineOnly && personId`).
       - `apiClient.GET('/deliverables/pre_deliverable_items/', { start, end, mine_only? })` → pre‑deliverables.
       - Combines these into a `DeliverableCalendarUnion[]`, filtering deliverables/pre‑deliverables by person when `mineOnly` is true.
  - On this page, we always pass `mineOnly: false`, so:
    - The **new aggregated endpoint** is the only call in the happy path.
    - The fallback still calls `deliverablesApi.calendar` and `pre_deliverable_items`, but **never** the person‑scoped endpoints.

- **Person filter backend calls**
  - Person search (desktop only today):
    - `peopleApi.autocomplete(query, 20)` – returns `{ id, name }[]`.
  - Once a person is selected:
    - `deliverableAssignmentsApi.byPerson(selectedPerson.id)`:
      - Returns links from a person to deliverables (`deliverable` ids).
    - `assignmentsApi.byPerson(selectedPerson.id)`:
      - Returns project assignments (`project` ids).
    - These are wrapped in `Promise.all` and errors are swallowed per call to avoid breaking the page.
  - Results are converted into:
    - `allowedDeliverableIds: Set<number> | null`
    - `allowedProjectIds: Set<number> | null`
  - These sets drive **client‑side filtering** of the already‑fetched calendar items.

- **Client‑side calendar item filtering**
  - `filteredItems`:
    - If no `selectedPerson`, returns the raw `data` from `useDeliverablesCalendar`.
    - If no allowed sets (e.g., the person has no links), returns an empty list.
    - For each item:
      - Reads `project` and `id`.
      - For `itemType === 'pre_deliverable'`, it also checks `parentDeliverableId`.
      - Keeps the item if:
        - Deliverable id is in `allowedDeliverableIds`, or
        - Project id is in `allowedProjectIds`, or
        - For pre‑deliverables, parent deliverable id is allowed.
  - `mapDeliverableCalendarToEvents(filteredItems, { includePreDeliverables: showPre })`:
    - Converts calendar items into FullCalendar `EventInput`s.
    - Adds `DeliverableEventMeta` in `extendedProps` with:
      - `kind: 'deliverable' | 'pre_deliverable' | 'pre_deliverable_group'`.
      - Project/client metadata.
      - Status flags such as `isCompleted`, `isOverdue`.
      - Grouping ids (`highlightGroupIds`) used for hover focus.
      - `hiddenByFilter` for pre‑deliverables that are hidden when the checkbox is off.

### FullCalendar Configuration and Mobile Behavior

- `FullCalendarWrapper` abstracts:
  - Lazy loading of `@fullcalendar/react` and `dayGrid`, `timeGrid`, `list` plugins.
  - A `useMediaQuery('(max-width: 767px)')` hook to detect mobile screens.
  - Responsive view selection:
    - `responsiveViews={{ mobile: 'listWeek', desktop: 'deliverablesMultiWeek' }}`.
    - `resolvedView`:
      - Mobile → `listWeek` (vertical agenda list).
      - Desktop → `deliverablesMultiWeek` (custom dayGrid view).
  - Toolbar:
    - Mobile toolbar defaults to **prev / next / title / list view** while hiding unnecessary controls.
  - Accessibility:
    - `eventDidMount`:
      - Marks events as interactive buttons with keyboard handlers.
      - Adds `aria-label` built from event title, dates, and common metadata.
      - Applies `data-highlight-group-ids` and `data-hidden-by-filter` for styling and focus.
    - `eventWillUnmount` cleans up listeners and resets state.

- Deliverables Calendar specific configuration:
  - `views={multiWeekView}` where `multiWeekView.deliverablesMultiWeek`:
    - `type: 'dayGrid'`.
    - `duration: { weeks: clampWeeks(weeks) }` – FullCalendar’s internal range.
  - `initialView="deliverablesMultiWeek"`.
  - `dayMaxEvents={false}`:
    - Disables FullCalendar’s “+N more” overflow behaviour; all deliverable pills are visible.
  - `eventOrder={['extendedProps.sortPriority', 'start']}`:
    - Ensures deliverables appear above grouped pre‑deliverables, which in turn appear above single pre‑deliverables.
  - `eventContent={renderEventContent}`:
    - For `pre_deliverable_group` – renders a project title with a list of bullet points.
    - For `pre_deliverable` – shows the pre‑deliverable title plus a one‑line project/client subtitle.
    - For `deliverable` – uses `formatDeliverableInlineLabel` to build a single inline pill label.
  - `onEventClick={handleEventClick}`:
    - Uses `useProjectQuickViewPopover` to open the project quick‑view anchored to the clicked event.

### Layout, Controls, and Mobile Pain Points

- **Header controls**
  - Title: `Deliverables Calendar (N Weeks)` with a short description.
  - Controls row:
    - `Person Filter` (label + autocomplete) – **hidden on screens `< sm`** (`hidden sm:flex`).
    - `Show Pre‑Deliverables` checkbox – always visible.
    - `Weeks` selector – inline buttons (4w/8w/12w) with pressed state.
  - Because the person filter is desktop‑only, mobile users currently:
    - Cannot filter the calendar by person.
    - Still pay for the main calendar query for the full range, but without the extra `byPerson` calls.

- **Calendar container**
  - Wrapped in a `Card` with `className="bg-[var(--card)] border-[var(--border)] p-4"`.
  - `FullCalendarWrapper` receives `className="min-h-[640px]"`:
    - Ensures enough height for multi‑week desktop grids.
    - On mobile, this can feel tall when combined with the list view, but it avoids empty‑looking layouts when the calendar is sparsely populated.

- **Person filter interactions**
  - When the user types, `peopleApi.autocomplete` is called immediately (no explicit debouncing).
  - Arrow keys move a highlight index over the suggestions; Enter selects.
  - Clicking a suggestion also selects it.
  - Clearing the person resets filter state and removes client‑side gating.
  - On mobile, this control is absent; any future mobile design needs to decide:
    - Whether to surface person filtering at all.
    - If so, where to place it (e.g., in a sheet/modal) and how to debounce queries.

### Mobile Condensation & Safety Constraints (for Later Phases)

- **Must‑preserve contracts**
  - `useDeliverablesCalendar`:
    - Must always receive a **valid `CalendarRange`** with inclusive `start`/`end` dates that match the rendered window.
    - Must continue to be the **single source of truth** for deliverables/pre‑deliverables; mobile variants should reuse the same hook and not introduce additional calendar endpoints.
  - Backend parameters:
    - `start` / `end` query params from `CalendarRange`.
    - Optional `mine_only` / `type_id` flags in the calendar endpoint.
    - `deliverableAssignmentsApi.byPerson` and `assignmentsApi.byPerson` must only be called when a specific person is selected.
  - Event mapping:
    - `mapDeliverableCalendarToEvents` and `DeliverableEventMeta` should remain the canonical representation passed into FullCalendar, so any agenda/timeline view shares the same event data.

- **Condensation goals for Phase 2**
  - Reduce **visual weight** of the desktop multi‑week grid on mobile:
    - Prefer an agenda/timeline presentation (`listWeek` or similar) that groups events logically while using the same date range.
    - Keep week navigation and the 4/8/12 week selector in sync with `CalendarRange` and `handleDatesSet`.
  - Centralize person filtering so that:
    - Mobile users can still filter by person, but via a dedicated sheet/modal that debounces `peopleApi.autocomplete`.
    - The existing `allowedDeliverableIds` / `allowedProjectIds` gating continues to be applied in exactly one place.
  - Avoid extra network traffic:
    - No new per‑view calendar calls should be introduced when switching between grid and agenda modes.
    - Person filter should not repeatedly call `byPerson` endpoints while typing; calls must be tied to explicit selections.

- **Risks to watch for**
  - Misaligning `CalendarRange` with FullCalendar’s rendered dates can cause:
    - Off‑by‑one errors in backend `start`/`end` parameters.
    - Empty days at the edges of the range if `subtractOneDay` and FullCalendar’s exclusive `end` are not kept in sync.
  - Introducing a second source of truth for events (e.g., ad‑hoc transforms outside `mapDeliverableCalendarToEvents`) would make it harder to maintain color coding, grouping, and hover focus behaviours consistently across mobile and desktop views.
  - Surfacing the person filter on mobile without debouncing could hammer:
    - `peopleApi.autocomplete`.
    - The person‑scoped `deliverableAssignmentsApi.byPerson` and `assignmentsApi.byPerson` calls, especially when combined with rapid typing or repeated sheet openings.

This audit documents the current data flow, backend contracts, and layout assumptions for the Deliverables Calendar so that follow‑up phases can safely introduce mobile‑first calendar patterns without breaking existing behaviour or overloading the backend.

