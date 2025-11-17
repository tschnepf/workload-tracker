# Multi-Object Expansion Template

Use this checklist whenever we onboard a new provider object (example: `clients` for BQE).

1. **Provider metadata** – update `backend/integrations/providers/<provider>/provider.json` with a new entry: fields, capabilities, filters, and mapping defaults. Include a `schemaVersion` so UI mapping diffs work.
2. **Object client** – add `<object>_client.py` that wraps the provider API (pagination, retries, updated-since filtering). Reuse the shared HTTP client and inherit headers/env requirements.
3. **Sync module** – create `<object>_sync.py` that accepts an `IntegrationRule`, loads mapping overrides, fetches pages, and upserts into a dedicated Django model. Return metrics + cursor so the state machine stays consistent.
4. **Persistence** – add a model tailored to the object (for BQE Clients we introduced `IntegrationClient`). Keep it namespaced under the Integrations app so other services can join later.
5. **Rule execution** – extend `integrations.tasks.RuleExecutor` to dispatch on `rule.object_key` and call the new sync module. Update planner tests to cover the new branch.
6. **Tests** – add unit tests for the fetcher (pagination/retry), the sync function (insert/update/dry-run), and a planner test to ensure jobs run. If mapping or validation logic is unique, cover that too.
7. **Docs** – record the steps taken (this file) and mention new objects in README/E2E checklist so QA knows about the additional flows.

Following the template keeps provider metadata, registry wiring, and Celery jobs consistent no matter how many objects we add.
