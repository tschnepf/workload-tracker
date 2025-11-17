# BQE Auth Fix — Lean Implementation Plan

The goal is to align our integration with the **official BQE CORE API docs (2025.11.1.0)**, which only mention OAuth 2.0 (Authorization Code + PKCE) and do *not* require any tenant-specific headers. All work must follow lean programming best practices—no shortcuts, no band-aids, and frontend/backend must stay in lockstep to avoid mismatches.

---

## Phase 0 – Source of Truth Validation

1. **Prompt:** “Document the exact authentication requirements from the latest BQE CORE API docs and Postman instructions (auth URL, token URL, scopes, redirect URI format, OAuth flow). Capture screenshots or quoted text in `prompts/BQE-AUTH-REFERENCE.md` so future phases have a canonical reference.”
2. **Prompt:** “Audit the current codebase (backend + frontend) for any usage of `company_id`, `X-Company-Id`, or tenant-specific headers. Produce a list of affected files/functions and store it in `prompts/BQE-AUTH-REFERENCE.md` for traceability.”

Testing: none (documentation phase).

---

## Phase 1 – Data Model Simplification

1. **Prompt:** “Update `IntegrationConnection` and related serializers/migrations so `company_id` is optional and no longer required by the API or UI. Provide a reversible migration that drops the column after copying values into a JSON note for reference. Ensure all admin forms/tests reflect the new schema.”
2. **Prompt:** “Delete the ‘Company ID’ field from the Integrations UI connect modal and from any React state validations. Replace the copy with OAuth-only messaging (client ID/secret + redirect URI).”

Testing Steps:
- Backend: `docker compose run --rm backend python manage.py test integrations`.
- Frontend: `docker compose run --rm frontend npm run build`.

---

## Phase 2 – HTTP Client Cleanup

1. **Prompt:** “Modify all BQE client modules (`projects_client`, `clients_client`, matching helpers) to stop injecting `X-Company-Id` or referencing `connection.company_id`. Requests must include only the headers mandated by the docs (Authorization, etc.).”
2. **Prompt:** “Refactor any unit tests that stub the header to ensure they still pass without the tenant field. Add a regression test proving that `matching/suggestions` succeeds without `company_id`.”

Testing Steps:
- Backend: run targeted tests `docker compose run --rm backend python manage.py test integrations.tests.test_bqe_projects integrations.tests.test_bqe_clients`.

---

## Phase 3 – Provider Metadata & Registry Alignment

1. **Prompt:** “Update `backend/integrations/providers/bqe/provider.json` and `provider.schema.json` so the metadata no longer lists `X-Company-Id` under `requiredHeaders`. Ensure the registry loader tolerates the change and add tests that validate the new schema.”
2. **Prompt:** “Regenerate any OpenAPI/typed-client artifacts affected by the metadata change so the frontend stays in sync. Verify the React catalog view still renders object definitions correctly.”

Testing Steps:
- Backend: `docker compose run --rm backend python manage.py test integrations.tests.test_registry`.
- Frontend: `docker compose run --rm frontend npm run build`.

---

## Phase 4 – Provider Credentials & UI Copy

1. **Prompt:** “Review the Integrations UI credential form and ensure the only required fields are `clientId`, `clientSecret`, and `redirectUri`. Update helper text to mirror the BQE docs (mention exact OAuth endpoints/scopes).”
2. **Prompt:** “Update README.md + docs to remove references to Company ID. Document the new OAuth-only setup flow and emphasize that MultiFernet stores the client secret.”

Testing Steps:
- Frontend: `docker compose run --rm frontend npm run build`.
- Documentation: run lint/check if applicable.

---

## Phase 5 – End-to-End Validation

1. **Prompt:** “Run an end-to-end connection flow (set credentials → connect → load matching suggestions) in the dev environment with logging enabled. Confirm no requests send `X-Company-Id` and attach the captured HTTP trace to `prompts/BQE-AUTH-REFERENCE.md`.”
2. **Prompt:** “Execute the existing Integrations Hub regression checklist, noting any changes caused by the OAuth-only transition.”

Testing Steps:
- Backend: `docker compose run --rm backend python manage.py test integrations --verbosity 0`.
- Frontend: `docker compose run --rm frontend npm run build`.
