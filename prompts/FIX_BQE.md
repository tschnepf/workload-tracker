# FIX_BQE Plan

The following phased prompts must be executed sequentially. Each step is phrased so it can be handed directly to an AI agent. Every prompt explicitly demands strict adherence to the BQE API documentation, lean programming best practices, and forbids shortcut or band-aid fixes. Break down complicated efforts into the provided sub-prompts to avoid risky, monolithic changes. Keep backend and frontend behavior synchronized at all times.

## Phase 1 – Documentation Alignment & Baseline Validation

1. **Prompt:** "Study https://api-explorer.bqecore.com/ in depth. Summarize every relevant detail for `/project` and `/client` (required scopes, headers, pagination style, filtering syntax, response schemas). Call out any deltas between the docs and `backend/integrations/providers/bqe/*.py` plus `provider.json`. Document uncertainties before touching code. Follow lean programming: gather only the data needed to make precise corrections, nothing extra." 

2. **Prompt:** "Audit our OAuth configuration against the docs. Confirm that requested scopes, PKCE usage, and refresh handling exactly match what BQE prescribes. Produce a checklist of required changes (if any). No shortcuts—capture exact URL/field requirements for both sandbox and production." 

## Phase 2 – HTTP Client & Metadata Corrections

3. **Prompt:** "Update `BQEProjectsClient`, `BQEClientsClient`, and any admin helpers (connection/activity tests) so pagination, filtering, and delta queries exactly mirror the BQE spec: send only the single documented `page` parameter (`pageNumber,pageSize` format), target the `lastUpdated` column for cursoring, and ensure no `pageSize`/`updatedSince` keys leak through. Keep retry/backoff lean. Provide regression tests that snapshot every constructed request, including the admin probes, so unsupported params reintroductions fail fast." 

4. **Prompt:** "Introduce a reusable `WhereClauseBuilder` (or equivalent helper) that encodes BQE's quoting/escaping rules for complex filters (e.g., timestamps, GUIDs, and child predicates). Refactor all call sites—including connection tests—to compose delta filters and hierarchy predicates through this builder. Add focused unit tests that serialize the exact strings sent to BQE to prevent malformed `where` clauses." 

5. **Prompt:** "Implement mandatory documented headers. Derive and attach `X-UTC-OFFSET` (in minutes) and any other required headers to every BQE call, sourcing the offset from persisted per-connection configuration. Extend backend models/services plus frontend forms/settings so admins can provide and review the offset without hacks. Document validation to prevent missing offsets." 

6. **Prompt:** "Revise `provider.json` and registry loaders so metadata (objects, fields, filters, scopes, rate limits) reflects the live documentation, then validate against `provider.schema.json`. Use the normalized `rateLimits` to power both per-connection concurrency guards and a provider-wide throttle so runtime traffic respects BQE's stated caps and `Retry-After` headers. When scopes change (e.g., `read:core` replacing `readwrite:core`), update backend OAuth flows and frontend copy/tooltips in lockstep. No hard-coded magic numbers." 

## Phase 3 – Data Mapping & Sync Integrity

7. **Prompt:** "Refactor project and client sync logic to use the documented canonical identifier (`id`) instead of legacy fields like `projectId`/`clientId`. Write a reversible data migration that updates `IntegrationExternalLink`, `IntegrationClient`, and any related tables so existing links and downstream references continue to resolve. Keep the migration lean by touching only the columns that require correction." 

8. **Prompt:** "Review every mapping in `projects_sync.py` and `clients_sync.py` plus stored defaults to ensure field names (e.g., `parentId`, `rootProjectId`, `lastUpdated`), status handling, and hierarchy filters exactly match BQE’s payload. Adjust `parentOnly` behavior to emit the correct `where=parentId is null` filter via the shared builder and ensure child filtering, client sync policy, and deletion policy continue to work. Provide targeted unit tests for each mapping edge case." 

9. **Prompt:** "Align frontend integration settings (e.g., connection forms, status displays) with the updated backend fields so admins see accurate labels for scopes, headers, time-zone offsets, and mapping behavior. Keep the UI changes minimal yet precise—no visual overhaul, just enough to prevent configuration drift." 

10. **Prompt:** "Revisit all admin and observability flows (connection tests, activity probes, health endpoints, dashboards) to ensure they call the updated HTTP helpers and `WhereClauseBuilder`, emit the same headers/filters as production syncs, and log the normalized request metadata. Add regression checks so these pathways can’t drift from core sync behavior." 

## Phase 4 – Verification & Testing

11. **Prompt:** "Create automated backend tests that cover: (a) request parameter construction for projects/clients, (b) header injection with timezone offsets, (c) sync flows using realistic payloads straight from BQE docs, and (d) migrations for `IntegrationExternalLink`. Tests must fail if someone attempts to reintroduce undocumented params or skips the offset header." 

12. **Prompt:** "Implement a manual + automated validation phase: (a) run the Django test suite for integrations, (b) execute smoke syncs against a mocked BQE server that enforces the documented contract, and (c) verify frontend flow by hitting the API endpoints the UI consumes. Record results in `reports/` with timestamps. No step may be skipped." 

13. **Prompt:** "Perform a final audit: confirm provider metadata matches docs, OAuth scopes are minimal-yet-sufficient, backend/ frontend copies are aligned, and observability (logs/metrics) clearly captures query params and headers for future debugging. Document remaining risks and TODOs; do not leave hidden assumptions." 

## Phase 5 – Deployment Readiness

14. **Prompt:** "Prepare deployment artifacts: update CHANGELOG entries, write operator runbooks for configuring per-connection UTC offsets, and note any mandatory re-auth steps for customers. Ensure instructions emphasize no shortcuts: all tenants must re-consent with the updated scope set before rollout." 

15. **Prompt:** "Stage changes in a feature branch and request review. Provide a concise summary referencing the lean plan, attach test evidence, and flag any sequencing requirements for frontend/backend deployment to avoid mismatches." 

Follow the phases in order. Do not allow parallel execution that could create inconsistencies between backend and frontend components." 
