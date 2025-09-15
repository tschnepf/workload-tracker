Title: Consolidate OpenAPI components & enums for cleaner schema/types

Summary
- Replace remaining inline serializers in views with reusable serializers to reduce schema duplication and improve TypeScript types.
- Promote repeated string fields to enums where applicable.
- Regenerate schema and types; ensure CI drift checks pass.

Scope
- People: inline parameters/responses on autocomplete/search/capacity_heatmap/workload_forecast -> dedicated serializers where feasible.
- Projects: confirm filter_metadata response shape is a component (already present) and reuse.
- Deliverables: ensure calendar and staffing_summary use dedicated serializers only (calendar title annotated).
- Assignments: verify check_conflicts request/response components exist; reuse across code paths.
- Dashboard: promote response shape to a named component (avoid large inline shape).

Enums (examples)
- Project status (StatusEnum) – ensure referenced consistently.
- User roles (admin|manager|user) – if repeated, promote or reference existing choice types.

Non-goals
- No behavior changes; API shapes remain identical.
- No frontend refactors beyond types regeneration.

Acceptance
- `docker compose exec backend python manage.py spectacular --file openapi.json --format openapi-json` produces 0 errors/warnings for targeted endpoints.
- `docker compose exec frontend npx openapi-typescript http://backend:8000/api/schema/ -o src/api/schema.ts` has no diffs after commit.
- `.github/workflows/openapi-ci.yml` passes on PR.

Checklist
- [ ] Add/reuse serializers for People custom actions and annotate via `@extend_schema`.
- [ ] Replace remaining inline_serializer() occurrences with named serializers where appropriate.
- [ ] Verify and reuse any existing components in `backend/openapi.json`.
- [ ] Regenerate schema and types; commit.
- [ ] Brief changelog entry for devs.

