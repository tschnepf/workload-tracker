# Security Findings (Fact-Finding Report)

## Executive Summary
- Overall posture: strong defaults (IsAuthenticated, throttles, non-root containers) with several configuration and defense-in-depth gaps. No critical RCEs or severe auth bypasses found in static review.
- Highest-impact themes:
  - Public schema/UI exposure and CSP weaknesses increase reconnaissance and XSS risk.
  - Upload/export hardening: enforce MIME/size ceilings; escape spreadsheet formulas.
  - Runtime hardening: header hygiene, route-specific body size for backups, container RO FS/caps.
  - Token handling: ensure cookie refresh mode in prod; avoid localStorage for refresh tokens.
- Top assets at risk: account tokens, project/people/assignment data, backup archives.
- Quick wins (low effort, high value): gate Swagger/OpenAPI; tighten CSP; add formula escaping; add nginx Permissions-Policy and remove X-XSS-Protection.

## Threat Model & Inventory (Summary)
- Stacks: Django/DRF (Python 3.11), React/Vite/TS (Node 20), Nginx reverse proxy, Celery, Redis, Postgres.
- Trust Boundaries: Internet -> Nginx -> Backend API; Internet -> Nginx -> Frontend static; Backend/Workers -> Postgres/Redis (docker network only); Django Admin for staff.
- Critical Assets: Credentials/tokens, People/Projects/Assignments/Deliverables data, backup archives in `/backups`.
- Public Surfaces: `/health`, `/readiness`, `/api/health/`, `/api/readiness/`, `/api/token/*`, `/csp-report/`, `/api/schema/swagger/` (Swagger UI), and (likely auth’d) `/api/schema/`.
- Inventory Artifacts: See `security/artifacts/*.json` for Phase 0 outputs; tool scan artifacts under `security/artifacts/` and aggregate at `security/security-findings.json`.

## Top-30 Findings (At a Glance)
1. [Medium] CSP allows 'unsafe-inline' for styles — Risk Score 3 — Where: backend/config/settings.py:493
2. [Medium] OpenAPI schema unauthenticated — Risk Score 3 — Where: backend/config/urls.py:118
3. [Medium] Projects import lacks MIME/size limits — Risk Score 3 — Where: backend/projects/views.py:632
4. [Medium] XLSX export lacks formula escaping — Risk Score 3 — Where: backend/people/utils/excel_handler.py:63
5. [Medium] CSV export lacks formula escaping — Risk Score 3 — Where: backend/people/utils/csv_handler.py:47
6. [Medium] Slack URL open() audit (scheme) — Risk Score 3 — Where: backend/core/notifications.py:19
7. [Medium] Swagger UI unauthenticated — Risk Score 3 — Where: backend/config/urls.py:119
8. [Low] Logging lacks redaction helpers — Risk Score 0.67 — Where: backend/config/logging_utils.py:9
9. [Low] No route-specific body size for backups upload — Risk Score 0.67 — Where: nginx/nginx.conf:31
10. [Low] RBAC manager-wide writes; no object-level check — Risk Score 0.67 — Where: backend/accounts/permissions.py:6
11. [Low] Permissions-Policy missing (prod site) — Risk Score 0.67 — Where: nginx/sites-available/workload-tracker.conf:1
12. [Low] assert used in management command — Risk Score 0.67 — Where: backend/core/management/commands/restore_database.py:290
13. [Low] assert used in management command — Risk Score 0.67 — Where: backend/core/management/commands/restore_latest_safety.py:81
14. [Low] Deprecated X-XSS-Protection header — Risk Score 0.67 — Where: nginx/nginx.conf:60
15. [Low] Slack webhook URL not scheme-validated — Risk Score 0.67 — Where: backend/core/notifications.py:19

16. [Low] Cookie SameSite not explicitly set (prod) — Risk Score 0.67 — Where: backend/config/settings.py:1
17. [Low] Refresh token stored in localStorage when cookie mode off — Risk Score 0.67 — Where: frontend/src/store/auth.ts:115
18. [Low] Frontend dependencies unpinned; commit lockfile — Risk Score 0.67 — Where: frontend/package.json:1
19. [Low] Container hardening: read_only rootfs and cap_drop missing — Risk Score 0.67 — Where: docker-compose.prod.yml:1
20. [Low] Database TLS in transit not configured — Risk Score 0.67 — Where: docker-compose.prod.yml:1
21. [Low] Reject macro/legacy Excel formats (.xlsm/.xltm) — Risk Score 0.67 — Where: backend/people/views.py:980
22. [Low] External fonts preconnect; align CSP or self-host — Risk Score 0.67 — Where: frontend/index.html:9
23. [Medium] Projects XLSX export lacks formula escaping — Risk Score 3 — Where: backend/projects/utils/excel_handler.py:83
24. [Low] Subprocess hardening in backup/restore commands — Risk Score 0.67 — Where: backend/core/management/commands/restore_database.py:54
25. [Low] Dev compose exposes DB/Redis ports on host — Risk Score 0.67 — Where: docker-compose.yml:1
26. [Low] Redis TLS not configured (optional) — Risk Score 0.67 — Where: docker-compose.prod.yml:1
27. [Low] Session idle timeout policy explicitness (JWT) — Risk Score 0.67 — Where: backend/config/settings.py:267
28. [Low] Per-route nginx body size for People/Projects imports — Risk Score 0.67 — Where: nginx/nginx.conf:31
29. [Low] CI guardrails for lockfile/pinning — Risk Score 0.67 — Where: .github/workflows/security.yml:1
30. [Low] Document cookie mode requirement for prod — Risk Score 0.67 — Where: PRODUCTION.md:1

## Top Findings (At a Glance)
1. Medium XLSX/CSV export formula injection risk — Risk Score 9.0 — Where: backend/people/utils/excel_handler.py:63, backend/people/utils/csv_handler.py:47
   - Vector: Values beginning with = + - @ are interpreted as formulas by spreadsheet apps.
   - Impact: Client-side data exfiltration or code execution when opening exports.
   - Fix: Escape leading characters (prefix apostrophe) and sanitize control chars; set XLSX cell type to string.
2. Medium CSP allows `unsafe-inline` for styles — Risk Score 6.67 — Where: backend/config/settings.py:493
   - Vector: Inline style execution; reduces CSP strength against DOM XSS pivots.
   - Impact: Weakens defense-in-depth for UI; not a direct exploit alone.
   - Fix: Remove `unsafe-inline` and use nonces/hashes; move to enforce mode in prod (disable report-only after tuning).
3. Medium Swagger UI publicly accessible — Risk Score 8.33 — Where: backend/config/urls.py:119
   - Vector: Anonymous access to `/api/schema/swagger/` may disclose methods/paths.
   - Impact: Exposure of internal endpoints and parameters in prod.
   - Fix: Add `SPECTACULAR_SETTINGS['SERVE_PERMISSIONS'] = ['rest_framework.permissions.IsAuthenticated']` (or `IsAdminUser`).
4. Medium OpenAPI schema publicly accessible — Risk Score 6.0 — Where: backend/config/urls.py:118
   - Vector: Anonymous access to `/api/schema/` fetches full API description.
   - Impact: Endpoint inventory disclosure; aids reconnaissance.
   - Fix: Protect schema endpoint in prod with `IsAuthenticated` or admin-only.
4. Low Slack webhook URL not scheme-restricted — Risk Score 1.67 — Where: backend/core/notifications.py:15
   - Vector: If `SLACK_WEBHOOK_URL` is mis-set or attacker-influenced, could trigger SSRF.
   - Impact: Outbound requests to internal endpoints; mitigated by env control and short timeout.
   - Fix: Require `https` scheme and optionally host allowlist; log failures with minimal detail.
5. Low Deprecated header `X-XSS-Protection` set — Risk Score 1.33 — Where: nginx/nginx.conf:60, nginx/sites-available/workload-tracker.conf:15,154
   - Vector: Legacy, ignored by modern browsers; may cause false sense of security.
   - Impact: None directly; standard hardening gap.
   - Fix: Remove `X-XSS-Protection`; rely on CSP and modern mitigations.
6. Low MD5 used for ETag calculation (not for security) — Risk Score 1.33 — Where: backend/core/etag.py:26 and related
   - Vector: MD5 flagged by static tool; usage is non-security (entity tag hashing only).
   - Impact: None for confidentiality/integrity; informational.
   - Fix: Optionally use `hashlib.blake2b` or `hashlib.md5(..., usedforsecurity=False)` to suppress tool noise.
7. Low Missing `Permissions-Policy` in prod nginx site — Risk Score 1.33 — Where: nginx/sites-available/workload-tracker.conf
   - Vector: Absent fine-grained browser feature restrictions on prod listener.
   - Impact: Slightly larger client attack surface.
   - Fix: Add conservative `Permissions-Policy` (e.g., `geolocation=(), microphone=(), camera=(), payment=()`), as used in dev.

8. Medium Projects import lacks MIME/size limits (DoS risk) — Risk Score 6.0 — Where: backend/projects/views.py:632
   - Vector: Large or malformed file uploads processed in-memory without limits.
   - Impact: Memory/CPU pressure; potential service degradation.
   - Fix: Enforce content-type and size ceilings; stream to private path and process via background job.
9. Low Slack webhook URL not scheme-restricted — Risk Score 1.67 — Where: backend/core/notifications.py:19
   - Vector: Misconfigured env could allow SSRF to internal addresses.
   - Impact: Outbound SSRF attempts; mitigated by env control and short timeout.
   - Fix: Enforce `https` and allowlist Slack hosts; log minimal errors.
10. Low Deprecated header `X-XSS-Protection` set — Risk Score 1.33 — Where: nginx/nginx.conf:60
   - Vector/Impact: Legacy header; remove to reduce noise.
   - Fix: Remove; rely on CSP and modern mitigations.
11. Low Backups upload lacks route-specific body size — Risk Score 1.33 — Where: nginx/nginx.conf:31
   - Vector: Global `client_max_body_size 100M` may block valid backup uploads.
   - Impact: Operational friction for restores.
   - Fix: Set larger `client_max_body_size` only for `/api/backups/upload-restore/` location.
12. Low RBAC allows manager-wide writes; no object-level owner check — Risk Score 4.0 — Where: backend/accounts/permissions.py:6, backend/config/settings.py:214
   - Vector: Managers can modify any object; no per-object ownership guard.
   - Impact: Broad write scope by role; confirm product intent.
   - Fix: If required, add `has_object_permission` on sensitive views; otherwise document as accepted.


## All Findings
- Aggregated tool results (Bandit, Semgrep, pip-audit/Safety, npm audit when available, Trivy when available) are normalized in `security/security-findings.json` and validate locally. Use this file for CI dashboards and triage.
- Notable triage decisions (noise control):
  - MD5 ETag flags from Bandit are downgraded to Low (non-security use).
  - Generic `try/except/pass` and broad exception catches marked Low unless evidence of authz bypass or sensitive handling.


## Evidence & References
- Swagger UI exposure:
  - backend/config/urls.py:118-119 — `SpectacularAPIView` and `SpectacularSwaggerView` routes present; no `SERVE_PERMISSIONS` configured in settings.
- CSP configuration:
  - backend/config/settings.py:493 — `CSP_POLICY` includes `style-src 'unsafe-inline'`; `CSP_REPORT_ONLY` toggled by env.
- Excel/CSV exports:
  - backend/people/utils/excel_handler.py:63 — writes raw values into cells (risk for `= + - @`-prefixed strings).
  - backend/people/utils/csv_handler.py:47 — writes raw CSV rows without formula escaping.
- Slack webhook:
  - backend/core/notifications.py:15-22 — `urllib.request.urlopen` to env-provided URL without scheme allowlist.
- Deprecated header:
  - nginx/nginx.conf:60; nginx/sites-available/workload-tracker.conf:15,154 — `X-XSS-Protection` set.
- ETag hashing:
  - backend/core/etag.py:26 — `hashlib.md5(...)` used for ETag only.
- Projects import:
  - backend/projects/views.py:632 — `import_excel` lacks MIME/size limits and safe storage; uses in-process parsing.
- Permissions/Defaults:
  - backend/config/settings.py:214 — `DEFAULT_PERMISSION_CLASSES` include `IsAuthenticated` + Role-based default.
  - backend/accounts/permissions.py:6 — `RoleBasedAccessPermission` grants Manager write access globally.
- Nginx upload limit:
  - nginx/nginx.conf:31 — `client_max_body_size 100M;` global, no per-route override for backups upload.

### Additional Phase 2 Deep‑Dive Evidence
- Cookie SameSite explicitness:
  - backend/config/settings.py — no explicit `SESSION_COOKIE_SAMESITE`/`CSRF_COOKIE_SAMESITE`; defaults are Lax in Django 5, but set explicitly in prod for clarity.
- Token storage (frontend):
  - frontend/src/store/auth.ts — stores refresh token in localStorage when `VITE_COOKIE_REFRESH_AUTH` is false; ensure cookie mode is on in prod.
- External resources & CSP:
  - frontend/index.html:9–12 — preconnect to Google Fonts; align CSP or remove unused preconnects.
- Supply chain pinning:
  - frontend/package.json — caret (`^`) ranges and no committed lockfile.
- Container hardening:
  - docker-compose.prod.yml — no `read_only: true` or `cap_drop`; consider read‑only FS and minimal caps.
- Excel macro/legacy formats:
  - backend/people/views.py:940–1000 — accepts `.xls` (and doesn’t reject `.xlsm`); prefer `.xlsx` only and reject macro‑enabled.

## 30/60/90-Day Hardening Roadmap
- 30 days
  - Gate `/api/schema` and `/api/schema/swagger/` with auth (prod).
  - Remove `X-XSS-Protection`; add conservative `Permissions-Policy` in nginx (prod/dev parity).
  - Update CSP: remove `unsafe-inline` for styles via nonces/hashes; turn off report-only in prod once stabilized.
  - Add CSV/XLSX formula escaping; sanitize control chars; set XLSX string cell types.
  - Enforce MIME/size ceilings and private storage for project imports (match People import patterns).
- 60 days
  - Explicit cookie policy: set `SESSION_COOKIE_SAMESITE` and `CSRF_COOKIE_SAMESITE` to `Lax` in prod.
  - Ensure cookie refresh mode is enabled in prod; avoid localStorage for refresh tokens.
  - Per‑route nginx `client_max_body_size` for `/api/backups/upload-restore/`.
  - Add logging redaction helpers for common sensitive keys in structured logs.
  - Pin frontend dependencies and commit lockfile; enable Renovate.
- 90 days
  - Container hardening: `read_only: true`, minimal `cap_drop`, tmpfs for writable paths.
  - Evaluate DB/Redis TLS in transit for production environments.
  - Object‑level authorization policy: confirm RBAC-only is intended; if not, add `has_object_permission` where needed.
  - XLSX hardening: reject macro‑enabled formats; set ceilings on worksheets/cells; validate ZIP structure.
  - Add authz and export‑sanitization checks to CI (Semgrep/custom rules).

## Compliance Mapping (Top‑10)
- ASVS 1.2.5: Swagger/OpenAPI gated (Items: Swagger/OpenAPI).
- ASVS 3.3.2: Cookie attributes (SameSite, Secure, HttpOnly) set explicitly (Cookie SameSite explicitness, cookie refresh mode).
- ASVS 5.3.2/5.3.3: Output encoding and injection prevention (CSV/XLSX formula escaping).
- ASVS 8.3.1: Sensitive data in client storage (avoid localStorage for tokens; cookie mode in prod).
- ASVS 14.4.x: CSP strength (remove `unsafe-inline`, use nonces/hashes).
- CIS NGINX Benchmarks: Security headers and body size controls (X‑Frame‑Options, X‑Content‑Type‑Options already present; add Permissions‑Policy; per‑route size limits).
- CIS Docker/Container: Read‑only rootfs and capability drops (container hardening).


## Quick Fix Guidance
- Swagger UI: in `backend/config/settings.py` set `SPECTACULAR_SETTINGS['SERVE_PERMISSIONS']` to `IsAuthenticated` (or stricter) and confirm in prod.
- CSP: remove `unsafe-inline` for styles by adopting nonces/hashes; move `CSP_REPORT_ONLY=false` in prod when stable.
- Exports (XLSX/CSV): escape formula-leading characters and control chars; set `cell.data_type = 's'` in openpyxl and prefix `'` in CSV.
- Slack webhook: parse URL and enforce `https` scheme; consider host allowlist (Slack domains) and minimal timeouts.
- Nginx headers: remove `X-XSS-Protection`; add `Permissions-Policy` to prod site to match dev.
- MD5 ETag: optional modernization to `blake2b` or `usedforsecurity=False` for clarity.


## Tooling & Validation
- Scans run locally: Bandit, Semgrep (limited), pip-audit, Safety. Artifacts written to `security/artifacts/*` and aggregated via `security/tools/aggregate_findings.py`.
- Findings JSON: `security/security-findings.json` contains 189 items (mostly Low/semgrep noise); begin triage by severity and category.
- Schema: Use Ajv in CI (`.github/workflows/security.yml`) to validate `security/security-findings.json` against `security/schema/security-findings.schema.json`.

## Triaged/Noise Appendix
- Overview: 186 findings are marked `status=triaged` to acknowledge low-signal or low-risk items while retaining evidence and fix notes in the machine report.
- Categories (counts)
  - Exception noise (generic try/except): 108 — tags: `noise:exception`
  - Exception pass/continue patterns: 101 — tags: `noise:exception-pass`
  - Subprocess in mgmt/backup commands (reviewed): 43 — tags: `bandit:subprocess-reviewed`
  - Test-only hardcoded credentials: 39 — tags: `tests:hardcoded-credential`
  - Test-only paths (non-production artifacts): 17 — tags: `tests-only`
  - MD5 used for ETag (non-security hashing): 13 — tags: `bandit:B303-md5-nonsecurity`
- Rationale
  - Exception noise: Hygiene/observability improvements; not an immediate vuln absent sensitive flows. Keep for tech-debt cleanup.
  - Subprocess reviewed: Internal commands with controlled inputs; ensure absolute paths, `shell=False`, validated args, and return-code checks.
  - Test-only items: No production impact; cleanup as convenient.
  - MD5 for ETag: Not used for security; acceptable. Optionally switch to `blake2b` or `md5(..., usedforsecurity=False)` to silence tools.
- Tracking
  - All triaged items remain in `security/security-findings.json` with justification tags. Promote any item to open if context changes or evidence strengthens.
