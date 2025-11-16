# Integrations Hub (BQE First) — Lean Implementation Plan

This plan defines a phased, prescriptive path to implement an extensible Integrations Hub UI and backend, starting with BQE CORE. Each step is a prompt that can be re‑fed to the AI agent. All work must follow lean programming best practices: build only what is necessary, keep designs simple and composable, avoid shortcuts/quick fixes/band‑aids, and coordinate backend and frontend changes precisely to prevent mismatches.

Guardrails
- No shortcuts or band‑aids; prefer small, composable, reversible changes.
- Keep cross‑module contracts explicit and versioned; do not couple UI to provider internals.
- Use typed interfaces, JSON Schema for dynamic configs, and clear API contracts.
- Secure secrets at rest and in transit; never hardcode sensitive values.
- Add tests per phase before moving forward; prefer fast unit tests first.
- Provider metadata and API contracts must be versioned and validated on load; fail fast with helpful errors when invalid.
- External HTTP calls must use a shared client with timeouts, retries/backoff, `Retry-After` respect, and header redaction; never log secrets.
- Enforce read‑only maintenance guardrails (lock file + env flag) and allowlist only essential endpoints during restore windows (health, jobs, OAuth callback).
- Background tasks must be idempotent and locked per provider+connection+object to avoid concurrent duplication.

Outcomes
- An Integrations Hub page that lists providers, supports connecting to BQE via OAuth, allows configuring fields, rules, sync intervals/behaviors, and triggers syncs.
- A metadata‑driven backend (provider registry + JSON Schemas) so the UI renders forms without hardcoding provider fields.
- Celery‑based background tasks and a lightweight planner to execute incremental syncs for Projects (first), extensible to other objects later.

---

## Phase 0 — Foundations and Provider Research

Prompt: “Create a lightweight technical brief (prompts/INTEGRATIONS-HUB-FOUNDATION-NOTES.md) summarizing BQE CORE API auth flow options (Client Credentials vs Authorization Code + PKCE), required headers (company/tenant), base URL and Projects endpoint, pagination, rate limits, and scopes. Keep it concise and link to source URLs. This is a reference for future steps.”

Prompt: “Define a provider metadata format (YAML or JSON) for integrations, stored under `backend/integrations/providers/<provider>/provider.json`. Include: provider key, display name, OAuth config (auth URLs, required scopes, flow type), required headers (e.g., company ID header key), objects (e.g., projects) with field catalog and capabilities (list, delta), and default sync behaviors. Keep schema minimal and versioned.”

Prompt: “Add `backend/integrations/provider.schema.json` and validate every `provider.json` against it at startup. Include fields: `providerSchemaVersion`, `displayName`, `oauth` (with `flows`, `scopes`, `authBaseUrl`), `requiredHeaders` (with `key`, `label`, `source: env|connection`, `envKey?`), `baseUrlVariants` (prod/sandbox/region), `rateLimits` (e.g., `requestsPerMinute`, `burst`, `maxConcurrentPerConnection`, `globalRequestsPerMinute`), and `objects` (with `key`, `label`, `fields`, `capabilities`). Treat rate limits as configuration derived from BQE documentation/support or env overrides, not hard‑coded constants, and allow them to be tuned without code changes. Loader must be forward‑compatible (ignore unknown keys) and surface a readable error when validation fails.”

Prompt: “Identify and document BQE Projects hierarchy semantics so we only import parent projects: determine the exact field(s) indicating hierarchy (e.g., `parentId`, `parentProjectId`, `isSubProject`, `level`) and the server‑side filter recommended by the API to return only top‑level projects. Add this into provider.json under objects.projects as `hierarchy: { parentKey: string, childPredicate?: string }` and `filters: { parentOnly: { query: string, description: string } }`. Validate with 1–2 tested queries in API Explorer.”

Prompt: “Add `cryptography` (for Fernet/MultiFernet) and `jsonschema` (or a comparable JSON Schema validator) to `backend/requirements.txt`, rebuild the backend image, and document the new dependencies in README/SETUP so the provider registry and encryption helpers run without import errors.”

Testing
- Verify provider.json loads and validates against a minimal JSON Schema using a unit test.
- Add a failing unit test for malformed metadata (missing required headers or unknown flow) to ensure graceful errors and helpful messages.

---

## Phase 1 — Backend Domain + API Skeleton

Prompt: “Add a new Django app `backend/integrations/` with models: IntegrationProvider, IntegrationConnection, IntegrationSetting (JSON), IntegrationRule (JSON), IntegrationJob (status, payload, logs), EncryptedSecret (Fernet, key via env `INTEGRATIONS_SECRET_KEY`), and IntegrationExternalLink using a structured discriminator to map `(provider, object_type, external_id, connection, local_content_type, local_object_id)` with uniqueness per provider+connection+object+external_id. Use Django `ContentType` for `local_content_type` and an allowlist of permitted models that actually exist today (`projects.Project` for project links and `people.Person` for employees) instead of a free‑form `local_model` string; document how additional target models would be added in future phases. For IntegrationConnection, include fields for `provider`, `company_id` (or equivalent tenant key), `environment` (e.g., sandbox/production), `is_active`, and `needs_reauth`/`is_disabled` flags, and enforce “at most one active connection per (provider, company_id, environment)” via a DB constraint and validation. Use lean models and migrations. Do not over‑engineer.”

Hardening notes
- Use `MultiFernet` key‑ring for secrets to support rotation; store `key_id` with each secret and tolerate legacy decrypt.
- Add validation hooks that block startup when `INTEGRATIONS_SECRET_KEY` is required but missing while `INTEGRATIONS_ENABLED=true`.
- Enforce a unique constraint on `IntegrationExternalLink` for `(provider, object_type, connection, external_id)` so multiple connections cannot collide on the same external id, and enforce the allowlist at the model/service layer so links can only target approved local models; prefer explicit enums/choices in code over arbitrary content types for long‑term stability.

Prompt: “Implement a provider registry loader that discovers `provider.json` files in `backend/integrations/providers/*` and exposes them via a service (`registry.py`). Provide functions: list_providers(), get_provider(key), get_object_catalog(provider, object_key). Add unit tests.”

Prompt: “Registry must validate `provider.json` against `provider.schema.json`, record the `providerSchemaVersion`, and expose `baseUrlVariants`, `requiredHeaders`, and `rateLimits`. Use `rateLimits` to drive both per‑connection concurrency (e.g., `maxConcurrentPerConnection`) and a simple global per‑provider throttle (e.g., `globalRequestsPerMinute`) so multiple rules/connections share a single BQE budget. Unknown fields are ignored but preserved in the raw metadata for forward compatibility.”

Prompt: “Create REST endpoints (Django REST Framework) under `/api/integrations/` to: list providers, get provider details, create/update a connection (without secret values returned), fetch current connection status, and list available objects/fields from provider metadata. Ensure OpenAPI schema generation is accurate.”

Hardening notes
- Default permission override: use `IsAdminUser` in addition to the global role guard for all Integrations endpoints; mark secret fields `write_only` in serializers and OpenAPI.
- Extend `/api/capabilities/` to return an `integrations` object (e.g., `{ enabled: bool, providers: [...] }`) alongside the existing keys so the frontend can gate UI affordances, regenerate OpenAPI + `systemApi` typings, and document that non-admins will still see `integrations.enabled=false` when the env flag is off.

Prompt: “Implement simple encryption utilities for secrets using Fernet with `INTEGRATIONS_SECRET_KEY`. Store tokens securely; never log secrets. Add unit tests covering encrypt/decrypt and model save/load. Support MultiFernet key rotation by tracking a `key_id` on EncryptedSecret rows, and document a rotation runbook in `docs/integrations/key-rotation.md` (rotate key, reload app, verify old tokens decrypt, confirm new writes use the newest key).”

Prompt: “Implement `redact_sensitive(data)` helper and apply in any logging for HTTP/OAuth to remove `Authorization`, `client_secret`, `refresh_token`, and `code` parameters. Explicitly enumerate BQE PII fields (e.g., names, emails, phone numbers) and ensure they are omitted or strongly redacted from logs, metrics, and job payload snapshots.”

Prompt: “Add `requests` to backend requirements and create a shared HTTP client utility with sane defaults (timeouts, retries with backoff, JSON parsing, and 429 handling) under `backend/integrations/http.py`.”

Prompt: “Shared HTTP client must use a `requests.Session` with `Retry(total=5, backoff_factor=0.5, status_forcelist=[429,502,503,504])`, set default timeouts `(connect=5, read=30)`, propagate `X-Request-ID`, and respect `Retry-After` headers.”

Prompt: “Extend `projects.Project` with fields to preserve BQE’s original client while allowing a local display client override: add `bqe_client_name: CharField(null=True, blank=True)` and optionally `bqe_client_id: CharField(null=True, blank=True)`. Introduce a per-project `client_sync_policy_state` (or similar) column so we can record which policy last ran (`preserve_local`, `follow_bqe`, `write_once`) and whether manual edits have diverged. Update serializers to expose `bqeClientName`, `bqeClientId`, and `clientSyncPolicyState` (read-only by default) while keeping the existing `client` field as the human-facing “Local Client”. Also add an `inactive` status choice to `Project.status` for archival flows (keeping the default as `active`), decide whether `is_active` should be flipped in tandem, and update every queryset/filter/serializer that currently hard-filters `is_active=True` so archived projects stay hidden by default but can be fetched explicitly. Propagate the new fields/status/policy metadata through CSV/XLSX exports/imports, OpenAPI + typed clients, React models/helpers, and add read-only badges/tests in the Projects UI so “BQE Client” vs “Local Client” render correctly and manual edits never overwrite `bqe_client_name` unless the policy demands it. Write a migration and unit tests. Do not change existing `client` behavior yet.”

Hardening notes
- Add DB indexes on `bqe_client_name` and `bqe_client_id` for efficient matching; serializers must expose `bqeClientName` and optionally `bqeClientId` as read‑only.
- Ensure any status-based filters in APIs and UI treat `inactive` as excluded by default but still retrievable when explicitly requested for historical reporting.

Testing
- API smoke tests for provider list/detail and connection CRUD.
- Unit tests for provider registry, models, and encryption helpers.
- Unit tests for HTTP client retry and redaction.

---

## Phase 1A — Dev Migrations & Verification

Prompt: “Generate and apply migrations for added fields (e.g., `projects.Project.bqe_client_name` and `bqe_client_id`). Use `python manage.py makemigrations projects` and `python manage.py migrate` inside the backend container. Commit the migration files.”

Prompt: “Confirm dev auto-migrate on container start: ensure `RUN_MIGRATIONS_ON_START=true` (default) so `/entrypoint.sh` runs `migrate`. Validate by observing ‘Running migrations…’ in backend logs on `docker compose up backend`.”

Prompt: “Add a dev-only backfill command `projects_backfill_bqe_client_dev` that sets `bqe_client_name = client` for existing local projects that are not yet linked to BQE. Do not overwrite non-null `bqe_client_name`. Guard with `DEBUG=true` to prevent production use. Document invocation in README.”

Prompt: “During restore windows, keep write operations blocked via `ReadOnlyModeMiddleware`; allowlist only health, jobs, and (in Phase 2) OAuth callback paths.”

Testing
- Run migrations locally and verify `bqe_client_name`/`bqe_client_id` appear in `/api/projects/` responses (update serializers accordingly).
- Execute the dev backfill and assert existing projects now return `bqe_client_name` equal to prior `client`.
- Rebuild frontend types if OpenAPI changes: `npm run openapi:regen`.

---

## Phase 2 — OAuth Handshake (BQE)

Prompt: “Add endpoints for OAuth flows: `/api/integrations/:provider/connect/start` and `/api/integrations/:provider/connect/callback`. Support Authorization Code + PKCE and Client Credentials. For Client Credentials, no redirect is needed; store tokens on server. For Auth Code, use a stateless, signed `state` (include connection id, actor id, expiry). Store `code_verifier` in Redis with TTL. On callback, validate signature/expiry, exchange code for tokens, and persist refresh/access tokens securely.”

Hardening notes
- Update `ReadOnlyModeMiddleware` allowlist to include GET/POST for `/api/integrations/:provider/connect/start`, `/api/integrations/:provider/connect/callback`, and `/api/integrations/:provider/test` so reauth and diagnostics continue working during read-only restores; add regression tests similar to `/api/jobs/` coverage explaining why these routes stay open.
- Use HMAC‑signed state and short TTL; enforce single‑use by deleting PKCE verifier on success/failure.

Prompt: “Add provider‑specific OAuth client for BQE using the auth URLs and scopes defined in provider.json. Implement token refresh. Use the shared HTTP client with retry/backoff and rate‑limit handling.”

Prompt: “Never log token responses; ensure refresh path persists new tokens atomically and rotates `EncryptedSecret` if key rotation is enabled.”

Prompt: “Expose a `GET /api/integrations/:provider/test` endpoint that performs a minimal authenticated call (e.g., whoami/company or projects HEAD) to validate connectivity and permissions. Return clear diagnostics.”

Prompt: “Validate presence of required headers (e.g., company/tenant) from connection/env and return actionable errors when missing.”

Prompt: “Build the callback URL with `request.build_absolute_uri('/api/integrations/bqe/callback')` so it honors proxy headers. No Nginx changes are required because `/api/*` already proxies to the backend.”

Testing
- Local loop test: start → callback → token persisted → `test` passes.
- Unit tests mocking token exchange and refresh flows.
- Unit test that callback is reachable during read‑only mode (allowlisted path).
 - Token error policy tests: simulate transient HTTP failures vs explicit auth errors (`invalid_grant`, revoked client) and assert that transient failures do not flip the connection state, while persistent (>24h) or explicit auth errors set `needs_reauth=true`, optionally `is_disabled=true`, and surface a clear “Admin attention needed” status consumable by the UI.

---

## Phase 3 — Provider Catalog and Field Discovery

Prompt: “Implement `/api/integrations/:provider/catalog` returning objects and fields from provider metadata (projects first). Include data types, nullability, identifiers, and delta support flags. No hardcoding in UI.”

Prompt: “Surface `providerSchemaVersion`, `rateLimits`, and `baseUrlVariants` in the catalog so the UI can show environment help and throttle guidance.”

Prompt: “Add `/api/integrations/:provider/:object/mapping/defaults` to return suggested internal field mappings (from metadata) and allow overrides. Store mapping overrides in IntegrationSetting.”

Hardening notes
- Return mapping defaults as a versioned schema; store per‑object overrides under `settings.mapping[objectKey]` with an explicit `version` (mirroring `objects.<key>.mappingSchemaVersion`) and a `fieldSignatureHash` derived from the provider’s field catalog.
- On load, compare stored `version`/`fieldSignatureHash` with the current provider metadata; when they differ, mark the mapping as `stale=true`, drop entries that reference missing provider fields, and require an explicit re‑save before enabling or running rules that depend on that object.
- In the sync path, either block jobs with a clear error (`Mappings out of date; review in Integrations Hub`) or run in a safe, read‑only mode using only valid mappings while recording a warning in job logs and surfacing “partial mapping” status to the UI.

Prompt: “Expose ‘hierarchy’ and a provider ‘parentOnly’ filter for projects in the catalog response so clients understand that only parent projects are eligible for import and matching.”

Prompt: “Define default field mapping for BQE Projects to set `project.client = bqe.clientName` on first import while also storing `project.bqe_client_name = bqe.clientName` (and `project.bqe_client_id = bqe.clientId` if available). This preserves source data while allowing local overrides later.”

Testing
- Unit tests: catalog retrieval, default mapping generation, and mapping staleness detection when provider fields change (version/hash mismatch).
- API tests: endpoints return stable, typed JSON.

---

## Phase 4 — Rules, Schedules, and Celery Tasks

Prompt: “Define IntegrationRule schema (JSON Schema) supporting: object keys (e.g., projects), field selection, filters, sync interval (cron or simple minutes), sync behavior (full/delta), conflict policy (upsert/skip, and auto‑create for unmatched), a `deletionPolicy` for remote deletions/archivals, an explicit `includeSubprojects` boolean defaulting to false, and an `initialSyncMode` enum to control the first run. For BQE, enforce `includeSubprojects=false` at validation time (parent‑only import). Add a field‑level policy for ‘client’ updates: `clientSyncPolicy` with options `preserve_local` (default), `follow_bqe`, `write_once`, and an optional `dryRun` boolean (default false) for early rollout that executes fetch/mapping but skips upserts, recording only metrics and logs. Validate rules on save.”

Prompt: “Model `deletionPolicy` with options such as `mark_inactive_keep_link` (default for BQE Projects), `ignore`, or `soft_delete`. For `mark_inactive_keep_link`, when a BQE project is marked deleted/archived, set the local Project status to `inactive`, retain the `IntegrationExternalLink` for history/matching, and stop further field updates during sync (aside from status changes).”

Prompt: “Model `initialSyncMode` with options like `full_once`, `delta_only_after_date`, and `delta_only_from_now`, plus an optional `initialSyncSince` timestamp when using `delta_only_after_date`. The planner must treat the first execution differently based on this setting (e.g., run one full historical backfill when `full_once`, otherwise seed the high‑water mark from `initialSyncSince` or ‘now’ and never perform a full backfill). Persist the effective initial high‑water mark into `settings.state[objectKey]`.”

Hardening notes
- Add per connection+object locking (Redis cache key) to prevent concurrent jobs.
- Compute and persist `nextRun` with small jitter (±10%) to avoid thundering herds after restarts.
- Store a rule `revision` and include it in task idempotency keys to safely reprocess after mapping/rule changes.
- After a database restore older than a configurable threshold (e.g., 7–30 days), mark all IntegrationConnection records as `needs_reauth=true` and set a per connection+object `resync_required` flag instead of silently resuming schedules; do not auto‑enqueue full backfills. Subsequent syncs must be triggered explicitly via an admin‑driven resync flow in the UI with a selectable scope.
 - If Celery workers or Redis are unavailable (as indicated by existing health checks), treat integrations scheduling as paused: disallow new sync requests and planner enqueues, and return a clear “background worker unavailable, sync temporarily paused” error rather than queueing jobs that will never run. Surface this state via `/api/integrations/health` so the UI can display an explicit banner.
- Reuse the existing `/api/jobs/:id` status/download endpoints for integration runs: enqueue Celery tasks the same way other background jobs do, store provider/object metadata in `IntegrationJob` only for filtering/auditing, and do not introduce a parallel polling API.

Prompt: “Implement Celery tasks for integration jobs (fetch pages, map, upsert). Report progress via Celery task meta. Add a lightweight ‘planner’ Celery beat task that scans enabled rules and enqueues due jobs. Reuse existing job status/download endpoints.”

Prompt: “Use task options `acks_late=true`, `soft_time_limit`, and `time_limit`; set worker prefetch to 1 (already in compose).
Persist last processed cursor/high‑water‑mark under `settings.state[objectKey]` for delta iteration.”

Prompt: “Create scheduler logic: when a rule is saved/enabled, compute next run. The planner enqueues due jobs. Provide `/api/integrations/:provider/jobs` to list recent jobs. Add locking to prevent concurrent jobs per connection+object.”

Testing
- Unit tests for rule validation and schedule calculation.
- Worker dry‑run test creating a fake job and asserting handled states.
- Concurrency test: ensure a second job is skipped when a lock is present.
 - Dry‑run mode tests: when `dryRun=true`, verify that fetch/mapping/metrics execute but no database upserts occur.

---

## Phase 5 — Frontend Integrations Hub UI

> Complete `prompts/SETTINGS-UI-REFACTOR.md` first so the Settings page uses the split-pane navigation; these prompts assume the Integrations Hub plugs into that refactored layout as its own section.

Prompt: “Add an Integrations section under Settings (admin-only) with: Providers list (card/grid), connection status badges, and a ‘Connect’ CTA that initiates OAuth (or Client Credentials form). Keep components small, typed, and reusable.”

Note: “Plug the section into the split-pane Settings layout (`frontend/src/pages/Settings/sections/index.tsx`). Replace the temporary `IntegrationsPlaceholderSection` by registering the real component with metadata (`requiresAdmin=true`, `featureFlag: caps => !!caps?.integrations?.enabled`). Ensure the section consumes shared auth/capability state via `useSettingsData` per `docs/settings-overview.md`.”

Prompt: “Build a metadata-driven Config panel: fetch provider catalog and JSON Schemas, render dynamic forms (minimal internal renderer) for connection parameters and rules (fields, filters, intervals, behaviors). No provider-specific hardcoding in UI.”

Hardening notes
- Gate all UI on the typed `/api/capabilities/` `integrations.enabled` flag (after regenerating the OpenAPI + `useCapabilities` hook typings) and hide actions when disabled or when the viewer lacks admin rights.
- Render warnings when provider metadata version is unknown or mismatched.

Prompt: “Add a Mapping UI for selected object (projects): show provider fields vs internal fields, default suggestions (from `/mapping/defaults`), editable with validation. Persist to IntegrationSetting.”

Prompt: “Add a Sync Controls panel: Start one‑off sync, view last run, next scheduled run, and recent job history with statuses. Include a minimal Log view.”
 
Prompt: “In the Rules form, show an ‘Include subprojects’ toggle that is disabled and off by default for BQE (parent‑only enforced). Display helper text that only top‑level projects will be imported.”

Prompt: “In the Mapping/Rules UI, display both ‘BQE Client’ (read‑only from last sync) and ‘Local Client’ (editable, stored in `project.client`). Add a `clientSyncPolicy` selector with defaults from provider/rule metadata. Provide an action to ‘Reset Local Client to BQE’ that copies `bqe_client_name` into `client`.”

Prompt: “When the backend indicates a database restore and `resync_required=true` for a connection, present an admin‑only ‘Post‑restore resync’ wizard in the Sync Controls UI. Let the admin select which objects to resync (starting with Projects, but future‑proofed for People, Hours, etc. via the provider catalog) and, optionally, from which date to resume for each object. Use these selections to create one‑off resync jobs and to reset high‑water marks in line with the existing `initialSyncMode` semantics, then clear the `resync_required` flag.”

Prompt: “When integrations health indicates Celery/Redis are unavailable or degraded for a provider, disable one‑off sync buttons and rule enable/disable actions in the Sync Controls UI and show a clear ‘Sync temporarily paused (background worker offline)’ banner instead of allowing users to trigger jobs that cannot run. Once health recovers, automatically re‑enable the controls.”

Testing
- UI unit tests for form rendering from schema and validation.
- Integration tests for fetch → render → save flows using mock server.

---

## Phase 6 — BQE Projects Sync Implementation

Prompt: “Implement BQE client methods for Projects using the shared HTTP client: list (paged), optional updated‑since filter (if available), field projection, and a server‑side ‘parentOnly’ filter from provider metadata. Respect rate limits and backoff. As a safety net, drop any returned item with a non‑null `hierarchy.parentKey` or matching `childPredicate`. Map provider fields to internal model using saved mappings.”

Hardening notes
- Normalize pagination (offset/limit vs next‑link) behind a single iterator; cap page size and retry transient 5xx/429 honoring `Retry-After`.
- Normalize timestamps to UTC for `updatedSince`.

Prompt: “Implement idempotent upsert into internal Projects store (or a dedicated staging table if needed). Use provider’s stable IDs as keys. Record source metadata (provider, connection, sync timestamp). Always update `bqe_client_name` (and `bqe_client_id` if available). Update `client` according to `clientSyncPolicy`: `preserve_local` (do not overwrite if `client` diverged from `bqe_client_name`), `follow_bqe` (always copy BQE value into `client`), or `write_once` (set on first import only).”

Prompt: “Apply the rule’s `deletionPolicy` when BQE marks a project as deleted/archived (per provider metadata). For the default BQE policy `mark_inactive_keep_link`, set the local Project status to `inactive`, keep the `IntegrationExternalLink` for historical reference, and skip further field updates for that project on subsequent syncs while still allowing it to participate in historical reporting.”

Prompt: “Compute idempotency keys per page and per item (connection+provider+object+externalId) and upsert with conflict handling. Record counts, errors, and skipped children.”

Prompt: “Wire Projects rule execution into the job runner: read rules, fetch pages, apply mapping, upsert, record counts and errors. Provide metrics summary in job result.”

Testing
- Unit tests for BQE client pagination and mapping logic (mock HTTP).
- Verify only parent projects pass: mock responses with a mix of parent/child; assert post‑filtering drops children.
- Worker integration test: create a Projects rule, enqueue job, verify upsert results and metrics.
 - Client policy tests: verify `client` remains unchanged when diverged and policy is `preserve_local`; verify overwrite when `follow_bqe`; verify one‑time set when `write_once`.”
- Retry tests: inject transient 429/503 and assert backoff and `Retry-After` are respected.

---

## Phase 6A — Initial Matching Wizard (One‑Time)

Prompt: “Add an Initial Matching flow for Projects: after connecting BQE and before enabling automatic sync, fetch BQE parent projects only (apply the provider ‘parentOnly’ filter) and load local projects. Pre‑match using deterministic keys (e.g., exact `project_number`, then case‑insensitive name+client). Present a review UI with statuses: matched (auto), unmatched, conflicts. Allow the admin to confirm or modify matches. Persist final pairings as `IntegrationExternalLink` (provider='bqe', object='project', external_id -> local_project_id). Do not write or mutate BQE.”

Prompt: “Add a backend endpoint to compute suggested matches and accept confirmed mappings in a single transaction. Validate external_id/local_id pairs, reject duplicates, and return a summary (matched, changed, skipped).”

Prompt: “Once initial matching is confirmed, enable the Projects rule with the chosen sync behavior. For future syncs, when new BQE projects appear, auto‑link by stable keys (e.g., project_number). If unmatched and the rule’s policy is ‘auto‑create unmatched’, create new local Projects; otherwise include in the next matching review list.”

Testing
- Unit tests for matching heuristics (exact id, name+client) and conflict detection.
- API tests for suggested matches and confirmation transactions.
- UI tests for the wizard (load suggestions → user edits → submit → summary shown).

---

## Phase 7 — Observability and Admin Tools

Prompt: “Add structured logging (request IDs, provider, connection, object) and metrics (jobs run, items processed, success/error rates). Provide `/api/integrations/health` with minimal health summary, including Celery/Redis worker health and whether integrations scheduling is currently paused due to background worker unavailability.”

Prompt: “Add logging redaction guard (headers/body fields: Authorization, client_secret, refresh_token, code). Enforce correlation via `X-Request-ID` propagation to the HTTP client.”

Prompt: “Update `docs/settings-sections.md` and `docs/settings-overview.md` when the Integrations section is wired up so the regression checklist and contributor guide cover the new workflows (search visibility, deep links, feature-flag gating).”

Prompt: “Add a simple Admin screen in the Integrations UI for viewing job history with filters (provider/object/status) and retry action button. Surface IntegrationConnection health here as well: show when a connection has `needs_reauth` or has been unable to connect to BQE for more than 24 hours, with a clear ‘Admin attention needed’ banner and actions to revoke tokens, force re‑connect, or temporarily disable the connection without deleting it. Ensure APIs already exist.”

Testing
- Verify logs include correlation IDs and sensitive data is not logged.
- API/UI tests for job listing and retry.

---

## Phase 8 — Security and Access Control

Prompt: “Restrict Integrations endpoints to admin roles (backend permission class + frontend route guard). Add audit logging for connect/disconnect, rule changes, and manual sync triggers.”

Hardening notes
- Override default permissions with `IsAdminUser` on all Integrations views irrespective of the global role guard; add explicit tests.
- Ensure OpenAPI marks secrets `writeOnly` and never includes example secret values.”

Prompt: “Ensure all secrets (client secret, access/refresh tokens) are encrypted at rest and never returned to the frontend. Redact sensitive fields in logs and responses.”

Testing
- Permission tests for all endpoints.
- Secret redaction tests and encryption at rest verification.

---

## Phase 9 — End‑to‑End Testing Plan (Agent‑Runnable)

Prompt: “Add backend unit tests covering: provider registry, OAuth client (mocked), encryption helpers, rule validation, Celery tasks/planner, BQE client pagination, and mapping logic.”

Prompt: “Add backend integration tests: connect callback flow (mock provider), projects sync Celery job end‑to‑end with mocked HTTP, planner enqueuing, and job history retrieval.”

Prompt: “Add frontend tests: schema‑driven form rendering and validation, mapping UI behavior, connect flow (mocking redirect), and job history display. Use MSW to mock APIs.”

Prompt: “Document a manual checklist in `prompts/INTEGRATIONS-HUB-E2E-CHECKLIST.md` for: connecting to BQE sandbox, validating token refresh, configuring a Projects rule, running a one‑off sync, verifying upserted data, and observing job logs.”

---

## Phase 10 — Deployment and Rollout

Prompt: “Add env vars to `docker-compose.yml` and sample `.env`: `BQE_CLIENT_ID`, `BQE_CLIENT_SECRET`, `BQE_AUTH_BASE_URL`, `BQE_SCOPES`, `BQE_COMPANY_ID`, `INTEGRATIONS_SECRET_KEY`. Do not commit real secrets. Reference these in provider.json or server config translation.”

Prompt: “Add `INTEGRATIONS_ENABLED` flag; backend must fail fast if `INTEGRATIONS_ENABLED=true` but `INTEGRATIONS_SECRET_KEY` is missing.”

Prompt: “Ensure existing Celery workers pick up integration tasks. Optionally route integration tasks to a dedicated `integrations` queue and, if needed, add a small worker process bound to that queue. Document queue names and scaling guidance in README.”

Prompt: “Feature‑flag Integrations Hub UI (env‑driven) and enable progressively. Provide a rollback note (disable flag) with no data migrations required.”

Testing
- Validate env wiring locally (no secrets in logs), run worker, and verify graceful shutdown.
- Verify OAuth callback reaches backend when read‑only maintenance is enabled (allowlisted path).

---

## Phase 11 — Multi‑Object Expansion Template (Repeatable)

Prompt: “Add a new object to BQE integration (example: `clients`). Steps:
1) Update `backend/integrations/providers/bqe/provider.json` with an `objects.clients` entry (keys: `key`, `label`, `fields` with types, `capabilities` like `list`/`delta`, and any object‑specific filters). Include default mapping suggestions.
2) Implement a BQE object client at `backend/integrations/providers/bqe/objects/clients.py` exposing `list_all()`, optional `list_delta(since)`, and `map_to_internal(row, mappings)`.
3) Extend the provider registry to resolve the object client by key and expose its capabilities.
4) Expose mapping defaults at `/api/integrations/bqe/clients/mapping/defaults` and ensure IntegrationSetting supports per‑object overrides.
5) Add IntegrationRule entries for `clients` (interval, behavior). Planner enqueues `clients` jobs per rules; Celery tasks fetch/map/upsert.
6) Decide on an Initial Matching flow if needed (for cross‑linking to local entities) or allow direct auto‑create.
7) Add unit tests (client pagination, mapping, policy) and an integration test (planner → task → upsert).”

Prompt: “Update the UI to list the new object automatically (from catalog). Provide a Mapping tab and Rules tab for `clients`, reusing the schema‑driven renderer. No object‑specific components unless strictly necessary.”

Testing
- Backend: object client unit tests, registry resolution test, REST endpoints for mapping defaults, rules CRUD, and job execution.
- Frontend: catalog renders new object, mapping form saves, rules save, and a one‑off sync triggers and surfaces job status.

---

## Coordination Notes

- Every new backend endpoint must have a typed frontend client and a contract test (e.g., minimal zod or TS interfaces). Keep endpoint paths and payloads versioned if changed.
- Provider metadata is the single source of truth for form rendering. UI must never hardcode provider field names.
- Sync jobs must be idempotent. Use provider stable IDs and connection IDs to avoid duplicates.
- Logs/metrics must never include secrets. Add redaction guards.
- Enforce BQE parent‑only imports: apply a server‑side ‘parentOnly’ filter and a client‑side guard to drop any subprojects/subtasks; reflect this in provider metadata and UI (disabled ‘Include subprojects’).
- Add an `integrations` capability object in `/api/capabilities/` (e.g., `{ integrations: { enabled: bool, providers?: [...] } }`); gate UI rendering and actions accordingly. Regenerate OpenAPI (`backend/openapi.json`) and the typed client (`npm run openapi:regen`) whenever endpoints change so `useCapabilities` can expose `caps.integrations?.enabled` to the Settings split-pane.
- No Nginx changes are required for OAuth callbacks because `/api/*` is already proxied.

Endpoint shape guidance
- All integration endpoints must be object-parameterized to enable multi-object support: prefer `/api/integrations/:provider/:object/...` for mapping, rules, and jobs; provider-wide listings can live at `/api/integrations/:provider/...` with optional `object` filters.
- Catalog must enumerate all objects with their fields, filters, and capabilities so the UI renders forms without object-specific code.

---

## Success Criteria

- Admin user can open Integrations Hub, connect to BQE, configure a Projects rule (fields + interval + behavior), run a one‑off sync, and see imported data and job history without code changes.
- Only top‑level (parent) BQE projects are imported; subprojects/subtasks are excluded by default and not matched during initial linking.
- Adding a new provider requires only a new `provider.json`, an auth client, and a fetcher module; UI renders dynamically.
- Adding a new object (e.g., clients, employees) for an existing provider requires only updating `provider.json` to include the object and implementing a corresponding object fetcher; the UI renders forms and mapping without changes.
- Tests cover critical paths (auth, mapping, sync, security) and pass reliably.
