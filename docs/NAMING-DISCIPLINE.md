Serializer & Naming Discipline
================================

Goal
- Prevent snake_case ⇄ camelCase mismatches by centralizing name mapping in DRF serializers and aligning frontend types with API responses.

Rules
- Backend
  - Map field names in DRF serializers only. Do not hand‑map keys in views.
  - For aggregates or non‑model payloads, add lightweight `serializers.Serializer` classes and serialize responses through them.
  - Keep API shapes stable; prefer adding explicit serializer fields (e.g., `createdAt`, `updatedAt`) rather than re‑naming in views.
- Frontend
  - Never rename fields ad‑hoc in components. Rely on typed models in `src/types/models.ts` that match serializer outputs.
  - When backend shapes change, update serializers first, then run TypeScript checks (build/time) to reconcile types.

Checks
- TypeScript build serves as an early warning for drift between API and UI types.
- Code review checklist:
  - [ ] Are any responses constructed by hand in views? If yes, is there a serializer?
  - [ ] Do new serializer fields follow camelCase and map via `source='snake_case'`?
  - [ ] Do frontend components use typed models directly (no manual renaming)?

Examples
- Good (backend):
  ```py
  class ProjectSerializer(serializers.ModelSerializer):
      createdAt = serializers.DateTimeField(source='created_at', read_only=True)
  ```
- Good (aggregate):
  ```py
  class ProjectFilterEntrySerializer(serializers.Serializer):
      assignmentCount = serializers.IntegerField()
      hasFutureDeliverables = serializers.BooleanField()
      status = serializers.CharField()
  ```
- Avoid:
  ```py
  # Inside views
  data = { 'createdAt': obj.created_at.isoformat() }  # ❌ Manual mapping in views
  ```

