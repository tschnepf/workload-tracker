# R6: Multi‑User Concurrency, Session Safety, and Mobile UX — Roadmap Spec

Context
- Clarification: multiple different people may be logged in concurrently and editing Projects, Assignments, and People at the same time.
- Goal: Protect simultaneous edits, isolate caches per user, provide session controls, strengthen admin workflows, scale people lookup, and improve mobile UX.
- Style: Small, safe steps. Each prompt is prescriptive (files, endpoints, headers). Include a testing checkpoint at least every 7 prompts.

Guidelines (read once)
- Keep FE/BE names aligned exactly as specified; avoid workarounds.
- After each prompt, run quick tests before continuing.
- Prefer minimal migrations per step to reduce blast radius.

====================================================================
PHASE 1 — Optimistic Concurrency (Prevent overwrites)
====================================================================

Prompt P1 — Backend: Add ConcurrencyETagMixin
// User note: Adds a standard way for the server to tell the client “what version you have” using ETag.
- Add a mixin (e.g., `backend/core/concurrency.py`) with helpers:
  - `make_etag(obj)`: returns a strong ETag string from `obj.id` + `obj.updated_at`.
  - `set_etag(response, obj)`: attaches `ETag: "<hash>"`.
  - `require_if_match(request, obj)`: reads `If-Match` header and raises 412 if mismatch/absent.
- No behavior change yet; just utilities and unit tests for hashing/headers.

Prompt P2 — Backend: Apply ETag to People detail
// User note: Person GET returns ETag; PATCH requires If‑Match to avoid overwrites.
- In `backend/people/views.py` detail retrieve → set ETag.
- In update/partial_update → call `require_if_match` before saving.
- Ensure serializer exposes `updatedAt` (maps to `updated_at`).

Prompt P3 — Backend: Apply ETag to Projects detail
// Same as P2 for Projects.

Prompt P4 — Backend: Apply ETag to Assignments detail
// Same as P2 for Assignments.

Checkpoint C1 (after P1–P4)
- Agent tests: For each resource, GET → capture ETag, PATCH with If‑Match → 200; change elsewhere → PATCH with stale If‑Match → 412.
- User test: Two browser tabs editing the same Person; Tab A saves; Tab B save returns an error (412) in network panel.

====================================================================
PHASE 2 — Frontend conflict handling (412 awareness)
====================================================================

Prompt P5 — Frontend: ETag tracking + If‑Match header
// User note: The browser will send back the version it last saw when saving.
- `frontend/src/services/api.ts`: store last ETag from GET detail (e.g., via a small map keyed by resource URL) and automatically attach `If-Match` on PATCH/PUT for those resources.
- Map `412` to a typed `ApiError` (e.g., `name='ConcurrencyError'`).

Prompt P6 — Frontend: Person form conflict UI
// User note: If someone else saved first, show a banner and offer a reload button.
- In `frontend/src/pages/People/PersonForm.tsx` (or equivalent):
  - Catch `ConcurrencyError` → show a non‑blocking banner: “This item was updated by someone else. Reload latest.”
  - “Reload latest” re‑GETs and repopulates the form.

Prompt P7 — Frontend: Project form conflict UI
// Same as P6 for Project edit.

Prompt P8 — Frontend: Assignment form conflict UI
// Same as P6 for Assignment edit.

Checkpoint C2 (after P5–P8)
- User test: Repeat two‑tab test; confirm the conflict banner appears and “Reload latest” refreshes data.

====================================================================
PHASE 3 — User‑scoped caching & auth transitions
====================================================================

Prompt P9 — Frontend: Scope caches by user id
// User note: Prevents stale data from User A appearing after User B logs in on the same machine.
- `frontend/src/services/api.ts`: prefix response/inflight cache keys with `uid:<id>|…` using current auth store user id; include a fallback `uid:anon` when logged out.

Prompt P10 — Frontend: Clear caches on login/logout
// User note: Guarantees fresh data after logging in/out.
- Add `clearCaches()` in API module; call it from auth store on login/logout and on `reloadProfile()`.

Checkpoint C3 (after P9–P10)
- User test: Log in as A → browse lists; log out; log in as B → ensure data refetches (no stale list content).

====================================================================
PHASE 4 — Sessions: List & Revoke (logout blacklisting)
====================================================================

Prompt P11 — Backend: Token session model
// User note: Track where you’re logged in so you can revoke specific sessions.
- Add `TokenSession(user, jti, issued_at, last_used_at, ip, user_agent, is_active)` with migration.

Prompt P12 — Backend: Hook SimpleJWT views
// Capture session on obtain/refresh; update last_used, ip, agent.
- In throttled token views, after successful issue/refresh, create/update TokenSession.

Prompt P13 — Backend: Sessions endpoints
// List and revoke own sessions.
- `GET /api/auth/sessions/` → list current user sessions.
- `POST /api/auth/sessions/revoke/` → body `{ sessionId }` → mark inactive and blacklist refresh token (and descendants) if applicable.

Prompt P14 — Frontend: Profile → Active Sessions UI
// Show table of sessions with “Revoke” buttons.
- Add to `frontend/src/pages/Profile/Profile.tsx` a simple sessions table with IP, device, last seen, revoke button.

Checkpoint C4 (after P11–P14)
- Agent test: Create two sessions; list returns two; revoke one; subsequent refresh in revoked context fails.
- User test: Log in on two browsers; revoke one from Profile; confirm the other requires re‑login on next action.

====================================================================
PHASE 5 — Admin enhancements: Role change + enable/disable + audit
====================================================================

Prompt P15 — Backend: Toggle active (admin)
// User note: Temporarily disable an account without deleting.
- `POST /api/auth/users/{id}/toggle_active/` flips `is_active`; return updated user.

Prompt P16 — Backend: Change role (admin)
// Promote/demote users; set `is_staff` and groups consistently.
- `POST /api/auth/users/{id}/change_role/` with `{ role: 'admin'|'manager'|'user' }`.

Prompt P17 — Backend: AuditLog model + writes
// Record critical account operations for accountability.
- Model: `AuditLog(actor, action, target_type, target_id, meta, created_at)`.
- Write logs on create_user, delete_user, set_password, toggle_active, change_role.

Prompt P18 — Frontend: Settings → Users management
// Add role dropdown and enable/disable toggle; optional “Recent Admin Actions” table.
- Extend `frontend/src/pages/Settings/Settings.tsx` to call new endpoints and display results.

Checkpoint C5 (after P15–P18)
- User test: Change a user’s role; ensure permissions reflect after re‑login. Disable a user; ensure login fails. Check an admin actions log (if enabled).

====================================================================
PHASE 6 — Scalable People search (typeahead)
====================================================================

Prompt P19 — Backend: People search + indexes
// User note: Fast lookups for large directories.
- `GET /api/people/search/?q=...&limit=20` (min length 2; cap 50); match icontains on name/email.
- Add functional indexes on LOWER(name), LOWER(email) via migration.

Prompt P20 — Frontend: Async typeahead component
// Replace large dropdowns (e.g., in admin create-user) with debounced search.
- Build a reusable typeahead with 250–300ms debounce, keyboard nav; swap into places that select People.

Checkpoint C6 (after P19–P20)
- User test: Type 2+ chars; see up to 20 results; select a person; save uses correct id; performance is smooth.

====================================================================
PHASE 7 — Mobile UX improvements (responsive + performance)
====================================================================

Prompt P21 — Navigation for mobile
// User note: Make primary actions reachable without side‑scroll.
- Collapse/hide left sidebar under small breakpoints; add top/bottom nav to key routes (Dashboard, Projects, Assignments, Calendar, Profile).

Prompt P22 — Responsive Projects list
// Convert table → cards on small screens; essential fields first; “View details” opens drawer.

Prompt P23 — Responsive Assignments list
// Same card approach; ensure quick filter access.

Prompt P24 — Virtualize large lists
// Use react‑window (or similar) for People/Projects on desktop/mobile; caps DOM nodes.

Prompt P25 — Accessibility + input polish
// Increase tap targets to 44px; mobile input types; ARIA roles/labels; improve focus states.

Checkpoint C7 (after P21–P25)
- User test: Use mobile/responsive tools; verify no horizontal scroll, big tap targets, smooth scrolling; main actions accessible.

====================================================================
OPTIONAL PHASE 8 — Token hardening & observability (enterprise)
====================================================================

Prompt P26 — Cookie‑based refresh (httpOnly) + CSRF for refresh
// Stronger XSS posture; behind an env flag; keep current JWT flow as fallback.
- Move refresh to httpOnly SameSite=Strict cookie; add CSRF token to refresh POST; document env vars and rollout.

Prompt P27 — Observability and metrics
// Structured logs; Sentry tags; auth metrics; dashboards.
- Add request id, user id tags to logs; instrument auth endpoints; add Sentry tags for user and route (PII‑safe); doc dashboards.

Final Acceptance
- Concurrency safe (412 + UX), user‑scoped caches, session list/revoke, admin controls (role/active/audit), people search at scale, and mobile‑friendly UX.

