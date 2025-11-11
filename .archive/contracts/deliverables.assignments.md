# DeliverableAssignment API Contract (Frozen)

Purpose: Define the REST contract for Deliverable-to-Person weekly-hours assignments. This contract uses camelCase for API fields and maps to snake_case on the backend models/serializers.

Status: Frozen contract to implement in R2 Prompts 2–3. Do not change without review.

---

## Overview
- Treat each Deliverable as a milestone; this API links people to deliverables with weekly hours.
- Week keys use Sunday dates in `YYYY-MM-DD` format for all new writes.
- Backend storage uses snake_case. API surfaces camelCase via DRF serializer mappings.
- Default ordering: newest first by `createdAt`.

---

## Resource Schema (API, camelCase)

Field mapping and semantics:
- `id` (number, read-only) — primary key
- `deliverable` (number, required) — Deliverable ID
- `person` (number, required) — Person ID
- `weeklyHours` (object<string, number>, required) — JSON map of Sunday week keys to non-negative hours (0–80)
  - Example: `{ "2025-09-07": 8, "2025-09-14": 6 }`
- `roleOnMilestone` (string, optional, max 100) — free-text role label
- `isActive` (boolean, default true) — soft activity flag
- `personName` (string, read-only) — denormalized from `person.name`
- `projectId` (number, read-only) — derived from `deliverable.project_id`
- `createdAt` (string, read-only, ISO 8601) — e.g., `2025-09-01T17:23:45Z`
- `updatedAt` (string, read-only, ISO 8601)

Serializer source mapping (reference):
- `weeklyHours` -> `weekly_hours`
- `roleOnMilestone` -> `role_on_milestone`
- `personName` -> `person.name` (read-only)
- `projectId` -> `deliverable.project_id` (read-only)
- `createdAt` -> `created_at`, `updatedAt` -> `updated_at`

---

## Endpoints
Base path: `/api/deliverables/assignments/`

1) Create
- `POST /api/deliverables/assignments/`
- Request body (JSON):
```json
{
  "deliverable": 42,
  "person": 7,
  "weeklyHours": {
    "2025-09-07": 8,
    "2025-09-14": 6
  },
  "roleOnMilestone": "Designer"
}
```
- Response 201 (JSON):
```json
{
  "id": 101,
  "deliverable": 42,
  "person": 7,
  "weeklyHours": {
    "2025-09-07": 8,
    "2025-09-14": 6
  },
  "roleOnMilestone": "Designer",
  "isActive": true,
  "personName": "Sarah Chen",
  "projectId": 9,
  "createdAt": "2025-09-01T17:23:45Z",
  "updatedAt": "2025-09-01T17:23:45Z"
}
```

2) Update (partial)
- `PATCH /api/deliverables/assignments/{id}/`
- Request body (JSON):
```json
{
  "weeklyHours": {
    "2025-09-07": 10,
    "2025-09-14": 4
  },
  "roleOnMilestone": "Lead Designer"
}
```
- Response 200 (JSON):
```json
{
  "id": 101,
  "deliverable": 42,
  "person": 7,
  "weeklyHours": {
    "2025-09-07": 10,
    "2025-09-14": 4
  },
  "roleOnMilestone": "Lead Designer",
  "isActive": true,
  "personName": "Sarah Chen",
  "projectId": 9,
  "createdAt": "2025-09-01T17:23:45Z",
  "updatedAt": "2025-09-01T18:01:02Z"
}
```

3) List (active only)
- `GET /api/deliverables/assignments/`
- Response 200 (JSON):
```json
[
  {
    "id": 101,
    "deliverable": 42,
    "person": 7,
    "weeklyHours": { "2025-09-07": 8, "2025-09-14": 6 },
    "roleOnMilestone": "Designer",
    "isActive": true,
    "personName": "Sarah Chen",
    "projectId": 9,
    "createdAt": "2025-09-01T17:23:45Z",
    "updatedAt": "2025-09-01T17:23:45Z"
  },
  {
    "id": 102,
    "deliverable": 50,
    "person": 7,
    "weeklyHours": { "2025-09-07": 8 },
    "roleOnMilestone": null,
    "isActive": true,
    "personName": "Sarah Chen",
    "projectId": 12,
    "createdAt": "2025-09-02T10:12:00Z",
    "updatedAt": "2025-09-02T10:12:00Z"
  }
]
```

4) By Deliverable
- `GET /api/deliverables/assignments/by_deliverable?deliverable=42`
- Response 200 (JSON):
```json
[
  {
    "id": 101,
    "deliverable": 42,
    "person": 7,
    "weeklyHours": { "2025-09-07": 8, "2025-09-14": 6 },
    "roleOnMilestone": "Designer",
    "isActive": true,
    "personName": "Sarah Chen",
    "projectId": 9,
    "createdAt": "2025-09-01T17:23:45Z",
    "updatedAt": "2025-09-01T17:23:45Z"
  },
  {
    "id": 109,
    "deliverable": 42,
    "person": 11,
    "weeklyHours": { "2025-09-07": 4 },
    "roleOnMilestone": "Reviewer",
    "isActive": true,
    "personName": "Alex Kim",
    "projectId": 9,
    "createdAt": "2025-09-03T09:00:00Z",
    "updatedAt": "2025-09-03T09:00:00Z"
  }
]
```

5) By Person
- `GET /api/deliverables/assignments/by_person?person=7`
- Response 200 (JSON):
```json
[
  {
    "id": 101,
    "deliverable": 42,
    "person": 7,
    "weeklyHours": { "2025-09-07": 8, "2025-09-14": 6 },
    "roleOnMilestone": "Designer",
    "isActive": true,
    "personName": "Sarah Chen",
    "projectId": 9,
    "createdAt": "2025-09-01T17:23:45Z",
    "updatedAt": "2025-09-01T17:23:45Z"
  }
]
```

---

## Validation Rules
- `deliverable` must reference an existing Deliverable; `person` must reference an existing Person.
- `weeklyHours` must be a JSON object where:
  - Keys are Sunday dates in `YYYY-MM-DD` format (weekday() == 6).
  - Values are numbers between 0 and 80 inclusive.
  - Non-numeric, negative, or >80 values are invalid.
- `roleOnMilestone` is trimmed, limited to 100 chars, and sanitized to remove `< > " '`. Null/empty allowed.
- `isActive` defaults to true on create; list endpoints return active records only.

Note: Conflict checks for over-allocation may be performed elsewhere; this API enforces structural and per-field validation only.

---

## Error Shapes and Examples
Standard error shape (to be provided by global handler; see R2 Prompt 13):
```json
{
  "message": "Human-readable summary",
  "details": { "field": ["error detail"] },
  "requestId": "0f7c1a7b-5f9c-4a4a-9b50-2d1e7e2a4f3b"
}
```

Examples:
- 400 Bad Request (invalid weeklyHours key):
```json
{
  "message": "Validation failed",
  "details": { "weeklyHours": ["Week key 2025-09-09 must be a Sunday"] },
  "requestId": "..."
}
```
- 404 Not Found (assignment not found):
```json
{
  "message": "Deliverable assignment not found",
  "requestId": "..."
}
```
- 500 Internal Server Error:
```json
{
  "message": "Unexpected server error",
  "requestId": "..."
}
```

---

## Notes for Implementation (reference)
- ViewSet should filter `is_active=True` and use `select_related('deliverable','person','deliverable__project')` to avoid N+1 queries.
- Ordering by `-created_at` to match `createdAt` desc in responses.
- Week key normalization must write Sundays; readers elsewhere in the code may remain tolerant (+/- days).
- Fields surfaced in responses: `id, deliverable, person, weeklyHours, roleOnMilestone, isActive, personName, projectId, createdAt, updatedAt`.

This file is the source of truth for the DeliverableAssignment API contract.
