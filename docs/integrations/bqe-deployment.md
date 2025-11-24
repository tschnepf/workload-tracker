# BQE Deployment Checklist (2025-11-17)

## 1. Configure per-connection UTC offsets

1. Go to **Settings → Integrations Hub** and select each BQE connection.
2. In the *UTC offset (minutes)* card, enter the tenant’s offset relative to UTC (e.g., `-480` for Pacific Standard Time, `-300` for Eastern Standard Time, `60` for Central European Time).
3. Click **Save Offset**. The backend persists the value in `IntegrationConnection.utc_offset_minutes` and every BQE request now includes `X-UTC-OFFSET`.
4. Re-run the *Test Connection* button to confirm the header is accepted (expect `sampleCount ≥ 0` and no timezone mismatch warnings in the logs).

## 2. Scope + OAuth re-consent

1. Provider metadata now requests the minimal `read:core` scope instead of `readwrite:core`. Existing tokens continue to work, but tenants must re-consent to grant the new scope set.
2. For each connection, click **Reconnect OAuth**. Ensure admins understand that skipping re-consent will block delta syncs once the new scope requirement is enforced server-side.
3. After re-auth, verify that `IntegrationConnection.needs_reauth` is cleared and the connection test succeeds.

## 3. Legacy ID migration

1. A background migration copies the previous `external_id` field into `legacy_external_id` for both `IntegrationExternalLink` and `IntegrationClient`.
2. During the next sync, records that expose the canonical GUID (`id`) will automatically promote links/clients to the new identifiers. Monitor logs for `legacy_external_id` promotion events to ensure coverage.
3. If a tenant has custom mappings, remind them that the UI now exposes both `externalId` (GUID) and `legacyExternalId` (numeric ID) when confirming matches.

## 4. Rate-limit guardrails

1. The new `BQERateLimiter` enforces the documented 100 requests/minute cap and a max concurrency of 2 calls per connection. No manual action required, but monitor Celery logs for `rate limiter wait` entries during the first week.
2. If a tenant legitimately surpasses the cap (e.g., due to backfills), coordinate with BQE support to temporarily raise the limit before relaxing our metadata configuration.

Keep this checklist handy during rollout; do not bypass the steps even for sandbox tenants.
