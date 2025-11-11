# Frontend TypeScript and Build Cleanup Plan

This plan reflects the current codebase. It lists only the issues that still apply, a low‑risk execution order, and copy‑paste prompts to run with your AI agent. The file is UTF‑8 clean.

## Overview

Goal: achieve a clean, reproducible typecheck/build for the frontend without changing runtime behavior. Prioritize minimal, low‑risk edits first; defer larger UI typing changes until needed.

Scope: `frontend/` only. Includes Docker notes for build stability inside containers.

---

## Pre-Assessment (Run This First)

Before making any changes, verify the current state and actual errors:

### Container Health Check
```bash
# Verify Docker environment is stable
docker-compose ps | grep frontend
docker-compose exec frontend node --version
docker-compose exec frontend npm --version
```

### Current Error Assessment
```bash
# See actual TypeScript errors (first 20 lines)
docker-compose exec frontend npx tsc --noEmit 2>&1 | head -20

# Check current build script
docker-compose exec frontend cat package.json | grep -A3 -B3 '"build"'

# Verify current tsconfig settings
docker-compose exec frontend cat tsconfig.json | grep -A2 -B2 '"noEmit"\|"allowImportingTsExtensions"'
```

### Expected Error Patterns to Look For
- **A1**: "allowImportingTsExtensions can only be used when..."
- **A2**: "Object literal may only specify known properties, and 'onError' does not exist"  
- **A3**: "Cannot invoke an object which is possibly 'undefined'"

**⚠️ IMPORTANT**: Only proceed with fixes for errors you actually see. Skip any phase where the pre-check shows no errors.

---

## Issue Inventory (current)

1) Build config/script mismatch (VERIFY FIRST)
- File(s): `frontend/tsconfig.json`, `frontend/package.json`
- Problem: `tsconfig.json` may set `"noEmit": true`, but the build script might run `tsc --noEmit false && vite build`, which overrides tsconfig and can cause the error: "allowImportingTsExtensions can only be used when either noEmit or emitDeclarationOnly is set."
- Fix: Align the build script with tsconfig (use `tsc --noEmit` or rely on `vite build` only).
- **Status**: Verify with pre-check commands above before assuming this needs fixing.

2) React Query v5 query options (NEEDED)
- File: `frontend/src/hooks/useProjectFilterMetadata.ts`
- Problem: `useQuery` options include `onError`, which is not supported in TanStack Query v5 for queries. Logging already happens inside `queryFn` try/catch.
- Fix: Remove the `onError` option only; keep everything else.

3) Monitoring typings and guards (DONE)
- File: `frontend/src/utils/monitoring.tsx`
- Status: React is imported, `userId` is normalized to string, and dev logging uses `if (monitoringDebug)`. No action needed.

4) ProjectsList types (VERIFY)
- File: `frontend/src/pages/Projects/ProjectsList.tsx`
- Status: Current code string‑filters via optional chaining on known string fields and uses helper functions for metadata. No change appears necessary. If `tsc` flags anything, address with minimal string coercion or ordering fixes.

5) Performance Dashboard mapping (DONE)
- File: `frontend/src/pages/Performance/PerformanceDashboard.tsx`
- Status: Uses `getBudgetViolations()` that already includes `budget` and `excess`. No action needed.

6) People pages typing (OPTIONAL NEXT)
- Files: `frontend/src/pages/People/PeopleList.tsx`, `frontend/src/pages/People/PersonForm.tsx`
- Common issues:
  - `proficiencyLevel` should be one of `'beginner'|'intermediate'|'advanced'|'expert'` (not plain string).
  - `role` should be a number ID when posting to the API (convert from string UI value before submit).
- These are not blocking the filter work and can be scheduled later.

7) Docker/Rollup optional dependency mismatch (LIKELY NEEDED in containers)
- Symptom: “Cannot find module '@rollup/rollup-win32-x64-msvc'” during build.
- Cause: node_modules installed on the host and used inside container (or vice versa) so prebuilt/optional deps mismatch the platform.
- Fix: Reinstall dependencies inside the container and do not bind‑mount host `node_modules`.

---

## Execution Plan

Phase A — Unblock Typecheck/Build (low risk)
**⚠️ Run Pre-Assessment first - only fix issues you actually see!**
1. IF NEEDED: Align tsconfig/build script (noEmit vs allowImportingTsExtensions)  
2. IF NEEDED: Remove `onError` from `useProjectFilterMetadata` query options
3. IF FLAGGED: Apply minimal ProjectsList typing fixes

Phase B — Environment Stability (medium risk)
4. Reinstall dependencies inside Docker container (no host `node_modules`)

Phase C — Larger Cleanup (optional)
5. Normalize People pages typing (role ID, proficiency union)

---

## Detailed Steps + Agent Prompts

### A1) Align tsconfig and build script (ONLY IF PRE-CHECK SHOWS CONFLICT)

**First verify this is actually needed:**
```bash
# Check if build script conflicts with tsconfig
docker-compose exec frontend cat package.json | grep '"build"'
docker-compose exec frontend cat tsconfig.json | grep '"noEmit"'
```

**If conflict exists**, recommended: keep `"noEmit": true` in tsconfig and ensure the build script does not override it.

Agent prompt:
```
ONLY if pre-check shows a build/tsconfig conflict:
Edit frontend/package.json and change the build script to one of:
  - "build": "tsc --noEmit && vite build"  
  - or (temporary) "build": "vite build"

Do not change tsconfig.json beyond keeping "noEmit": true.
Afterwards run:
  docker-compose exec frontend npx tsc --noEmit
```

### A2) React Query v5 options in useProjectFilterMetadata (ONLY IF TYPECHECK FAILS)

**First verify this error exists:**
```bash
# Look for onError-related TypeScript errors
docker-compose exec frontend npx tsc --noEmit 2>&1 | grep -i "onError\|useProjectFilterMetadata"
```

Agent prompt:
```
ONLY if TypeScript reports onError-related errors:
Open frontend/src/hooks/useProjectFilterMetadata.ts and remove the onError option from the useQuery options object.
Keep the existing try/catch in queryFn for timing + error logging.
Then run:
  docker-compose exec frontend npx tsc --noEmit
```

### A3) ProjectsList verification (APPLY ONLY IF TSC FLAGS)

Agent prompt:
```
Run: docker-compose exec frontend npx tsc --noEmit
If ProjectsList.tsx is flagged, apply minimal fixes only:
- String-coerce potentially nullable values before .toLowerCase() / .includes(), e.g. String(project.projectNumber || '').toLowerCase()
- Ensure state like newAssignment is declared before its first usage
- Avoid direct filterMetadata.projectFilters access; use the helper functions that already guard null
Re-run typecheck.
```

### B4) Reinstall dependencies inside the Docker container (LIKELY NEEDED)

Agent prompt:
```
Ensure no host node_modules is bind-mounted. Then, inside the container:
  cd frontend
  rm -rf node_modules package-lock.json
  npm ci
  npm run build
```

### C5) People pages typing (OPTIONAL NEXT)

Agent prompt (Part 1 — role typing):
```
In frontend/src/pages/People/PersonForm.tsx, ensure the role value passed to API is a number ID. Keep the UI select as string if convenient, but convert to Number(role) for the payload.
If the local form type expects string, either adjust it to number for API payload or convert right at submit.
Run: docker-compose exec frontend npx tsc --noEmit
```

Agent prompt (Part 2 — proficiency typing):
```
In frontend/src/pages/People/PeopleList.tsx, normalize any free-form proficiencyLevel values to one of 'beginner'|'intermediate'|'advanced'|'expert' before assigning to PersonSkill.
Create a small mapping/guard and use it when setting state.
Run: docker-compose exec frontend npx tsc --noEmit
```

---

## Validation Checklist

### Final Verification
```bash
# Must pass after fixes
docker-compose exec frontend npx tsc --noEmit
docker-compose exec frontend npm run build

# Check that no warnings were introduced  
docker-compose exec frontend npm run build 2>&1 | grep -i "warning\|error" || echo "Build clean"
```

### Runtime Sanity Testing
- **Container Health**: All services running (`docker-compose ps`)
- **Projects page**: "No Assignments" and "Active - No Deliverables" behave correctly  
- **Filter Performance**: Filter metadata loads within reasonable time
- **Cache Invalidation**: Assignment/deliverable CRUD invalidates filter metadata and refreshes
- **Monitoring**: Only logs when `VITE_MONITORING_DEBUG=true`

### Success Criteria
✅ TypeScript compiles without errors (`exit code 0`)  
✅ Build completes without errors  
✅ Bundle size within 10% of previous build  
✅ All existing functionality works as before

## Rollback Notes

All changes are file‑scoped. Use `git checkout -- <file>` to revert any single file. No DB/API schema changes.

