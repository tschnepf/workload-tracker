# PROJECT_UI_CROSS_USER_SYNC_PLAN.md

## Goal
Make UI updates visible across **all users**, not just across tabs. First phase is **Projects only**, then expand to everything else.

## Recommended Transport (Phased)
**Phase 1: SSE (Server‑Sent Events)** for Projects
- Lightweight, one‑way push from server to clients.
- Easy to deploy behind existing infra.
- Works well with existing React Query cache patterns.

**Phase 2+: WebSockets (optional upgrade)**
- If we want bi‑directional interactions or presence/typing indicators later.

---

## Phase 1 — Projects (First Priority)
### Scope
- Project list + project details + project dashboard
- Changes that should broadcast:
  - Project status changes
  - Project fields (name, number, client, dates, description)
  - Notes save

### Backend Work
1) **Event publisher**
   - On project update/create/delete, publish a normalized event:
     ```json
     {
       "type": "project.updated",
       "projectId": 123,
       "fields": ["status", "client"],
       "updatedAt": "...",
       "actorUserId": 42
     }
     ```
2) **SSE endpoint**
   - Add `GET /api/events/` (auth required)
   - Push events to all connected clients
   - Keepalive/heartbeat every ~25s to avoid idle timeouts
3) **Broker (Redis)**
   - Use Redis pub/sub or a lightweight channel layer to fan‑out events.
4) **Rate limiting + filtering**
   - Allow client to specify `?projectId=123` (optional) to scope stream.

### Frontend Work
1) **Event client**
   - Add SSE client in a single app‑level hook (e.g., `useLiveEvents()`)
2) **Projects handler**
   - On `project.updated`, update React Query caches:
     - `['projects']` (list pages)
     - `['projects', projectId]` (detail)
     - invalidate filter metadata if relevant
3) **Guard against self‑echo**
   - If event actor is current user, optionally skip refetch and just merge.
4) **Failover**
   - If SSE disconnects, retry with backoff
   - Optional: fallback to periodic refetch (e.g., 60s)

### Validation
- Two different users update same project status; other user sees change without refresh.
- Notes updates appear in list/details in < 2s.

---

## Phase 2 — Deliverables + Assignments
### Scope
- Deliverables list (projects list columns)
- Deliverables detail + notes
- Assignments grid + project dashboard assignments

### Backend Events
- `deliverable.created/updated/deleted`
- `assignment.created/updated/deleted`

### Frontend
- On deliverable events:
  - update deliverables bulk maps
  - invalidate deliverables detail list
- On assignment events:
  - invalidate assignment lists + dashboards

### Validation
- Cross‑user deliverable changes update list columns
- Cross‑user assignment changes update dashboards

---

## Phase 3 — Everything Else
### Scope
- Risks
- Pre‑deliverable settings
- Reports/forecast widgets
- Any remaining project‑related edits

### Backend Events
- `risk.updated`, `predeliverable.updated`, etc.

### Frontend
- Targeted cache invalidation per page/section
- Avoid full‑page refetches where possible

---

## Rollout Plan
1) **Implement Projects SSE**
2) Enable behind feature flag
3) Verify on staging with 2 users
4) Roll to prod
5) Expand to Deliverables/Assignments

---

## Risks & Mitigations
- **Event storms** → debounce + collapse per project
- **Out‑of‑order updates** → include `updatedAt` and ignore stale events
- **Network instability** → reconnect with jitter + heartbeat

---

## Success Criteria
- Project edits appear for other users within ~1–2 seconds.
- No manual refresh needed for list/detail/dashboard.
- No flicker or repeated refetch storms.
