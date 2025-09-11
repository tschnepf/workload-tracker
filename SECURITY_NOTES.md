# Security Notes — Phase 0

Date: 2025-09-06

Scope: Baseline repo hygiene and dependency patching.

- Secrets hygiene:
  - `.gitignore` added; `.env` removed from Git tracking (file preserved locally).
  - `.env.example` remains the source of truth for local setup; rotate real secrets in non-dev environments.

- Frontend updates:
  - `vite` pinned to `5.4.19` (from `5.4.8`).
  - `eslint` pinned to `9.35.0` (from `9.12.0`).
  - `serve` updated to `14.2.5` (from `14.2.3`).
  - `npm run build` succeeded after fixing a minor TS type for `authApi.createUser` to include `role`.
  - `npm audit` still reports moderate advisories related to Vite/Dev tooling; full remediation would require major upgrades (e.g., Vite 7, Vitest 3). Intentionally deferred to avoid breaking changes in Phase 0.

- Backend updates:
  - Django patched to `5.0.14` (from `5.0.1`), staying within the 5.0.x series.
  - DRF remains at `3.14.0` (latest in 3.14.x). SimpleJWT remains at `5.3.1` (latest in 5.3.x).
  - Sentry SDK upgraded to `1.45.1` (from `1.40.6`) to address env leak advisory; major `2.x` upgrade planned for a later phase.

- Python dependency audit:
  - Ran `docker compose exec backend sh -lc "pip install -q pip-audit && pip-audit -r requirements.txt --desc"`.
  - Remaining actionable items (consider in later phases):
    - `djangorestframework 3.14.0` → `3.15.2` (XSS fix)
    - `djangorestframework-simplejwt 5.3.1` → `5.5.1` (info disclosure fix)
    - `Django 5.0.14` → minor bump to `5.1.10` or `5.2.2` (log path escape)
    - `gunicorn 21.2.0` → `22.x/23.x` (request smuggling fixes)

Next security steps (future phases):
- Consider upgrading DRF and SimpleJWT minor versions after targeted QA.
- Add CI checks: `npm audit --production`, `pip-audit -r backend/requirements.txt` gated on non-breaking advisories.
- Harden Docker images and HTTP security headers as called for in later phases.

---

# Security Notes — Phase 2

Date: 2025-09-06

Scope: Security hardening (Django prod flags, CORS/CSRF alignment, cookie-based refresh feature flag, throttling, nginx headers + rate limiting, optional login protection, admin audit trail).

- Django hardening (prod only):
  - Enforced `SECURE_SSL_REDIRECT`, `SECURE_PROXY_SSL_HEADER`, HSTS (`SECURE_HSTS_SECONDS=31536000`, include subdomains, preload), `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`.
  - `CSRF_TRUSTED_ORIGINS` and `CORS_ALLOWED_ORIGINS` now configurable via env.
- Auth cookie feature flag:
  - Added `FEATURES['COOKIE_REFRESH_AUTH']` (env `COOKIE_REFRESH_AUTH=false` by default).
  - When enabled: refresh token set/rotated in httpOnly cookie; refresh removed from JSON payloads.
  - Added `/api/token/logout/` to clear cookie on logout.
  - Frontend updated to honor `VITE_COOKIE_REFRESH_AUTH` and avoid persisting refresh tokens.
- CORS/CSRF alignment:
  - `CORS_ALLOW_CREDENTIALS` toggles automatically with cookie refresh feature flag.
  - Recommend setting `CORS_ALLOWED_ORIGINS` explicitly per environment.
- Throttling:
  - Introduced `ScopedRateThrottle` globally; added `HotEndpointThrottle` on password/admin endpoints.
  - Rates configurable via env: `DRF_THROTTLE_HOT`, `DRF_THROTTLE_LOGIN`, etc.
- Nginx:
  - Added CSP, HSTS, COOP, CORP, and a conservative Permissions-Policy.
  - Introduced IP-based rate limiting for `/api/token/*` and `/api/auth/*`.
- Optional login protection:
  - Added `django-axes` (feature-flagged via `LOGIN_PROTECTION=false` by default).
- Admin audit trail:
  - New `AdminAuditLog` model with read-only `/api/auth/admin_audit/` endpoint for admins.

Validation to run:
- `docker compose exec backend python manage.py check --deploy`
- With cookie refresh OFF: header Bearer flow works as before.
- With cookie refresh ON: login/refresh/logout flows work via httpOnly cookie on dev HTTP (non-Secure) and Secure in prod.
