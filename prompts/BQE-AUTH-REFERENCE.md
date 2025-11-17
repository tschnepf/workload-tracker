# BQE Auth Reference (2025.11.1.0)

## Official Requirements (from https://api-explorer.bqecore.com/docs/authentication-authorization)

- **Flow:** OAuth 2.0 Authorization Code with PKCE.
- **Endpoints:**
  - Authorization URL: `https://api-identity.bqecore.com/idp/connect/authorize` (docs also mention `https://auth.bqe.com/oauth2/authorize` for older tenants).
  - Token URL: `https://api-identity.bqecore.com/idp/connect/token`.
- **Scopes:** `readwrite:core offline_access openid email profile` (matching the Postman example).
- **Redirect URI:** Must exactly match the URI registered in the Developer Portal; Postman sample uses `https://oauth.pstmn.io/v1/browser-callback`.
- **Client Credentials:** `client_id` and `client_secret` obtained via the Developer Portal. Docs instruct storing them in Postman environment variables and sending them via Basic Auth when exchanging tokens.
- **No other headers required:** Documentation does **not** mention tenant/company headers.

## Current Code Audit (pre-change)

Remaining references to `company_id` / `X-Company-Id`: **none** (keep this list updated if new mentions appear in docs or code).

## Phase 5 HTTP Trace

Command: `docker compose run --rm backend python manage.py shell <<'PY' ... PY`

Captured request (BQEProjectsClient → DummyHttp):

```
[
  {
    "method": "GET",
    "path": "/projects",
    "headers": {
      "Authorization": "Bearer demo-token"
    }
  }
]
```

No `X-Company-Id` header is attached; only the OAuth bearer token is sent.

This file should be updated if additional references are discovered.
