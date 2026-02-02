# Microsoft / Azure SSO Integration Plan

## Goal
Add Microsoft (Azure Entra ID) SSO to workload-tracker, including:
- Linking existing local accounts to Microsoft identities.
- Auto-provisioning new users created in Azure into the local DB.
- Department mapping between Azure and local Departments.
- A new section in the Integrations Hub to configure, connect, and manage the integration.

## Scope
- Backend SSO + provisioning integration (OIDC/SAML + SCIM/Graph).
- Data model for identity provider config, external identity links, and department mappings.
- Admin UI in Settings → Integrations Hub.
- Background sync or inbound provisioning pipeline.
- Audit logging + operational visibility.

## Non-Goals (initial release)
- Multi-IdP support beyond Microsoft/Azure.
- Advanced lifecycle workflows (role sync, group-based permissioning) beyond department mapping.
- HRIS data sync beyond core identity fields.

## Key Decisions (must choose before implementation)
1) **SSO protocol**
   - Option A: OIDC (Authorization Code + PKCE, OpenID Connect).
   - Option B: SAML 2.0.
   - Recommendation: OIDC (simpler, consistent with existing OAuth patterns).

2) **Provisioning mechanism**
   - Option A: SCIM 2.0 endpoint (Azure provisioning agent).
   - Option B: Microsoft Graph delta sync (scheduled pull).
   - Recommendation: SCIM for real-time lifecycle events; Graph delta for simpler infra.

3) **Department source in Azure**
   - Option A: Azure AD `department` attribute.
   - Option B: Azure AD groups (manual group → department mapping).
   - Recommendation: support both, with a primary source selected in settings.

4) **Account matching rule**
   - Option A: Match by email/UPN only.
   - Option B: Match by email + full name fallback.
   - Recommendation: email/UPN first; explicit manual matching UI for conflicts.

## Data Model (proposed)
- `accounts/IdentityProvider` (or `sso/IdentityProvider`):
  - key (`azure`), tenant_id, client_id, client_secret (encrypted), redirect_uri, metadata, enabled.
- `accounts/ExternalIdentityLink`:
  - provider, external_id, user_id, email_at_link_time, created_at.
- `accounts/ProvisioningState`:
  - provider, delta_token (for Graph), last_sync_at, status, last_error.
- `accounts/DepartmentMapping`:
  - provider, external_key (group id or department string), department_id, source_type.

## Backend Approach
1) **SSO login flow**
   - Add endpoints to start/finish OIDC flow.
   - On callback: validate token, extract user claims (sub, email, name, department, groups).
   - Link to existing user or create new user + UserProfile + Person (if configured).
   - Issue local JWT (SimpleJWT) to maintain current auth model.

2) **Provisioning**
   - If SCIM:
     - Create `/api/sso/azure/scim/` endpoint with token auth for Azure provisioning.
     - Handle user create/update/disable events.
   - If Graph:
     - Add scheduled task to pull `/users/delta` and apply changes.
     - Store delta token in `ProvisioningState`.

3) **Department mapping**
   - Ingest Azure department/group metadata.
   - Store mapping table; on user create/update, set `Person.department`.
   - If no mapping exists, default to null and flag in UI.

4) **Security & secrets**
   - Reuse MultiFernet encryption for secrets (pattern from integrations).
   - Ensure PII is minimized in logs; add audit log entries for linking/provisioning actions.

## Frontend Approach (Integrations Hub)
- Add a **Microsoft / Azure SSO** card/section in `IntegrationsSection`.
- UI states:
  - Not configured → show credential form.
  - Connected → show tenant info, status, last sync, actions.
- Controls:
  - Connect / Reconnect.
  - Toggle provisioning on/off.
  - Select provisioning method (SCIM vs Graph).
  - Department mapping table (Azure group/department → local Department).
  - Conflict resolution (manual link/unlink).

## API Endpoints (proposed)
- `GET /api/sso/azure/status/` → current config + connection health.
- `POST /api/sso/azure/credentials/` → save tenant/client credentials.
- `POST /api/sso/azure/connect/start/` → start OIDC.
- `GET /api/sso/azure/connect/callback/` → finish OIDC.
- `GET /api/sso/azure/departments/` → list Azure depts/groups.
- `POST /api/sso/azure/department-mapping/` → save mappings.
- `POST /api/sso/azure/provisioning/test/` → test connectivity.
- `POST /api/sso/azure/scim/` → SCIM provisioning webhook (if chosen).

## Step-by-step Implementation
1) **Scaffold data model**
   - Add IdentityProvider + ExternalIdentityLink + DepartmentMapping + ProvisioningState.
   - Migration + admin registrations.

2) **SSO connection flow**
   - Implement OIDC start/callback.
   - Map claims → user fields.
   - Issue JWT tokens on success.

3) **Provisioning pipeline**
   - Implement SCIM endpoint or Graph delta task.
   - Add user create/update/disable logic.
   - Link to existing users via email; create new users if not found.

4) **Department mapping**
   - Fetch Azure departments/groups.
   - Save mapping table; apply during provisioning.
   - Build UI matching table with preview counts.

5) **Integrations Hub UI**
   - Add Azure section; reuse patterns from existing Integrations UI.
   - Surface status + last sync + errors.

6) **Testing & QA**
   - Unit tests for linking + mapping.
   - Integration tests for OIDC callback + provisioning.
   - UI tests for settings flows.

## Risks / Gotchas
- Azure tenant configuration variance (multi-tenant vs single-tenant).
- Email/UPN drift causing duplicate users.
- Department naming mismatches and missing mappings.
- Token storage and rotation (client secrets, refresh tokens).
- Provisioning race with manual edits (conflict policy needed).

## Rollout Plan
- Feature flag (e.g., `FEATURES['AZURE_SSO']`).
- Enable in staging first; validate provisioning with a test tenant.
- Add admin-only audit logging + monitoring.

## Acceptance Criteria
- Admin can connect Azure tenant and complete SSO login.
- Existing users can link their account via email/UPN.
- New Azure users are auto-created locally with correct department mapping.
- Integrations Hub shows status, last sync, and mapping controls.
