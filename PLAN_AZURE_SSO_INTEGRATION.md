# Microsoft / Azure SSO Integration Plan (Updated for Current Architecture)

## Goal
Add Microsoft (Azure Entra ID) SSO to workload-tracker, including:
- Linking existing local accounts to Microsoft identities.
- Auto-provisioning new users created in Azure into the local DB.
- Department mapping between Azure and local Departments.
- Integration and operations controls in Settings -> Integrations Hub.
- Eventual mandatory Azure-only login for end users (no password login for normal users).

## Current Baseline (already in code)
- A provider-driven Integrations framework already exists (`IntegrationProvider`, `IntegrationConnection`, `IntegrationProviderCredential`, `IntegrationSetting`, `IntegrationAuditLog`).
- OAuth start/callback patterns already exist under `/api/integrations/providers/{key}/connect/*`.
- A scheduler/state pipeline already exists for provider sync jobs.
- Integrations Hub UI exists, but copy/controls are currently BQE-focused.
- End-user authentication is currently local username/email + password via SimpleJWT.

## Scope
- Extend existing Integrations framework for Azure provider configuration and provisioning.
- Add end-user Azure SSO login flow in auth endpoints.
- Add Azure department/group mapping management in Integrations Hub.
- Add provisioning pipeline (Graph delta first; SCIM optional second phase).
- Add auditability and operational visibility for SSO/provisioning flows.
- Add Web UI migration workflow to review proposed matches between Azure users, local Users, and local People before applying changes.

## Non-Goals (initial release)
- SAML support in v1 (defer until OIDC flow is stable).
- Advanced role/group-to-permission sync beyond department mapping.
- HRIS sync beyond core identity and department mapping fields.

## Key Decisions (must choose before implementation)
1) **Tenant strategy**
   - Option A: Single-tenant only (v1 recommendation).
   - Option B: Multi-tenant support in v1.

2) **SSO protocol**
   - Option A: OIDC Authorization Code + PKCE (v1 recommendation).
   - Option B: SAML 2.0 (defer).

3) **Provisioning mechanism**
   - Option A: Microsoft Graph `/users/delta` scheduled pull (v1 recommendation; reuses scheduler/state patterns).
   - Option B: SCIM 2.0 push endpoint from Azure App Provisioning (phase 2).

4) **Department source**
   - Option A: Azure `department` attribute.
   - Option B: Azure groups.
   - Option C: Both with precedence (recommended).

5) **Account matching + conflict policy**
   - Primary key: email/UPN.
   - Required behavior: explicit conflict state when duplicate local emails exist (no silent auto-link).
   - Secondary proposal heuristic: normalized first + last name for unmatched records, but proposal only (no auto-apply).

6) **Authentication enforcement mode**
   - Option A: Dual mode (password + Azure SSO) during migration.
   - Option B: Mandatory Azure-only login after migration (target end state).
   - Recommendation: phased cutover from A -> B with a break-glass admin path.

## Data Model Strategy
### Reuse existing models
- `integrations.IntegrationProvider` (provider key `azure`).
- `integrations.IntegrationConnection` (tenant/environment/health state).
- `integrations.IntegrationProviderCredential` (client ID/secret/redirect URI, encrypted).
- `integrations.IntegrationSetting` (sync cursors, provider state, mapping payloads).
- `integrations.IntegrationAuditLog` (admin/operator actions).

### Additions needed
- `integrations.IntegrationExternalIdentityLink` (or equivalent):
  - `connection`, `external_id` (Azure `sub`/object id), `user`, `upn_at_link_time`, metadata, timestamps.
- `integrations.IntegrationDepartmentMapping`:
  - `connection`, `source_type` (`department`|`group`), `external_key`, `department`, timestamps.

### Notes
- Do not add duplicate provider credential models under `accounts`.
- Use `IntegrationSetting` keys for provisioning cursors/status (`state.users`, `delta_token`, `last_sync_at`, etc.).

## Backend Approach
1) **Provider onboarding in Integrations framework**
   - Add `backend/integrations/providers/azure/provider.json`.
   - Register OAuth metadata/scopes/endpoints for Entra OIDC.
   - Keep admin credential/config flow under existing `/api/integrations/providers/{key}/*`.

2) **End-user SSO login flow (new auth endpoints)**
   - Add `POST /api/auth/sso/azure/start/`.
   - Add `GET /api/auth/sso/azure/callback/`.
   - Callback responsibilities:
     - validate ID token/claims (issuer, audience, nonce/state),
     - resolve or create local user/profile/person (policy-driven),
     - create/update external identity link,
     - issue local JWT tokens (same model as existing login).

3) **Identity linking behavior**
   - Auto-link by unique email/UPN when safe.
   - If duplicate email matches local users, block auto-link and require admin resolution in Integrations Hub.
   - Preserve immutable external identifier link once established.
   - Build reconciliation records for migration with statuses (`proposed`, `confirmed`, `conflict`, `skipped`, `applied`).
   - For records not resolved by email/UPN:
     - propose matches by normalized first/last name across Azure user <-> local user/person,
     - require admin confirmation in Web UI before any link/create action.
   - Migration rule A (existing user + existing person + exists in Azure):
     - Link existing local `User` to Azure identity.
     - Keep existing `UserProfile.person` link intact.
     - User signs in with Azure going forward.
   - Migration rule B (person exists, no local user, exists in Azure):
     - Create local `User` + `UserProfile`.
     - Link `UserProfile.person` to existing `Person`.
     - Link the new user to Azure identity.
     - User signs in with Azure.

4) **Provisioning pipeline**
   - Phase 1: Graph delta scheduled job using existing `integration_rule_planner` patterns.
   - Track cursor/sync state in `IntegrationSetting`.
   - Apply create/update/disable behavior according to owner decisions in `SSO_OWNER_QUESTIONNAIRE.md`.
   - Phase 2 (optional): SCIM endpoint under integrations namespace if needed.

5) **Department mapping**
   - Ingest source values (department string and/or group IDs).
   - Resolve via mapping table and set `Person.department`.
   - Unmapped users remain with null department and visible warning state in UI.

6) **Security and observability**
   - Continue using MultiFernet-backed secret storage in integrations.
   - Keep sensitive token fields redacted in logs.
   - Add explicit audit events for link/unlink, provisioning mutations, and mapping changes.
   - Add enforcement audit events (enforcement toggled on/off, blocked password login attempts).

## Migration and Cutover Strategy
1) **Pre-cutover discovery (dry run)**
   - Build a reconciliation report between Azure principals and local records.
   - Report buckets:
     - auto-link candidates (safe 1:1),
     - create-user-from-person candidates,
     - conflicts requiring admin review,
     - no local match.

2) **Backfill/link execution**
   - Execute idempotent migration jobs in batches from confirmed Web UI selections.
   - For each reconciled Azure principal:
     - if matching local user exists, create external identity link,
     - else if matching person exists, create user/profile linked to person and external identity link,
     - else follow provisioning policy (create or skip).
   - Do not apply `proposed` rows until they are explicitly marked `confirmed` by admin.

3) **Dual-mode validation window**
   - Run Azure SSO and local password auth in parallel temporarily.
   - Track unresolved conflicts and failed sign-ins.
   - Require zero unresolved high-risk conflicts before enforcement.

4) **Mandatory Azure-only cutover**
   - Enable enforcement flag (for example `AUTH_SSO_ENFORCED=true`).
   - Block standard password login endpoints for non break-glass users.
   - Keep one emergency break-glass local admin path documented and tested.

5) **Post-cutover guardrails**
   - Continue provisioning and reconciliation checks.
   - Reject unlink operations that would strand active users without an auth method.

## Frontend Approach
1) **Integrations Hub extension (not new section)**
   - Keep Azure inside existing `IntegrationsSection`.
   - Refactor BQE-hardcoded text/control labels to provider-aware rendering.
   - Add Azure-specific admin cards:
     - connection status,
     - provisioning mode + last sync/error,
     - department/group mapping editor,
     - identity conflict queue.
     - migration reconciliation workspace.

2) **Login UX**
   - Add "Sign in with Microsoft" entrypoint on `Login.tsx` when Azure SSO is enabled/configured.
   - Keep password login fallback unless owner selects mandatory SSO mode.

3) **Operational controls**
   - Trigger manual sync/retry.
   - View last sync timestamp, failure reason, and unresolved mappings/conflicts.
   - Add migration dashboard with reconciliation buckets and progress counts.
   - Show current lists of:
     - local Users,
     - local People (including people without accounts),
     - Azure principals,
     - proposed matches.
   - Auto-propose matches by first/last name for unresolved rows.
   - Let admin accept/override/reject each proposal and then click a single "Apply Confirmed Matches" action.

## API Surface (updated)
### Existing endpoints to reuse
- `/api/integrations/providers/`
- `/api/integrations/providers/{key}/credentials/`
- `/api/integrations/providers/{key}/connect/start/`
- `/api/integrations/providers/{key}/connect/callback/`
- `/api/integrations/health/`

### New endpoints to add
Auth:
- `POST /api/auth/sso/azure/start/`
- `GET /api/auth/sso/azure/callback/`

Integrations (Azure admin/provisioning):
- `GET /api/integrations/providers/azure/status/`
- `GET /api/integrations/providers/azure/directory/departments/`
- `GET /api/integrations/providers/azure/directory/groups/`
- `GET /api/integrations/providers/azure/department-mappings/`
- `POST /api/integrations/providers/azure/department-mappings/`
- `POST /api/integrations/providers/azure/provisioning/sync-now/`
- `GET /api/integrations/providers/azure/provisioning/status/`
- `GET /api/integrations/providers/azure/migration/reconciliation/` (list users/people/azure + proposed matches + statuses)
- `POST /api/integrations/providers/azure/migration/reconciliation/refresh/` (recompute proposals)
- `POST /api/integrations/providers/azure/migration/reconciliation/{id}/confirm/` (confirm a proposed match)
- `POST /api/integrations/providers/azure/migration/reconciliation/{id}/override/` (set manual match)
- `POST /api/integrations/providers/azure/migration/reconciliation/{id}/reject/` (reject proposal)
- `POST /api/integrations/providers/azure/migration/apply/` (apply only confirmed rows)
- Optional phase 2: `POST /api/integrations/providers/azure/scim/`

## Step-by-step Implementation
1) **Architecture alignment**
   - Create Azure provider metadata and provider tests.
   - Keep provider config in integrations app (no new duplicate provider config model in accounts app).

2) **Integrations Hub generalization**
   - Remove BQE-only assumptions in copy and control labels.
   - Add Azure provider card and provider-specific sub-panels.

3) **Auth SSO flow**
   - Implement Azure start/callback endpoints under `/api/auth/sso/*`.
   - Integrate callback with existing JWT issuance and profile hydration.

4) **Identity link persistence + conflict handling**
   - Add external identity link model.
   - Implement duplicate-email conflict path and admin resolution flow.

5) **Provisioning**
   - Add Graph delta sync task and cursor state handling.
   - Add user create/update/disable behavior and person/department updates.
   - Add migration/backfill command for existing users + people (idempotent and rerunnable).

6) **Department mapping**
   - Add mapping model/API/UI and apply mapping during provisioning.

7) **Migration execution**
   - Run dry-run reconciliation in staging and production.
   - Resolve conflicts and proposals in admin UI (confirm/override/reject).
   - Run approved backfill/link jobs via "Apply Confirmed Matches".

8) **Observability**
   - Add audit events and operational status surfaces.
   - Ensure PII-safe logs and error messages.

9) **Mandatory cutover**
   - Enable Azure-only auth enforcement after migration acceptance criteria are met.
   - Keep and test break-glass admin access.

10) **E2E hardening**
   - Complete tests and staging validation with a real Azure test tenant.

## Testing & QA
- Backend unit tests:
  - Azure provider metadata schema validation.
  - SSO callback claim validation and link/create logic.
  - Duplicate-email conflict behavior.
  - Migration reconciliation bucketing logic.
  - First/last-name auto-proposal matcher behavior.
  - Confirmed-only apply guard (proposed rows cannot be applied).
  - Create-user-from-person migration path.
  - Graph delta cursor progression and disable flows.
  - Department mapping application.
- Backend integration tests:
  - `/api/auth/sso/azure/start/` + callback token issuance.
  - Integrations status/mapping/provisioning endpoints.
  - Enforcement mode blocks password login for non break-glass users.
- Frontend tests:
  - Login SSO button visibility/flow.
  - Integrations Hub Azure controls and conflict/mapping states.
  - Migration dashboard lists users/people/azure principals with proposed matches.
  - First/last-name proposal rendering and confidence/status display.
  - Admin confirm/override/reject flows.
  - "Apply Confirmed Matches" applies only confirmed rows.
- E2E:
  - Admin connect + test sync.
  - Existing-user migration to Azure login.
  - Person-without-user migration (auto-created account linked to person).
  - New-user provisioning with department mapping.
  - Mandatory cutover validation (password blocked, Azure login succeeds).

## Risks / Gotchas
- Azure tenant and policy variance (MFA/Conditional Access, tenant-specific claims).
- Email/UPN drift and duplicate local email records.
- First/last-name collisions can cause false-positive proposals; confirmation must stay human-reviewed.
- Group cardinality and mapping complexity.
- Race conditions between manual profile edits and provisioning updates.
- Secret/token rotation and callback origin configuration.

## Rollout Plan
- Use environment/capability gating:
  - `INTEGRATIONS_ENABLED=true` (existing),
  - Azure-specific flags for login/provisioning exposure.
- Stage rollout:
  - staging tenant validation first,
  - pilot subset of users/groups,
  - production dual-mode migration window,
  - mandatory Azure-only cutover,
  - post-cutover monitoring.
- Keep password login fallback only during migration window.

## Acceptance Criteria
- Admin can configure Azure provider in Integrations Hub and establish a healthy connection.
- Users can sign in via Microsoft and receive local JWT session tokens.
- Admin can view current local Users, local People, Azure principals, and proposed matches in the Web UI.
- System proposes unmatched candidate links by first/last name, visible as `proposed` until reviewed.
- No migration changes are applied until admin explicitly confirms matches and runs "Apply Confirmed Matches".
- Existing user + person + Azure identity records are migrated to linked Azure SSO login without losing person linkage.
- Existing person without user account, but present in Azure, gets a local account created and linked to that person and Azure identity.
- Duplicate-email conflicts are surfaced and resolvable before mandatory cutover.
- New Azure users can be provisioned/updated/disabled per selected policy.
- Department mapping is configurable and applied during provisioning.
- Integrations Hub shows Azure status, last sync/error state, and mapping/conflict controls.
- After cutover, non break-glass users cannot authenticate via password endpoints and must use Azure SSO.
