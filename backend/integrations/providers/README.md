# Provider Metadata Format

Provider metadata lives under `backend/integrations/providers/<provider>/provider.json` and is validated against `backend/integrations/provider.schema.json`. The JSON document is intentionally small so it can be versioned and edited without code changes.

## Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `providerSchemaVersion` | string | Semantic version of the metadata format. |
| `key` | string | Internal provider key (`bqe`, `netsuite`, etc.). |
| `displayName` | string | Human-friendly name for UI listings. |
| `oauth` | object | OAuth configuration (flows, scopes, auth/token URLs). |
| `requiredHeaders` | array | Optional headers the HTTP client must set for every call (default empty). |
| `baseUrlVariants` | object | `default`, `sandbox`, and optional regional overrides. |
| `rateLimits` | object | Tunable rate limit settings (per-connection + global). |
| `objects` | array | Metadata for each syncable object (projects, clients, etc.). |

Unknown keys are ignored to stay forward-compatible.

## Object Definition

Each object entry must include:

- `key`: unique identifier (`projects`, `clients`, ...).
- `label`: UI display name.
- `fields`: list of provider fields with `key`, `label`, `type`, `nullable`, and optional `description`.
- `capabilities`: booleans describing supported operations (e.g., `{ "list": true, "delta": true }`).
- `hierarchy` (optional): describes parent/child relationships.
- `filters`: named filters the UI can surface (e.g., `parentOnly`).
- `deletionPolicy`: hints for how to treat remote deletions/archivals.

See `bqe/provider.json` for a concrete example.
