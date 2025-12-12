## Reports – Person Experience – `frontend/src/pages/Reports/PersonExperience.tsx`

### Overview

- The **Person Experience Report** answers the question: *“What has this person worked on, for which clients, over what window of time?”*
- It provides:
  - A **search + filters panel** for choosing a person and time window.
  - A list of **project experience cards**, each showing weeks and hours, roles, phases, and a small sparkline of weekly hours.
- The page is intentionally read-only and is driven entirely by analytics endpoints in `experienceApi.ts` and `usePeopleAutocomplete` / `useExperience` hooks.

### Search, Filters, and Backend Hooks

#### 1. Person search – `usePeopleAutocomplete`

- State:
  - `search` – raw text from the “Search Person” input.
  - `debounced` – debounced version of `search` (200ms) via `useDebounce`.
  - `selectedPersonId` – the id of the selected person, or `null` when none is selected.
- Hook:
  - `const { people, loading: loadingPeople } = usePeopleAutocomplete(debounced);`
  - Implementation (`frontend/src/hooks/usePeople.ts`):
    - Enables the query only when `search.trim().length >= 2`.
    - Uses React Query with:
      - `queryKey: ['people-autocomplete', search]`.
      - `queryFn: () => peopleApi.search(search.trim(), 20)`.
      - `staleTime: 60s`, `refetchOnWindowFocus: false`.
  - Backend call:
    - `peopleApi.search(query, limit)` – underlying endpoint is `/people/search/` (through `services/api`), returning a list of `{ id, name }` matches.
- UI:
  - Input:
    - Single-line `<input>` with placeholder “Type at least 2 characters”.
    - No label for screen readers beyond the visible “Search Person” text.
  - Results dropdown:
    - Rendered only when `debounced.trim().length >= 2`.
    - Shows:
      - “Searching…” while `loadingPeople` is true.
      - “No matches” if `people.length === 0`.
      - Otherwise, a list of buttons, one per person.
    - Clicking a person sets `selectedPersonId` and leaves the input text as-is.
  - Mobile considerations:
    - On narrow screens the search panel appears as the first column in a 3-column grid; the dropdown uses `max-h-48` with `overflow-auto`.
    - There is no explicit handling for soft-keyboard overlap; on some devices, the dropdown may be partially obscured when the keyboard is open.

#### 2. Time window controls

- Local state:
  - `intervalType: 'months' | 'years'` – default `'months'`.
  - `intervalCount: number` – default `DEFAULT_MONTHS` (6).
  - `now` – captured once with `useMemo(() => new Date(), [])` so the window is consistent during a session.
  - `startDate` – derived with:
    - `addMonths(now, intervalCount)` when type is `months`.
    - `addYears(now, intervalCount)` when type is `years`.
  - `start` / `end` – formatted as `yyyy-mm-dd` by `fmtDate`.
- Date helpers:
  - `addMonths`:
    - Subtracts `months` from the month field.
    - Adjusts to the last day of the prior month if month rollover changes the day (e.g., Jan 31 → previous month shorter).
  - `addYears`:
    - Subtracts `years` from the year field while preserving month and day.
- UI:
  - “Interval Type” select:
    - Options: “Months” and “Years”.
  - “Interval Count” numeric input:
    - Minimum 1; negative or empty values are clamped via `Math.max(1, Number(value || 1))`.
  - A small helper line shows the computed window: `Window: {start} to {end}`.
- Backend parameters:
  - These `start` / `end` values are sent unchanged into the experience hooks below, so any mobile redesign must preserve their semantics.

#### 3. Experience profile – `usePersonExperienceProfile`

- Hook usage:
  - `const { loading, error, data } = usePersonExperienceProfile({ personId: selectedPersonId || 0, start, end });`
  - This call is made even when `selectedPersonId` is `null` (passing `0`), but the UI only shows result sections when a person is selected, effectively hiding irrelevant responses.
- Hook implementation (`useExperience.ts`):
  - React Query:
    - `queryKey: ['personExperienceProfile', params]`.
    - `queryFn: () => fetchPersonExperienceProfile(params)`.
  - There is no `enabled` guard here; tests and production behavior assume a valid `personId`.
- Backend:
  - `fetchPersonExperienceProfile` (`experienceApi.ts`):
    - Builds a query string:
      - `person` – required, `params.personId` as string.
      - `start` / `end` – optional date filters.
    - Calls the OpenAPI client for `/api/assignments/person_experience_profile/` with `authHeaders`.
    - Returns a `PersonExperienceProfile` object:
      - `byClient`: aggregated per client.
      - `byProject`: per project stats.
      - `eventsCount`: total events in the window.
      - `roleNamesById` (optional map used for role labels).

#### 4. Project timeline sparkline – `usePersonProjectTimeline`

- Used inside `ProjectHoursSparkline`:
  - Props: `{ personId, projectId, start, end }`.
  - Hook:
    - `const { data, loading, error } = usePersonProjectTimeline({ personId, projectId, start, end });`
    - React Query key: `['personProjectTimeline', params]`.
  - Backend:
    - `fetchPersonProjectTimeline`:
      - Builds query parameters: `person`, `project`, `start?`, `end?`.
      - Calls OpenAPI client for `/api/assignments/person_project_timeline/`.
      - Returns `PersonProjectTimeline` including:
        - `weeksSummary`, `coverageBlocks`, `events`, `roleChanges`.
        - Optional `weeklyHours: Record<string, number>` for the sparkline.
- Sparkline rendering:
  - Dimensions:
    - `width = 220`, `height = 36`, `pad = 4`.
  - Data:
    - `weeks` – sorted keys of `data.weeklyHours`.
    - `values` – hours per week; `max` is max of these, at least 1.
  - Points:
    - X coordinates evenly spaced across width between pads.
    - Y coordinates mapped using `height` and `max`.
  - SVG:
    - `<polyline>` with stroke `#3b82f6`, width `2`.
  - States:
    - While loading: “Loading series…” text.
    - On error: returns `null` (no sparkline).
    - No data: returns `null`.
- Mobile implications:
  - `width` is fixed in pixels; on smaller screens the sparkline may overflow or create horizontal scroll inside the card.
  - There are no tooltips or accessible labels on the SVG; it is purely visual.

### Project Experience Cards and Layout

- Cards are only rendered when:
  - `selectedPersonId != null`, and
  - `!loading && !error`, and
  - The `PersonExperienceProfile` is loaded.
- For each `prj` in `data.byProject`:
  - Header:
    - Project name (left).
    - Client name (right, small text).
  - Metrics grid:
    - `Weeks`, `Total Hours`, `Avg Weekly Hours`, and `Role(s)` are rendered in a `grid grid-cols-1 md:grid-cols-4 gap-2`.
    - On mobile this collapses to a 4-row vertical list; on desktop it forms a 4-column layout.
  - Average weekly hours:
    - `avg = prj.weeks > 0 ? prj.hours / prj.weeks : 0`.
    - `barPct` uses a fixed `avgScaleMax = 40`:
      - `barPct = clamp((avg / avgScaleMax) * 100, 0, 100)`.
    - Visual:
      - Background bar `w-36 h-2` (fixed width regardless of screen size).
      - Filled bar inside with width `%` style for the percentage.
      - Text label showing `avg.toFixed(1) h`.
  - Roles:
    - `roleMap` retrieved via `roleNamesById` from `data`.
    - `roles` is `Object.values(prj.roles || {})` sorted descending by `weeks`.
    - Renders up to 3 chips: **Role Name – Xw**.
  - Phases:
    - `phases` is `Object.values(prj.phases || {})` sorted descending by `weeks`.
    - Renders up to 6 chips: **Phase Name – Xw**.
  - Sparkline:
    - `ProjectHoursSparkline` appended at the bottom of each card to show weekly hours visually.

### Layout, Responsiveness, and Mobile Pain Points

- Top-level layout:
  - Wrapper `<div className="p-4 space-y-4">` – fixed padding on all devices.
  - Page title uses `text-xl` only; there is no breadcrumb or subheader.
  - Filters section:
    - `section` with `bg-[#111314] border border-[#2a2d2f] rounded p-3 space-y-3`.
    - Content uses `grid grid-cols-1 md:grid-cols-3 gap-3`:
      - Column 1: Search Person.
      - Column 2: Interval Type.
      - Column 3: Interval Count + window summary.
  - There is no stickiness or mobile toolbar; filters scroll off screen as the list grows.

- Mobile-specific issues:
  - **Fixed widths**:
    - Average-hours bar uses `w-36`; sparkline uses `width=220px`.
    - On smaller devices these can approach or exceed the available width, risking horizontal scroll.
  - **Dense multi-column project metrics**:
    - Even though the metrics grid collapses to one column on mobile, the project card includes:
      - Metrics grid.
      - Phases chip list.
      - Sparkline.
    - This can result in tall, busy cards that may be hard to scan.
  - **Search suggestion dropdown**:
    - Renders immediately below the input with a fixed `max-h-48`.
    - On mobile, the soft keyboard can occlude part of the dropdown and there is no escape key handling or “clear” icon.
  - **Accessibility**:
    - The sparkline SVG has no `role` or accessible name; screen readers get no information about weekly trends.
    - The roles and phases chips are readable but there is no summary of total project count or total hours across all projects at the top of the report.

### Constraints for Future Mobile Redesign (Later Phases)

- **Do not alter backend hooks or contracts**:
  - `usePeopleAutocomplete` must remain the single entry point for person search and keep using `peopleApi.search`.
  - `usePersonExperienceProfile` must continue to:
    - Send `person`, `start`, `end` to `/api/assignments/person_experience_profile/`.
    - Receive the full `PersonExperienceProfile` shape with `byProject`, `byClient`, and `roleNamesById`.
  - `usePersonProjectTimeline` must continue to:
    - Use `person`, `project`, `start`, `end` for `/api/assignments/person_project_timeline/`.
    - Surface `weeklyHours` and related analytics for sparkline or future visualizations.

- **Single source of truth for the time window**:
  - All visualizations and summaries should derive from the `start` / `end` computed by `intervalType` + `intervalCount`.
  - Any mobile-first faceting (e.g., summary cards, collapsible project sections) must reuse the same `data` object returned from `usePersonExperienceProfile`, not issue additional overlapping API calls.

- **Recommended mobile direction (at a high level)**:
  - Convert the 3-column filter grid into a **stacked filter card** with:
    - Person search at the top.
    - Interval type + count in a horizontal pair or sequence.
    - A summarized “Window: start → end” pill.
    - Optional sticky behavior on scroll for small screens.
  - Transform project cards into **single-column, mobile-first cards**:
    - Top: project name + client.
    - Middle: one or two key metrics (total hours, average weekly) as compact badges or horizontal mini-bars.
    - Bottom: collapsible sections for roles, phases, and the sparkline, so users can expand details on demand.
  - Ensure any new sparklines or mini-charts:
    - Use the same `weeklyHours` per project and respect the existing date window.
    - Avoid increasing API frequency by reusing `usePersonProjectTimeline` and caching results via React Query keys.

This audit inventories the Person Experience report’s search, filters, project cards, and sparkline behavior, and clarifies how they depend on `usePeopleAutocomplete`, `usePersonExperienceProfile`, and `usePersonProjectTimeline`, setting the stage for a safe, single-column mobile redesign in subsequent phases.

