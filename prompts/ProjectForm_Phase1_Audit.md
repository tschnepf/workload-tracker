# Project Form – Phase 1 Audit

## Layout + Interaction Overview
- Form lives inside a single `Card` (`max-w-2xl`, `p-6`) with most fields stacked. Only the Estimated Hours + Project Number pair uses a `grid grid-cols-1 md:grid-cols-2`, so mobile relies on default stacking without optimized spacing.
- Client autocomplete is a plain `<input>` with a manually managed dropdown (`absolute` list, blur hidden via `setTimeout`). No keyboard navigation, max-height only, and dropdown width equals input which can overflow on mobile when near edges.
- Primary actions (“Cancel” / submit) sit inside `flex justify-between`, pushing buttons to the far edges. On small screens the button text wraps and can clash with card padding.
- Error banner uses a red `Card` but lacks a dismiss affordance; users must scroll past to reach fields on mobile.
- Pre-deliverable settings render only when editing, using desktop spacing; no adjustments for narrow viewports.

## Backend & Validation Coupling
- Editing path fetches via `projectsApi.get(id)` and updates with `projectsApi.update`. Create path goes through `useCreateProject().mutateAsync` → `projectsApi.create`.
- Client dropdown queries `projectsApi.getClients()` on mount (first page, 200 entries). Results must remain plain strings—no ids.
- Submission trims `name`, `client`, `description`, coerces `startDate` to `null` when empty, and sends `estimatedHours` as `number | undefined`. Always includes `endDate: null` for new records.
- Validation ensures `name` and `client` exist before making API calls. Error handling inspects `err.status === 400` and expects field → messages map from the backend to display.

## Mobile Risk Areas
1. **Client dropdown** – absolute positioning may overflow viewport; closing via timeout feels jumpy on touch devices; no tap-trap or keyboard handling.
2. **Two-column grid** – uses `md:grid-cols-2`; below 768px it stacks but retains desktop margins, leading to long vertical scrolling and potential misalignment.
3. **Button row** – `justify-between` causes buttons to hug card edges; on narrow devices text wraps, sometimes forcing horizontal scroll.
4. **Card padding** – fixed `p-6` within `max-w-2xl` gives comfortable desktop spacing but wastes space on 360 px phones; inputs have no responsive width constraints.
5. **Error banner** – full-width red card pushes content downward with no close control, creating a poor mobile recovery flow.

## Data Dependencies To Preserve
- Client string must remain a direct value from the autocomplete; backend doesn’t accept ids.
- Status select must continue sending values `active`, `active_ca`, `on_hold`, `completed`, `cancelled`.
- Date field must emit ISO string or `null`—empty strings are rejected.
- `estimatedHours` should stay numeric; backend validation fails on non-numeric strings.
- Editing flows call `projectsApi.update` directly and should keep navigation back to `/projects` plus filter invalidation behavior.

## Recommended Next Steps
- Convert layout to mobile-first stack (single-column sections, consistent spacing, smaller padding under 640 px).
- Replace custom client dropdown with accessible combobox (keyboard support, scroll lock, inline filtering) while still sourcing data from `projectsApi.getClients()`.
- Restyle action buttons to stack vertically on mobile to prevent overflow.
- Provide dismissible error banners and ensure validation messages remain near their fields.
- Audit whether client list can be cached or narrowed server-side to reduce redundant fetches.
