# R5: Multi‑User Concurrency, Session Safety, and Mobile UX — Implementation Spec

Scope: Multiple different people can be logged in at the same time, editing Projects, Assignments, and People concurrently. We will add backend concurrency controls, frontend conflict handling, safer session management, cache isolation, and mobile‑friendly UX. Work is broken into lean, prescriptive prompts (max 7), each with simple tests for both the AI‑agent and you.

Guiding principles
- Keep changes minimal and consistent with the current stack (Django + DRF + SimpleJWT; React + TS).
- Prefer small, verified increments; avoid broad refactors.
- Prevent frontend/backend mismatches: name exact files, endpoints, and headers to change.
- Always include a quick test (automated + UI) before progressing.

---

## Prompt 1 — Backend: Optimistic Concurrency (ETag/If‑Match) for People, Projects, Assignments

User note (plain English): This adds a “don’t overwrite other people’s edits” safety. Each record has a version (via `updated_at`). Frontend sends back the version it last saw; server only accepts the save if the version still matches.

Change summary
- Add a small mixin used by People/Projects/Assignments viewsets to:
  - Return an `ETag` header on GET/GET detail (derive from `id` + `updated_at`).
  - On `PUT/PATCH`, require `If-Match` header that equals the current `ETag`; otherwise return `412 Precondition Failed`.
- Ensure serializers include `updatedAt` for all three resources (People already has it). If Projects/Assignments omit it, add read‑only fields.

Files to edit
- `backend/people/views.py`, `backend/projects/views.py`, `backend/assignments/views.py`: integrate a `ConcurrencyETagMixin` for retrieve/update/partial_update.
- (If needed) `backend/*/serializers.py`: expose `updatedAt` (maps to `updated_at`).

Server behavior
- GET /api/people/{id}/ → sets `ETag: "<hash>"`.
- PATCH /api/people/{id}/ requires header `If-Match: "<hash>"`; if missing/mismatch → 412.
- Apply the same to Projects and Assignments detail endpoints.

Agent tests (automated)
- Add unit tests for each resource:
  - GET once → capture ETag; PATCH with `If-Match` → 200.
  - Update the row elsewhere → PATCH with stale `If-Match` → 412.

User tests (UI)
- Open the same Person in two tabs. Save in Tab A, then try saving different changes in Tab B → Tab B should fail with a clear message (will be added in Prompt 2).

---

## Prompt 2 — Frontend: Handle 412 Conflicts Gracefully

User note: If someone else saves first, your save should not silently overwrite. You’ll see a clear notice and can reload/merge changes safely.

Change summary
- Enhance `frontend/src/services/api.ts` error handling:
  - Detect `412 Precondition Failed` and throw a typed `ApiError` (e.g., `name='ConcurrencyError'`).
- Update editors (e.g., `frontend/src/pages/People/PersonForm.tsx`, and similar forms for Project, Assignment):
  - On 412 error, show a conflict banner: “This item was updated by someone else. Reload to continue.” with “Reload latest” button that refetches and repopulates the form.
- When sending updates, include `If-Match` with the last known ETag (store from the latest GET detail).

Files to edit
- `frontend/src/services/api.ts`: map 412 to a clear error.
- `frontend/src/pages/People/PersonForm.tsx` (and corresponding Project/Assignment forms):
  - Store `etag` from last GET; add `If-Match` on save; show conflict UI on 412.

Agent tests (automated)
- Add a small integration test (if present) for a form submit: mock 412 path; ensure UI renders a conflict banner.

User tests (UI)
- Repeat the two‑tab test from Prompt 1:
  - On the second save, see a conflict banner; click “Reload latest” and confirm the form updates to the latest data.

---

## Prompt 3 — Frontend: User‑Scoped Caches + Clear on Auth Changes

User note: Prevents one user’s cached data from showing up when another user logs in on the same browser. Also ensures fresh data after login/logout.

Change summary
- Scope both `inflightRequests` and `responseCache` keys by user id (from `/auth/me`).
- On login/logout, clear both caches.
- Add a small helper `getCurrentUserId()` (from auth store) used to prefix cache keys (e.g., `uid:123|GET /api/...`).

Files to edit
- `frontend/src/services/api.ts`: update keying logic and add a cache clear on auth changes (export a `clearCaches()` and call it from auth store on login/logout).
- `frontend/src/store/auth.ts`: after setting tokens, call `clearCaches()`.

Agent tests (automated)
- Unit test key creation function: same URL produces different keys for different user ids.

User tests (UI)
- Log in as User A → navigate lists; log out; log in as User B → verify data refetches (no stale data appears).

---

## Prompt 4 — Sessions: List + Revoke (Logout Blacklisting)

User note: Lets an admin or a user see where they’re logged in and revoke specific sessions. This helps if a token leaks or a device is lost.

Change summary
- Backend:
  - Track refresh token sessions (store jti, issued_at, last_used, user_agent, ip) when issuing/refreshing tokens.
  - Endpoints:
    - `GET /api/auth/sessions/` (self) → list sessions for current user.
    - `POST /api/auth/sessions/revoke/` (self) → revoke a session by id (blacklist the refresh token jti and its descendants).
  - Admin endpoint (optional): list sessions for any user (IsAdminUser).
- Frontend (Profile page):
  - Show “Active Sessions” with device/IP/last seen + “Revoke” button.

Files to edit
- Backend: new model (e.g., `accounts/models.py: TokenSession`), signals or view hooks in token views, and new views/urls.
- Frontend: `frontend/src/pages/Profile/Profile.tsx` add a sessions table and revoke action.

Agent tests (automated)
- Create two sessions; assert both listed; revoke one; verify subsequent refresh in revoked session fails.

User tests (UI)
- Log in from two browsers/devices → see two entries under “Active Sessions”. Click revoke on one and confirm it requires re‑login there.

---

## Prompt 5 — Admin: Change Role + Disable/Enable User (Audit Trail)

User note: Allows admin to promote/demote users and disable accounts without deleting. Keeps a record of who did what.

Change summary
- Backend:
  - Add `is_active` toggling endpoint for users (admin only): `POST /api/auth/users/{id}/toggle_active/`.
  - Add `POST /api/auth/users/{id}/change_role/` with role = admin|manager|user (update staff flag and groups consistently).
  - Add a simple `AuditLog` model to capture actor, action, target, timestamp, metadata.
- Frontend (Settings → Users):
  - Add “Role” dropdown per row (save button) and an “Enable/Disable” toggle.
  - Show recent audit entries (optional, read‑only table) for transparency.

Files to edit
- Backend: `accounts/views.py` (new endpoints), `accounts/models.py` (AuditLog), `accounts/urls.py` routes; update serializer if needed.
- Frontend: `frontend/src/pages/Settings/Settings.tsx`

Agent tests (automated)
- Change role as admin → verify groups/staff updated; log created. Toggle active → user can/can’t log in accordingly.

User tests (UI)
- Change a user’s role; verify UI updates; user permissions change after re‑login. Disable a user; confirm they can’t obtain tokens.

---

## Prompt 6 — Server‑Side People Search (Scalable Typeahead)

User note: Replaces large dropdowns with a fast search box for big directories.

Change summary (skip if already done)
- Backend: `GET /api/people/search/?q=..&limit=20` with min length 2, cap 50; filter by name/email icontains; add functional indexes on LOWER(name), LOWER(email). Throttle via hot endpoint scope.
- Frontend: Replace dropdowns with async typeahead (debounce 250–300ms); results panel with keyboard navigation; select sets person id.

Files to edit
- `backend/people/views.py`: add action; `people/migrations` for indexes.
- Frontend: replace select in any UI requiring person selection (e.g., admin user creation) with typeahead.

Agent tests (automated)
- Validate min length, limit cap, case‑insensitive search; auth required → 401 otherwise.

User tests (UI)
- Type 2+ chars in typeahead; see results within 20 entries; select one; confirm save uses that id.

---

## Prompt 7 — Mobile UX Pass (Responsive, Tappable, Fast)

User note: Makes the app easier to use on phones (big tap targets, less horizontal scrolling, faster lists).

Change summary
- Navigation: hide/collapse left sidebar on mobile; add a top/bottom nav with key routes (Dashboard, Projects, Assignments, Calendar, Profile).
- Lists: switch wide tables to cards on small screens; show essential fields first; “View details” opens a drawer/sheet.
- Inputs: increase tap targets; use mobile input types; avoid tiny dropdowns; prefer segmented controls and native date pickers when possible.
- Performance: virtualize long lists; debounce searches; minimize images; lazy‑load noncritical components.

Files to edit
- Frontend only; touch `App.tsx`, layout components, and the largest tables (Projects, Assignments, People). No backend changes.

Agent tests (automated)
- Basic snapshot/responsiveness checks if framework is present (otherwise skip).

User tests (UI)
- On a phone or responsive dev tools: navigate key routes; verify no horizontal scroll; all main actions reachable with big tap targets.

---

## Final Acceptance Checklist
- Concurrency: 412 conflict protection active; forms handle conflicts gracefully.
- Cache isolation: logging in/out clears caches; user‑scoped keys prevent stale cross‑user data.
- Sessions: list and revoke works; logout blacklists refresh; revocation requires re‑login.
- Admin workflow: create/list/delete users; change roles; enable/disable; audit entries created.
- People search: typeahead fast for large directories.
- Mobile UX: responsive, tappable, smooth lists.

Notes
- Aim to complete each prompt end‑to‑end (code + quick tests) before moving forward to reduce integration risk.
- Keep endpoint names and request headers exactly as specified to avoid frontend/backend mismatches.
