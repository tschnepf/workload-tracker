# BQE CORE API Alignment Notes

Generated on 2025-11-17 while executing Phase 1 of `prompts/FIX_BQE.md`.

## Project (`GET {base_url}/project`)

- **Required scope:** `read:core` (write operations such as `PUT /project/{id}` require `readwrite:core`).citeturn0search3
- **Pagination:** Single `page` query parameter formatted as `pageNumber,pageSize`. Default page size is 25, max is 1000 unless `expand` is used (then max 100). No standalone `pageSize` key.citeturn0search0
- **Filtering:** `where` accepts expressions like `lastUpdated>=2025-01-01T00:00:00Z` or `parentId is null`. `fields`, `orderBy`, and `expand` follow the same syntax across list endpoints.citeturn0search0turn0search3
- **Identifiers & timestamps:** Canonical identifier is `id` (UUID). Incremental sync fields include `lastUpdated` plus `createdOn`. Legacy `projectId` appears only in nested objects and shouldn’t be treated as the unique key.citeturn0search3
- **Hierarchy:** Parent relationships rely on `parentId` (for the immediate parent) and `rootProjectId`. Filtering for top-level projects must use `where=parentId is null`.citeturn0search3

## Client (`GET {base_url}/client`)

- **Required scope:** `read:core`.citeturn1view0
- **Pagination & filtering:** Same parameter contract as projects (`page`, `where`, `fields`, `expand`). No `pageSize` or `updatedSince` keys.citeturn0search0turn1view0
- **Identifiers & timestamps:** Canonical identifier is `id`. `lastUpdated` is the documented delta column. `clientId` is not listed in the modern schema; treat it as legacy.citeturn1view0
- **Status & archival:** `status` indicates whether the client is active. Additional boolean `isArchived` is not exposed; the API expects consumers to derive archive state from `status`.citeturn1view0

## Auth & Headers

- **OAuth:** Authorization Code + PKCE (`read:core`, optional `offline_access` for refresh tokens). Token responses include an `endpoint` property that becomes the tenant-specific base URL for subsequent API calls.citeturn0search5turn0search9
- **Mandatory headers:** `Authorization: Bearer <token>` and `X-UTC-OFFSET` representing the caller’s timezone offset in minutes. Default is PST if omitted.citeturn0search5

## Rate Limiting

- **Published limits:** New apps (post-2023-02-21) receive 100 requests per minute per app per user. Older apps rely on the `X-Rate-Limit-*` headers echoed in each response.citeturn2search0turn2search1
- **Headers:** `X-Rate-Limit-Limit`, `X-Rate-Limit-Remaining`, `X-Rate-Limit-Reset`, plus `Retry-After` on 429 responses. Clients must respect these signals and implement coordinated throttling.citeturn2search1

## Identified Deltas vs. Current Codebase

1. **Pagination contract mismatch:** Current HTTP clients send `page` and `pageSize` separately and attempt `updatedSince` query keys. Docs mandate the unified `page` string and `where` expressions.citeturn0search0
2. **Delta field mismatch:** Code reads `updatedOn`; docs expose `lastUpdated`.citeturn0search3turn1view0
3. **Hierarchy filters:** Metadata references `parentProjectId`, but docs call the field `parentId`.citeturn0search3
4. **Identifiers:** Code treats `projectId`/`clientId` as unique keys, conflicting with documented `id`.citeturn0search3turn1view0
5. **Headers:** Implementation never sets `X-UTC-OFFSET`; docs require it for timezone accuracy.citeturn0search5
6. **Rate limiting:** Registry metadata hard-codes limits but runtime throttling is absent despite explicit server guidance.citeturn2search0turn2search1

These notes satisfy Phase 1 Step 1 and should be referenced by future steps to avoid deviating from the official BQE documentation.

## OAuth Configuration Audit (Phase 1 Step 2)

| Item | Docs | Current Implementation | Required Adjustment |
| --- | --- | --- | --- |
| Scopes for read-only sync | `read:core` (+ `offline_access` for refresh) | `provider.json` requests `readwrite:core`, `offline_access`, `openid`, `email`, `profile` | Drop write scope for list-only operations; confirm whether identity scopes are mandatory; ensure minimum viable scopes to reduce consent friction.citeturn0search3turn0search9turn3view0 |
| OAuth endpoints | `https://api-identity.bqecore.com/idp/connect/authorize` & `/token` | Matches docs | No change.citeturn3view0 |
| PKCE usage | Docs require PKCE for public clients | `BQEOAuthClient` already generates verifier/challenge | No change.citeturn0search5turn3view0 |
| Tenant base URL discovery | Docs state token payload includes tenant-specific `endpoint` for subsequent requests | `store_token_response` persists `endpoint` when present | Ensure refresh responses without `endpoint` fall back to stored value (already supported).citeturn0search5turn3view0 |
| Header requirements | `X-UTC-OFFSET` must be provided | Not currently captured/configured | Introduce configuration & header plumbing.citeturn0search5turn3view0 |
| Rate limits | 100 RPM per app/user default; honor `Retry-After` | Clients only retry locally, no shared throttle | Implement provider-level throttling informed by metadata + response headers.citeturn2search0turn2search1 |

This checklist completes Phase 1 Step 2.
