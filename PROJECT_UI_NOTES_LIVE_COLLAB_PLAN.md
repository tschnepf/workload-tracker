# Project Notes Live Collaboration Plan (TipTap + Yjs + Hocuspocus)

Date: 2026-01-24  
Owner: Frontend + Backend  
Scope: Project notes and scratch pad rich-text editing (TipTap)

## Goals
- Enable live multi-user collaboration for notes with conflict-free merges.
- Preserve server authority and persistence without relying on client caches.
- Support presence (cursors/avatars) and real-time updates across tabs/devices.
- Maintain compatibility with existing TipTap JSON content.

## Current State (Baseline)
- Notes editor uses TipTap (`ProjectNotesEditor.tsx`).
- Backend stores canonical TipTap JSON (models/serializers/types reference TipTap JSON).
- Scratch pad updates currently flow through direct API updates.

## Architecture (Target)
- **Client**: TipTap + Yjs bindings (y-prosemirror).
- **Realtime server**: Hocuspocus (self-hosted) for Yjs document sync.
- **Persistence**: Store Yjs updates or snapshots in the backend DB.
- **Identity**: Authenticate via existing backend session/JWT; Hocuspocus validates tokens.

---

## Plan

### 1) Choose Yjs integration for TipTap
**Client Libraries**
- `yjs`, `y-prosemirror`, `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-cursor`

**Client Responsibilities**
- Create a Yjs document per note.
- Bind TipTap editor state to Yjs via `Collaboration` extension.
- Connect to Hocuspocus provider with auth token + document name.
- Show presence (name/color) for collaborators.

**Document IDs**
- Notes: `project:{projectId}:notes`
- Scratch pad: `project:{projectId}:scratch`

---

### 2) Stand up Hocuspocus server (self-hosted)
**Service**
- Node-based Hocuspocus server running as its own container/service.

**Auth**
- `onAuthenticate` validates token by calling backend or verifying JWT.
- Reject unauthorized connections and enforce per-project access.

**Persistence Hooks**
- `onLoadDocument` pulls persisted state from backend.
- `onStoreDocument` saves updates/snapshots to backend.

---

### 3) Persistence Strategy
**Option A (recommended): Yjs update log**
- Store Yjs updates in DB (append-only) and compact periodically.
**Option B: Snapshot**
- Store a binary snapshot on each save or at intervals.

**Compatibility**
- On first load, if no Yjs state exists:
  - Convert existing TipTap JSON into Yjs state and persist.
  - Mark note as migrated.

---

### 4) Backend Changes
**API**
- Add endpoints to read/write Yjs state for notes.
- Support fetching existing TipTap JSON for initial migration.

**Data Model**
- Add tables/columns for Yjs state:
  - `project_notes_yjs_state`
  - `project_scratch_yjs_state`

**Migration**
- Backfill Yjs state from existing TipTap JSON on demand.
- Keep JSON field for compatibility until rollout completes.

---

### 5) UI/UX Behavior
- Notes become live collaborative; updates appear instantly.
- Presence indicators: avatars, cursor colors, names.
- Offline: local edits sync when reconnected.
- Error handling: show “Reconnecting…” + disable save buttons (if any).

---

### 6) Rollout Strategy
1. Ship Hocuspocus server behind a feature flag.
2. Enable collaboration for internal users only.
3. Migrate existing notes on first open.
4. Expand to all users, then remove legacy JSON-only editor flows.

---

## Validation
- Two users edit same note and see real-time updates.
- No data loss when a user disconnects and reconnects.
- Existing notes load and are migrated correctly.
- Access control prevents unauthorized project access.

## Risks / Mitigations
- **Scaling**: Hocuspocus needs horizontal scaling with sticky sessions or shared state.
- **Persistence size**: Use compaction to prevent large update logs.
- **Auth latency**: Cache auth results for short intervals.

## Definition of Done
- Project notes and scratch pad support live collaboration.
- Realtime edits are conflict-free and persistent.
- Legacy JSON-only flow can be retired without data loss.
