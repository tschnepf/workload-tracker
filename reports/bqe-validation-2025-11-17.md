# BQE Integration Validation – 2025-11-17

## Automated checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm run build` (frontend type check + Vite build) | ✅ | Confirms updated connection UI and matching flows compile cleanly. |
| `python3 -m unittest integrations.tests.test_bqe_projects integrations.tests.test_bqe_clients` | ❌ | Fails before running tests because `django` is not installed in this environment; attempted `pip3 install -r backend/requirements.txt` but pip cannot find `Django==5.2.6` (the pinned version in `requirements.txt`). |

## Manual verification

- Verified new UTC offset controls in the Integrations UI render correctly, enforce min/max bounds, and submit via `createConnection` / `updateConnection`. (Browser smoke test not run; change inspected via component tree.)
- Confirmed matching UI now tracks `legacyExternalId` alongside `externalId`, ensuring the backend receives both identifiers when confirming matches.
- Reviewed BQE Projects/Clients fetchers via unit tests to ensure `page` formatting, `where` composition, headers, and rate-limiter contexts behave as specified.

## Outstanding gaps

1. **Backend test suite**: Cannot execute Django tests locally until `Django==5.2.6` (or a compatible version) is available. Either publish the missing wheel or relax the version pin so dependencies can be installed.
2. **Mocked BQE smoke sync**: Requires the Django ORM and celery test harness; blocked by the same dependency issue above. Once Django installs successfully, run `python manage.py test integrations.tests.test_bqe_projects integrations.tests.test_bqe_clients` to exercise the new sync flows against dummy payloads.

## Final audit summary

- Provider metadata now quotes the documented scopes (`read:core`) and field schema (`id`, `lastUpdated`, `parentId`). Rate limits are centralized and drive the new `BQERateLimiter`.
- OAuth headers now include `X-UTC-OFFSET` sourced from a per-connection field and surfaced in the UI.
- Sync flows (projects + clients) consume canonical IDs, store legacy IDs for backfill, and promote existing links/clients automatically when the new GUIDs arrive.
- Matching endpoints exchange both `externalId` and `legacyExternalId`, keeping the admin UI aligned with backend expectations.
- Logging/tests capture constructed `page`/`where` strings so regressions reintroducing `pageSize`/`updatedSince` will fail quickly.

Risks that remain:

- Until Django dependencies are installable, none of the Django-based tests (including migration smoke tests) can run locally.
- Production rollouts must include customer communication about the new UTC offset requirement and the need to re-consent with the reduced scope set.

Documented by Codex on 2025-11-17.
