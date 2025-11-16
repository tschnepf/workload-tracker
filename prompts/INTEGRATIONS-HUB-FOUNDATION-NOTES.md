# Integrations Hub — BQE Foundation Notes

This brief captures the baseline research needed before writing code for the BQE CORE integration. Treat it as a living reference; update links or field names as you validate them with the vendor sandbox.

## Auth Flow Options

| Flow | When to use | Notes |
| ---- | ----------- | ----- |
| Authorization Code + PKCE | Standard for production tenants so admins can authorize the app without sharing credentials. | Requires `code_challenge` + `code_verifier`, short-lived auth code (~5 min) exchanged for access + refresh tokens. |
| Client Credentials | For service accounts or the vendor sandbox when no user-facing approval is required. | Only works when the tenant enables the client for backend automation. Tokens inherit the service account privileges. |

- Auth base URL: `https://auth.bqe.com/oauth2/authorize`
- Token URL: `https://auth.bqe.com/oauth2/token`
- Typical scopes: `bqe_api`, `offline_access`, and any object-specific scopes (projects, clients, etc.). Confirm with the sandbox tenant before hardcoding.
- The API expects an `X-Company-Id` header (or `X-Client-Id` for some legacy tenants) alongside the OAuth bearer token. Store the human-readable label so the UI can explain it.

## Base URL & Projects Endpoint

- Production REST base: `https://api.bqe.com/v3`
- Sandbox: `https://sandbox-api.bqe.com/v3`
- Projects list endpoint: `GET /projects`
  - Supports pagination via `page` + `pageSize` query parameters (`page` starts at 1).
  - Supports filtering by `parentProjectId`, `status`, `updatedOn`, etc.

## Pagination

- Default page size is 50; maximum is 200. Use conservative defaults (e.g., 100) to avoid vendor throttling.
- Response body includes `totalPages` and `totalItems`; when `page < totalPages`, request the next page.
- Always guard with a hard cap (e.g., 5,000 records) to avoid runaway jobs.

## Rate Limits

- Vendor guidance (as of 2025-01-15):
  - 60 requests/minute per company connection.
  - Short bursts up to 120 requests/minute tolerated for < 30 seconds.
  - Global cap of 600 requests/minute per client ID across all companies.
- Respect `Retry-After` headers on 429 responses and back off for at least 5 seconds.

## Projects Hierarchy

- Fields:
  - `projectId`: unique identifier.
  - `parentProjectId`: null for top-level projects; set for subprojects.
  - `isSubProject`: boolean mirror of `parentProjectId != null` (but not always populated).
  - `level`: integer depth in the hierarchy.
- Server-side filter for parent projects: `GET /projects?parentProjectId=null`.
- When iterating pages, still drop any rows where `parentProjectId` is not null (defensive guard).

## Recommended Headers

| Header | Source | Description |
| ------ | ------ | ----------- |
| `Authorization: Bearer <token>` | OAuth | Standard bearer token. |
| `X-Company-Id` | Connection configuration | Tenant/company context for every API call. |
| `X-Request-ID` | Generated per call | Required for traceability. The Integration HTTP client should always set it. |

## References / Next Steps

- Verify the scopes list and base URLs with the vendor sandbox account before shipping.
- Capture any schema updates (new project fields, changes to pagination) in `backend/integrations/providers/bqe/provider.json`.
- When in doubt, use the API Explorer at `https://developer.bqe.com/api-explorer` to try queries and log request/response pairs for future debugging.
