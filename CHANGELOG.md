# Changelog

## 2025-11-17 – BQE integration hardening

- Reworked the BQE HTTP clients to follow the API spec: requests now use the combined `pageNumber,pageSize` parameter, filter via `where` clauses targeting `lastUpdated`, and attach the documented `X-UTC-OFFSET` header derived from each connection.
- Added the `BQERateLimiter` so every request respects both per-connection concurrency limits and the published 100 RPM per-app throttle. Retries and rate-limit headers are now honored centrally.
- Updated provider metadata and sync logic to rely on canonical `id`/`lastUpdated` fields, migrating legacy `projectId` / `clientId` references via the new `legacy_external_id` columns.
- Extended the Integrations UI so admins can configure UTC offsets, view header requirements, and send both `externalId` and `legacyExternalId` when confirming matches; the UI now mirrors backend validation.
- Documented the validation status and outstanding risks (see `reports/bqe-validation-2025-11-17.md`). Backend Django tests remain blocked until `Django==5.2.6` is available.
