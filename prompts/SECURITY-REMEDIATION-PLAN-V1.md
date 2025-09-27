# Security Remediation Plan (V1) — Top‑30 Items

Notes
- Execute phases sequentially or in parallel by owner. Each bullet is a ready‑to‑paste prompt for the AI agent.
- Keep changes minimal and focused. Update SECURITY-FINDINGS.md status as items are fixed.
- Common re‑scan commands after completing a phase:
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json
  - Command: python security/tools/validate_findings.py
 - Common smoke checks after rebuild/restart:
   - Command: curl -fsS http://localhost:8000/api/readiness/
   - Command: curl -I http://localhost/
   - Command: curl -I https://localhost/ (if HTTPS configured)

## Phase 1 — Strengthen CSP (remove unsafe-inline for styles) **COMPLETED**
 - Impact: Requires rebuild (frontend + backend + nginx)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Apply strict, standards-based CSP (nonces/hashes), avoid temporary relaxations; externalize inline code where feasible; add tests and docs.
- Backlog: CSP-UNSAFE-STYLE — Where: backend/config/settings.py:493 — Owner: backend — Severity: Medium
- Prompts:
  - Prompt: Open `backend/config/settings.py` and edit `CSP_POLICY` to remove `unsafe-inline` in `style-src`; use only `'self'` initially.
  - Prompt: Add support for style and script nonces/hashes in `backend/core/middleware.py:CSPMiddleware` and apply a nonce to any remaining inline styles or scripts. Prefer externalizing inline scripts (e.g., theme bootstrap in `frontend/index.html`).
  - Prompt: Update `script-src` to use nonces/hashes (no `unsafe-inline`); ensure `style-src` matches.
  - Prompt: Mirror CSP header in Nginx prod site so static assets are governed: edit `nginx/sites-available/workload-tracker.conf` (both HTTP and HTTPS server blocks) to include `add_header Content-Security-Policy "<final policy>" always;` matching Django’s policy.
  - Prompt: Inline script handling: either move the theme bootstrap from `frontend/index.html` to `frontend/src/main.tsx`, or add a nonce attribute to the script tag and inject the same nonce in the CSP header.
  - Prompt: Ensure `CSP_REPORT_ONLY` is `false` in production (keep `true` in dev); wire via env flags with safe defaults.
  - Prompt: Update docs: add a brief note in `PRODUCTION.md` describing CSP rollout, report endpoint, and how to add nonces/hashes.
  - Prompt: Validate by requesting a page and confirming CSP header has no `unsafe-inline` and app renders correctly.
  - Test: In a prod-configured run, `curl -I http://<host>/` shows CSP without `unsafe-inline`; browser console shows no CSP violations; basic pages render normally.
  - Re-scan and Close: Rerun CI security workflow or local aggregator, confirm the CSP finding changes to fixed, and update `security/security-findings.json` status for `CSP-UNSAFE-STYLE` to `fixed` with evidence.
  - Rebuild/Restart: Command: docker compose build backend frontend nginx && docker compose up -d backend frontend nginx
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/ && curl -I http://localhost/
  - Command: curl -I http://localhost/
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 2 — Gate OpenAPI schema in prod **COMPLETED**

 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Enforce least-privilege access via DRF permissions; avoid ad-hoc route checks or dev-only toggles leaking to prod.
- Backlog: OPENAPI-OPEN — Where: backend/config/urls.py:118 — Owner: backend — Severity: Medium
- Prompts:
  - Prompt: In `backend/config/settings.py` (SPECTACULAR_SETTINGS section), configure `SERVE_PERMISSIONS = ['rest_framework.permissions.IsAuthenticated']` (or `IsAdminUser`) for production only.
  - Prompt: Verify `path('api/schema/', SpectacularAPIView.as_view(), ...)` respects the configured permission in prod; leave open in dev if desired via env flag.
  - Prompt: Add a brief unit test (or manual check notes) that anonymous GET `/api/schema/` in prod returns 401/403.
  - Test: Anonymous GET `/api/schema/` in prod returns 401/403; authenticated request returns 200.
  - Re-scan and Close: Update finding `OPENAPI-OPEN` to `fixed` with evidence and keep Swagger UI handling consistent (see Phase 7).
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: curl -i http://localhost:8000/api/schema/
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 3 — Add MIME/size limits + safe storage for Projects import
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Validate input rigorously with explicit ceilings and private storage; no silent truncation or insecure temp paths.
- Backlog: PROJECTS-IMPORT-LIMITS — Where: backend/projects/views.py:632 — Owner: backend — Severity: Medium
- Prompts:
  - Prompt: In `backend/projects/views.py:ProjectViewSet.import_excel`, enforce content‑type and extension checks mirroring People import (xlsx/xls/csv only); return 400 on mismatch.
  - Prompt: Enforce a max upload size (bytes) using a `PROJECTS_UPLOAD_MAX_BYTES` setting with a sane default; return 413 when exceeded.
  - Prompt: Stream uploads to a private, non‑web‑served path (e.g., `BACKUPS_DIR/incoming/projects`) before processing.
  - Prompt: Add structured error responses for type/size violations; log minimal details.
  - Prompt: Add XLSX hardening helper `backend/core/utils/xlsx_limits.py` that enforces ceilings on worksheet count, rows/cols, and total cell count (defaults: sheets ≤ 10, rows/sheet ≤ 100,000, total cells ≤ 5,000,000); call it before reading entire files to mitigate zip-bomb–style payloads.
  - Prompt: Document new limits and ceilings in `PRODUCTION.md`.
  - Test: Upload wrong MIME -> 400; oversize file -> 413; valid file persists to `BACKUPS_DIR/incoming/projects` and imports successfully.
  - Re-scan and Close: Mark `PROJECTS-IMPORT-LIMITS` fixed with evidence in the findings JSON after verification.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 4 — Escape formulas in People XLSX export
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Use a single sanitizer utility across exports; adhere to spreadsheet security guidance; verify with automated tests.
- Backlog: EXPORT-FORMULA-XLSX — Where: backend/people/utils/excel_handler.py:63 — Owner: backend — Severity: Medium
- Prompts:
  - Prompt: Introduce a small util `backend/core/utils/excel_sanitize.py` with `sanitize_cell(value: str) -> str` to escape leading `= + - @` and control chars for spreadsheet cells; ensure consistent normalization across all exports.
  - Prompt: In XLSX export, set `cell.data_type = 's'` and apply the sanitizer to any string value before writing.
  - Prompt: Add a unit test `backend/people/tests/test_export_sanitization.py` that verifies a value starting with `=CMD()` is written as text (no formula execution in Excel).
  - Test: Generate an XLSX containing `=SUM(1,2)` in a field; open in Excel/LibreOffice and confirm it renders as text (no calculation).
  - Re-scan and Close: Update `EXPORT-FORMULA-XLSX` to fixed once tests pass and manual verification is complete.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python -m pytest backend/people/tests/test_export_sanitization.py -q
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 5 — Escape formulas in People CSV export
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Sanitize before quoting; follow RFC 4180; ensure tests cover edge cases (control chars, quotes, commas).
- Backlog: EXPORT-FORMULA-CSV — Where: backend/people/utils/csv_handler.py:47 — Owner: backend — Severity: Medium
- Prompts:
  - Prompt: Reuse the sanitizer to prefix/escape values beginning with `= + - @` and strip control chars before `writer.writerow` in `backend/people/utils/csv_handler.py`.
  - Prompt: Add a test `backend/people/tests/test_export_sanitization.py` that a CSV cell beginning with `=SUM(A1:A2)` is escaped (opens as text in Excel/LibreOffice).
  - Test: Export CSV containing `=1+1`; open in Excel/LibreOffice and confirm the cell is treated as text, not a formula; verify correct CSV quoting.
  - Re-scan and Close: Mark `EXPORT-FORMULA-CSV` fixed with evidence in findings JSON.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python -m pytest backend/people/tests/test_export_sanitization.py -q
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 6 — Enforce https/allowlist for Slack webhook
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Enforce scheme/host validation centrally; prefer deny-by-default; do not whitelist via fragile string checks.
- Backlog: SLACK-URL-SCHEME — Where: backend/core/notifications.py:19 — Owner: backend — Severity: Medium
- Prompts:
  - Prompt: Parse `SLACK_WEBHOOK_URL` and reject non‑https schemes; optionally restrict host to `*.slack.com`/`hooks.slack.com`.
  - Prompt: Add minimal logging on rejection (no secrets), and return silently as function already suppresses exceptions.
  - Prompt: Update `.env.example` with guidance on allowed Slack URLs.
  - Test: With `SLACK_WEBHOOK_URL=http://example.com/webhook`, function refuses to send; with a valid Slack https URL, function attempts send without error.
  - Re-scan and Close: Update `SLACK-URL-SCHEME` to fixed with unit test references.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python -m pytest -q
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 7 — Gate Swagger UI in prod
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Use DRF/Spectacular permission hooks; avoid custom middleware hacks; keep dev/prod behavior clearly separated via env.
- Backlog: SWAGGER-OPEN — Where: backend/config/urls.py:119 — Owner: backend — Severity: Medium
- Prompts:
  - Prompt: In `backend/config/settings.py` (SPECTACULAR_SETTINGS), ensure `SERVE_PERMISSIONS` gating also applies to Swagger UI in prod; keep dev convenient via env if needed.
  - Prompt: Manual check: anonymous GET `/api/schema/swagger/` in prod returns 401/403.
  - Test: Anonymous GET `/api/schema/swagger/` in prod returns 401/403; authenticated request loads UI (or 404 if intentionally disabled).
  - Re-scan and Close: Mark `SWAGGER-OPEN` fixed with evidence.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: curl -i http://localhost:8000/api/schema/swagger/
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 8 — Add redaction helpers in logs
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Redact at formatter layer; do not log secrets; add tests; keep keys list minimal and extensible.
- Backlog: LOG-REDACTION — Where: backend/config/logging_utils.py:9 — Owner: backend — Severity: Low
- Prompts:
  - Prompt: Extend `JSONFormatter.format` to redact values for keys like `password`, `authorization`, `token`, `refresh`, when present in `record` or `extra`.
  - Prompt: Add unit test: logger with `extra={'authorization':'Bearer xyz'}` emits masked value in JSON.
  - Test: Run unit test; confirm masked output (no raw tokens/secrets) in log JSON.
  - Re-scan and Close: Update `LOG-REDACTION` to fixed in findings JSON with test references.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python -m pytest -q
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 9 — Per‑route nginx body size for backups upload
 - Impact: Restart only (nginx)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Scope size increases to specific routes; avoid global relaxations; document operational rationale.
- Backlog: NGINX-UPLOAD-SIZE — Where: nginx/nginx.conf:31 — Owner: ops — Severity: Low
- Prompts:
  - Prompt: Add a location block override for `/api/backups/upload-restore/` to increase `client_max_body_size` in `nginx/sites-available/workload-tracker.conf` (prod) and, if used, `nginx/sites-available-dev/workload-tracker.dev.conf` (dev).
  - Prompt: Run `nginx -t` in the container to validate configuration before deploy.
  - Test: Upload a backup at the new size threshold; request succeeds; `nginx -t` returns OK.
  - Re-scan and Close: Update `NGINX-UPLOAD-SIZE` to fixed with config diffs.
  - Rebuild/Restart: Command: docker compose build nginx && docker compose up -d nginx
  - Command: docker compose exec nginx nginx -t
  - Smoke: Command: curl -I http://localhost/

## Phase 10 — Clarify RBAC vs. object‑level checks
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Prefer explicit object-level permissions when business rules require; avoid broad group grants without review.
- Backlog: AUTHZ-RBAC-OBJECT — Where: backend/accounts/permissions.py:6 — Owner: backend — Severity: Low
- Prompts:
  - Prompt: Record a product decision in `SECURITY-FINDINGS.md` whether RBAC‑only writes are intended for People/Projects/Assignments.
  - Prompt: If ownership constraints are required, implement `has_object_permission` on the affected viewsets and add tests denying cross‑object writes.
  - Test: Attempt cross‑object edits with non‑owner under the decided policy: expect 403 if object‑level checks enabled; otherwise document acceptance.
  - Re-scan and Close: If implemented, add tests and mark `AUTHZ-RBAC-OBJECT` fixed; if accepted risk, add suppression metadata (approver/expiry) in findings JSON.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python -m pytest -q
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 11 — Add Permissions‑Policy (prod nginx)
 - Impact: Restart only (nginx)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Start conservative (deny features by default); align dev/prod where feasible; document exceptions.
- Backlog: NGINX-PERMISSIONS-POLICY — Where: nginx/sites-available/workload-tracker.conf:1 — Owner: ops — Severity: Low
- Prompts:
  - Prompt: Add a conservative header: `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()` to the prod site server block.
  - Prompt: Validate via `curl -I` that the header is present in prod; ensure both HTTP and HTTPS server blocks are aligned.
  - Test: `curl -I https://<host>/` shows the Permissions-Policy header with the configured values.
  - Re-scan and Close: Mark `NGINX-PERMISSIONS-POLICY` fixed in the findings JSON.
  - Rebuild/Restart: Command: docker compose build nginx && docker compose up -d nginx
  - Command: curl -I https://localhost/
  - Smoke: Command: curl -I http://localhost/

## Phase 12 — Remove `assert` in management commands
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Replace asserts with explicit validation and exceptions; no logic that depends on interpreter optimization flags.
- Backlog: (internal) — Where: backend/core/management/commands/restore_database.py:290 — Owner: backend — Severity: Low
- Prompts:
  - Prompt: Replace `assert` with explicit checks and exceptions or error returns; avoid code stripped by `-O` optimization.
  - Prompt: Add a simple test to exercise the failure path without using `assert`.
  - Test: Run the management command in a failure scenario and under `python -O`; verify proper error handling without asserts.
  - Re-scan and Close: Mark related assert findings triaged→fixed if tracked.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python -O backend/manage.py restore_database --help
  - Command: python -m pytest -q

## Phase 13 — Remove `assert` in safety command
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Same as Phase 12; ensure clear, actionable error messages.
- Backlog: (internal) — Where: backend/core/management/commands/restore_latest_safety.py:81 — Owner: backend — Severity: Low
- Prompts:
  - Prompt: Replace remaining `assert` with explicit validation and exceptions; update error messages accordingly.
  - Test: Execute the command with invalid inputs; verify clear exceptions and no reliance on `assert`.
  - Re-scan and Close: Mark related assert findings fixed if tracked.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python -m pytest -q

## Phase 14 — Remove deprecated X‑XSS‑Protection header
 - Impact: Restart only (nginx)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Rely on modern headers (CSP, X-Content-Type-Options); avoid legacy/deprecated directives.
- Backlog: NGINX-XXSS — Where: nginx/nginx.conf:60 — Owner: ops — Severity: Low
- Prompts:
  - Prompt: Delete `add_header X-XSS-Protection ...` from nginx configs (dev/prod) and rely on CSP and modern mitigations.
  - Test: `curl -I https://<host>/` shows no `X-XSS-Protection` header.
  - Re-scan and Close: Update `NGINX-XXSS` to fixed with header diff evidence.
  - Rebuild/Restart: Command: docker compose build nginx && docker compose up -d nginx
  - Command: curl -I https://localhost/
  - Smoke: Command: curl -I http://localhost/

## Phase 15 — Harden Slack webhook URL handling (scheme validation)
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Centralize URL validation; keep timeouts conservative; no broad allowlists.
- Backlog: SLACK-URL-SCHEME — Where: backend/core/notifications.py:19 — Owner: backend — Severity: Low
- Prompts:
  - Prompt: Ensure the scheme/host checks from Phase 6 are present and covered by a small unit test; keep timeouts short (`timeout` arg already exists).
  - Test: Unit test passes for allowed/denied webhook URLs; non‑https URLs are rejected.
  - Re-scan and Close: Close out `SLACK-URL-SCHEME` once tests pass.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/
  - Command: python -m pytest -q
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 16 — Set cookie SameSite explicitly (prod)
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Set explicit cookie attributes (Secure, HttpOnly, SameSite=Lax) in prod; avoid loosening for convenience.
- Backlog: DJANGO-SAMESITE — Where: backend/config/settings.py — Owner: backend — Severity: Low
- Prompts:
  - Prompt: In prod branch of settings, set `SESSION_COOKIE_SAMESITE = 'Lax'` and `CSRF_COOKIE_SAMESITE = 'Lax'` explicitly; keep `Secure` flags already enabled.
  - Prompt: Verify CORS/CSRF alignment: ensure `CORS_ALLOW_CREDENTIALS` is only true when cookie mode is enabled; populate `CSRF_TRUSTED_ORIGINS` in prod.
  - Prompt: Validate via response headers that SameSite=Lax is present in prod.
  - Test: In prod, inspect `Set-Cookie` headers for session and CSRF cookies; both include `SameSite=Lax; Secure; HttpOnly` as appropriate.
  - Re-scan and Close: Update `DJANGO-SAMESITE` to fixed and note CORS/CSRF alignment in the report.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Command: curl -I http://localhost:8000/ | grep -i set-cookie
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 17 — Require cookie refresh mode in prod (avoid LS for refresh)
 - Impact: Requires rebuild (frontend + backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Store refresh tokens only in httpOnly cookies; never in localStorage/sessionStorage.
- Backlog: FRONT-REFRESH-LS — Where: frontend/src/store/auth.ts:115 — Owner: frontend — Severity: Low
- Prompts:
  - Prompt: Ensure `VITE_COOKIE_REFRESH_AUTH` is `true` in prod builds; confirm backend cookie refresh is enabled accordingly.
  - Prompt: Guard localStorage refresh usage to dev only; add a runtime check that warns if cookie mode is off in prod.
  - Test: In prod build, attempt login/refresh and verify no refresh token is stored in localStorage; access token refresh works via cookie.
  - Re-scan and Close: Mark `FRONT-REFRESH-LS` fixed with a prod build verification note.
  - Rebuild/Restart: Command: docker compose build frontend backend && docker compose up -d frontend backend
  - Command: npm run build --prefix frontend && npm run preview --prefix frontend
  - Smoke: Command: curl -fsS http://localhost:8000/api/readiness/ && curl -I http://localhost/

## Phase 18 — Pin frontend dependencies and commit lockfile
 - Impact: Requires rebuild (frontend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Pin exact versions; commit lockfile; no registry overrides or unreviewed postinstall scripts.
- Backlog: SUPPLY-NPM-RANGES — Where: frontend/package.json — Owner: frontend — Severity: Low
- Prompts:
  - Prompt: Replace `^` ranges with exact versions in `frontend/package.json`; run `npm ci` and commit the resulting lockfile.
  - Prompt: Add or update CI to fail when ranges are reintroduced or lockfile drifts (extend `.github/workflows/security.yml`). Also add Python pinning checks (pip freeze/requirements pinning) and retain pip-audit/safety gates for new High/Critical vulnerabilities.
  - Test: CI run fails when `^` ranges are reintroduced or lockfile is missing; passes with pinned deps and committed lockfile.
  - Re-scan and Close: Mark `SUPPLY-NPM-RANGES` fixed; note CI guardrails added.
  - Rebuild/Restart: Command: docker compose build frontend && docker compose up -d frontend
  - Command: git add frontend/package.json frontend/package-lock.json && git commit -m "pin deps"
  - CI (Python pinning): Add a step in `.github/workflows/security.yml` that fails if `backend/requirements.txt` contains unpinned entries (e.g., run: `if grep -Ev "^#|^\s*$|==" backend/requirements.txt | grep -q .; then echo 'Unpinned Python deps found' >&2; exit 1; fi`).

## Phase 19 — Container hardening: read‑only FS and cap drops
 - Impact: Restart only (compose recreate backend/frontend/nginx)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Principle of least privilege at runtime; minimize write surfaces via tmpfs; verify with inspect and smoke tests.
- Backlog: CONTAINERS-ROFS-CAPS — Where: docker-compose.prod.yml — Owner: ops — Severity: Low
- Prompts:
  - Prompt: For app services, add `read_only: true`, mount tmpfs for required writable paths (e.g., `/tmp`, cache dirs), and set `cap_drop: ["ALL"]` with minimal `cap_add` as needed.
  - Prompt: Validate via `docker inspect` that services run with read‑only FS and minimal capabilities.
  - Test: `docker inspect` shows `ReadonlyRootfs=true` and `CapDrop` includes `ALL`; application functions normally.
  - Re-scan and Close: Update `CONTAINERS-ROFS-CAPS` to fixed with inspect output.
  - Rebuild/Restart: Command: docker compose up -d --build backend frontend nginx
  - Command: docker compose ps && docker inspect $(docker compose ps -q backend)
  - Smoke: Command: docker compose exec backend sh -lc 'echo ok >/tmp/smoke && cat /tmp/smoke'

## Phase 20 — Enable DB TLS in transit (where feasible)
 - Impact: Restart only (db + backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Prefer TLS with proper cert validation; avoid disabling verification except in controlled dev contexts.
- Backlog: DB-TLS — Where: docker-compose.prod.yml — Owner: ops — Severity: Low
- Prompts:
  - Prompt: Configure Postgres with TLS certs and enable SSL; set application `sslmode=require` via `DATABASE_URL` where infra supports it.
  - Prompt: Validate with `psql` that SSL is in use; ensure app connects successfully.
  - Test: `psql` reports `SSL connection (protocol: TLS...)`; app connects with `sslmode=require` without errors.
  - Re-scan and Close: Mark `DB-TLS` fixed or record accepted risk with suppression metadata.
  - Rebuild/Restart: Command: docker compose up -d --build db backend
  - Command: docker compose exec db psql -c 'SHOW ssl;'
  - DSN examples: Set `DATABASE_URL=postgresql://user:pass@db:5432/name?sslmode=require`. Alternatively in Django DB OPTIONS: `{ 'sslmode': 'require' }`.

## Phase 21 — Reject macro‑enabled Excel formats
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Accept only safe formats (.xlsx); explicitly reject macro-enabled; document rationale.
- Backlog: XLSM-REJECT — Where: backend/people/views.py:980 — Owner: backend — Severity: Low
- Prompts:
  - Prompt: In People import, reject `.xlsm`/`.xltm` explicitly; prefer `.xlsx`; keep `.xls` only if needed and safe.
  - Prompt: Add a unit test that uploads of macro files are rejected (400).
  - Test: Upload `.xlsm` and `.xltm` files to the endpoint; both return 400; valid `.xlsx` is accepted.
  - Re-scan and Close: Update `XLSM-REJECT` to fixed.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Command: python -m pytest -q

## Phase 22 — Align external fonts with CSP or self‑host
 - Impact: Requires rebuild (frontend + nginx)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Prefer self-hosting or minimally scoped CSP origins; remove unused hints/preconnects.
- Backlog: CSP-FONTS-PRECONNECT — Where: frontend/index.html:9 — Owner: frontend — Severity: Low
- Prompts:
  - Prompt: Either self‑host fonts or add minimal `font-src` and `style-src` origins to CSP that match Google Fonts usage; remove unused preconnects.
  - Prompt: Validate with browser devtools that CSP has no violations when loading fonts.
  - Test: Load the app with fonts enabled; browser devtools show no CSP violations and fonts render correctly.
  - Re-scan and Close: Mark `CSP-FONTS-PRECONNECT` fixed and capture updated CSP.
  - Rebuild/Restart: Command: docker compose build frontend nginx && docker compose up -d frontend nginx
  - Command: curl -I http://localhost/

## Phase 23 — Escape formulas in Projects XLSX export
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Reuse shared sanitizer; ensure consistent behavior across all export surfaces; include tests.
- Backlog: PROJECTS-EXPORT-FORMULA — Where: backend/projects/utils/excel_handler.py:83 — Owner: backend — Severity: Medium
- Prompts:
  - Prompt: Reuse the shared sanitizer from Phase 4 for Projects export; ensure string cell type and escaping of formula prefixes.
  - Prompt: Add a unit test verifying no Excel formula execution for malicious leading characters.
  - Test: Generate Projects XLSX and verify cells with `=...` are treated as text in Excel/LibreOffice.
  - Re-scan and Close: Update `PROJECTS-EXPORT-FORMULA` to fixed with test evidence.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Command: python -m pytest -q

## Phase 24 — Harden subprocess usage in backup/restore
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Use shell=False, absolute paths, sanitized env; check return codes; capture stderr/stdout; never build shell strings.
- Backlog: SUBPROCESS-HARDENING — Where: backend/core/management/commands/restore_database.py:54 (+ related) — Owner: backend — Severity: Low
- Prompts:
  - Prompt: Ensure all `subprocess` calls use `shell=False`, absolute executable paths, validated argument lists, sanitized environment, and explicit return‑code checks; capture stdout/stderr for diagnostics.
  - Prompt: Add tests (where practical) for failure handling and return‑code checks.
  - Test: Unit test simulates a non‑zero return code and invalid path; code handles errors without shell injection risk.
  - Re-scan and Close: Mark `SUBPROCESS-HARDENING` fixed with links to tests.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Command: python -m pytest -q

## Phase 25 — Document dev host port exposure vs prod
 - Impact: No rebuild (docs)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Ensure prod never uses dev compose; document separation clearly.
- Backlog: DEV-PORT-EXPOSURE — Where: docker-compose.yml — Owner: ops — Severity: Low
- Prompts:
  - Prompt: In `PRODUCTION.md`, clarify that dev compose exposes DB/Redis to host for convenience; prod compose does not and should be used in production.
  - Test: Documentation updated; verify production deployment uses `docker-compose.prod.yml` with no host port exposure for DB/Redis.
  - Re-scan and Close: Mark `DEV-PORT-EXPOSURE` fixed with doc link.
  - Rebuild/Restart: (Docs only) No container changes required.
  - Command: git add PRODUCTION.md && git commit -m "doc: prod compose usage"

## Phase 26 — Evaluate Redis TLS in transit (optional)
 - Impact: Restart only (redis + backend if enabled)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Prefer TLS where feasible; document accepted risk formally if not enabled.
- Backlog: REDIS-TLS — Where: docker-compose.prod.yml — Owner: ops — Severity: Low
- Prompts:
  - Prompt: Record a decision on Redis TLS feasibility; enable if supported and required by environment; otherwise document accepted risk.
  - Test: If enabled, `redis-cli --tls` connects successfully; if not, decision and rationale recorded in SECURITY-FINDINGS.md.
  - Re-scan and Close: Mark `REDIS-TLS` fixed or add accepted-risk suppression in findings JSON.
  - Rebuild/Restart: Command: docker compose up -d --build redis backend
  - Command: docker compose exec redis redis-cli ping
  - DSN examples: Use `rediss://:password@redis:6379/1` in URLs; for Django cache TLS options, set `ssl_cert_reqs` appropriately (dev may use `none`).

## Phase 27 — Clarify JWT idle timeout policy
 - Impact: Restart only (backend)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Short-lived access tokens (15–30 min) with refresh rotation; avoid long-lived bearer tokens.
- Backlog: JWT-IDLE-TIMEOUT — Where: backend/config/settings.py:267 — Owner: backend — Severity: Low
- Prompts:
  - Prompt: Set target access token lifetime to 15–30 minutes in production per runbook; adjust `SIMPLE_JWT['ACCESS_TOKEN_LIFETIME']` accordingly.
  - Prompt: Document and (optionally) enforce session idle timeout behavior for JWT; maintain refresh rotation/blacklist as currently configured.
  - Test: Set a short access token lifetime in a test environment; confirm refresh/idle behavior matches policy and is documented.
  - Re-scan and Close: Record policy and mark `JWT-IDLE-TIMEOUT` fixed.
  - Rebuild/Restart: Command: docker compose build backend && docker compose up -d backend
  - Command: python security/tools/aggregate_findings.py --artifacts security/artifacts --out security/security-findings.json && python security/tools/validate_findings.py

## Phase 28 — Per‑route nginx body size for People/Projects imports
 - Impact: Restart only (nginx)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Scope overrides to import routes only; keep global limits conservative.
- Backlog: NGINX-UPLOAD-SIZE-IMPORTS — Where: nginx/nginx.conf:31 — Owner: ops — Severity: Low
- Prompts:
  - Prompt: Add location‑specific `client_max_body_size` overrides for People and Projects import routes to prevent unnecessary 413 errors.
  - Prompt: Validate via `nginx -t` and test uploads at expected sizes.
  - Test: Upload expected‑size People and Projects files; imports succeed without 413; `nginx -t` passes.
  - Re-scan and Close: Mark `NGINX-UPLOAD-SIZE-IMPORTS` fixed with config diff.
  - Rebuild/Restart: Command: docker compose build nginx && docker compose up -d nginx
  - Command: docker compose exec nginx nginx -t

## Phase 29 — CI guardrails for pinning/lockfile and findings schema
 - Impact: No rebuild (CI)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Fail fast on pinning violations; keep findings schema validation mandatory in PRs.
- Backlog: CI-PINNING-GUARDS — Where: .github/workflows/security.yml — Owner: frontend/dev‑ops — Severity: Low
- Prompts:
  - Prompt: Add a CI step that fails on semver ranges in `package.json` or missing lockfile; keep Ajv validation for findings JSON.
  - Test: Open a PR introducing a `^` range; CI fails; fixing to pinned versions makes CI green.
  - Re-scan and Close: Mark `CI-PINNING-GUARDS` fixed; attach a sample failing CI run screenshot/link.
  - Rebuild/Restart: (CI only) No container changes required.
  - Command: git add .github/workflows/security.yml && git commit -m "ci: add pinning/lockfile guards"

## Phase 30 — Document cookie refresh mode requirement (prod)
 - Impact: No rebuild (docs)
 - Editing rules: Use apply_patch for all file changes. Preserve formatting and existing line endings. Do not use shell writes (Set-Content/echo/sed) to modify code. Do not insert literal '\r\n' sequences; let the patch handle newlines. Avoid bulk regex replacements; submit minimal, contextual patches.
- Best-practice: Production requires cookie refresh mode; no exceptions; include post-deploy verification steps.
- Backlog: DOCS-COOKIE-MODE — Where: PRODUCTION.md — Owner: backend — Severity: Low
- Prompts:
  - Prompt: Update `PRODUCTION.md` to state that production must run in cookie refresh mode; include env flags (`COOKIE_REFRESH_AUTH=true`) and expected cookie flags (HttpOnly, Secure, SameSite=Lax).
  - Prompt: Include a quick verification snippet for ops to confirm cookie behavior.
  - Test: In prod, refresh flow uses httpOnly cookie; no refresh token stored in localStorage; headers show secure cookie flags.
  - Re-scan and Close: Mark `DOCS-COOKIE-MODE` fixed with doc link and prod verification note.
  - Rebuild/Restart: (Docs only) No container changes required.
  - Command: git add PRODUCTION.md && git commit -m "doc: cookie refresh mode"
