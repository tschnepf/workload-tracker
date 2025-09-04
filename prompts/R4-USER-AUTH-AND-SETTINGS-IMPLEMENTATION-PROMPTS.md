# R4: User Accounts, JWT Auth, and Saved Settings - Implementation Prompts

Access token: 60 minutes. Refresh token: 30 days. Rotate refresh tokens on use and blacklist old ones.

Follow these prompts exactly. Implement proper, production-grade patterns only - no quick fixes or workarounds. Keep changes minimal and consistent with the existing stack (Django + DRF + SimpleJWT, React + Vite + TS).

---

## Prompt 0 - Preconditions and Context Capture

- Goal: Capture the current state needed to implement authentication and settings safely.
- Actions:
  - Read `backend/config/settings.py` and confirm DRF defaults, CORS, and that `rest_framework_simplejwt` is installed.
  - Read `backend/config/urls.py` to see how API routes are wired.
  - Search for any DRF views overriding permissions with `permission_classes = []` (e.g., `backend/people/views.py`) and list them.
  - Read `frontend/src/services/api.ts` to understand how requests are sent; note where to inject Authorization headers and 401 handling.
  - Confirm People model path: `backend/people/models.py` (for linking User -> Person).
- Acceptance:
  - Produce a brief note (to be included in PR description) with the files and lines that need changes.

---

## Prompt 1 - Configure SimpleJWT Lifetimes and Blacklist

- Goal: Enforce the chosen token policy globally.
- Edits (backend/config/settings.py):
  - Add `SIMPLE_JWT` configuration:
    - `ACCESS_TOKEN_LIFETIME = timedelta(minutes=60)`
    - `REFRESH_TOKEN_LIFETIME = timedelta(days=30)`
    - `ROTATE_REFRESH_TOKENS = True`
    - `BLACKLIST_AFTER_ROTATION = True`
    - `AUTH_HEADER_TYPES = ("Bearer",)`
  - Add `from datetime import timedelta` at top if missing.
  - Add `'rest_framework_simplejwt.token_blacklist'` to `THIRD_PARTY_APPS`.
  - Ensure throttling is active so scope-based throttles work:
    - `REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = ['rest_framework.throttling.AnonRateThrottle', 'rest_framework.throttling.UserRateThrottle']`
    - `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['login'] = '10/min'`
- Acceptance:
  - `python manage.py check` passes.
  - `python manage.py migrate` adds SimpleJWT blacklist tables.

---

## Prompt 2 - Add Token Endpoints to URLs

- Goal: Expose JWT obtain/refresh/verify endpoints with throttling.
- Edits (backend/config/urls.py):
  - Import throttled subclasses (see Prompt 2A) and wire them instead of the base views.
  - Add paths under `/api/`:
    - `path('api/token/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair')`
    - `path('api/token/refresh/', ThrottledTokenRefreshView.as_view(), name='token_refresh')`
    - `path('api/token/verify/', ThrottledTokenVerifyView.as_view(), name='token_verify')`
- Acceptance:
  - `curl -X POST /api/token/` returns tokens for a valid Django user.

---

## Prompt 2A - Throttled JWT Views

- Goal: Apply rate limiting to token endpoints and keep them unauthenticated.
- Actions:
  - Create subclasses in a new module, e.g., `backend/accounts/token_views.py`:
    - `ThrottledTokenObtainPairView` (subclass of `TokenObtainPairView`), set `throttle_scope = 'login'` and `permission_classes = [AllowAny]`.
    - `ThrottledTokenRefreshView` (subclass of `TokenRefreshView`), same.
    - `ThrottledTokenVerifyView` (subclass of `TokenVerifyView`), same.
  - Ensure settings from Prompt 1 are configured so throttles apply.
- Acceptance:
  - Repeated failed login attempts are throttled according to scope.

---

## Prompt 3 - Create `accounts` app and `UserProfile` model

- Goal: Store per-user app settings and optional link to `people.Person`.
- Actions:
  - Create `backend/accounts/` app with `apps.py`, `models.py`, `admin.py`, `serializers.py`, `views.py`, `urls.py`, `signals.py`, and `tests/` packages.
  - Add `'accounts'` to `LOCAL_APPS` in `backend/config/settings.py`.
- Model (backend/accounts/models.py):
  - `class UserProfile(models.Model)` with fields:
    - `user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='profile')`
    - `person = models.OneToOneField('people.Person', on_delete=models.SET_NULL, null=True, blank=True, related_name='user_profile')`
    - `settings = models.JSONField(default=dict, blank=True)`
    - `created_at = models.DateTimeField(auto_now_add=True)`; `updated_at = models.DateTimeField(auto_now=True)`
  - `__str__` returns `user.username`.
  - Meta: order by `-created_at`.
  - Imports: `from django.conf import settings` for `AUTH_USER_MODEL`.
- Signals (backend/accounts/signals.py):
  - On `User` post_save(create=True), create `UserProfile(user=user)` if not exists.
  - Connect in `apps.py.ready()`.
- Admin: register `UserProfile` with list display of `user`, `person`.
- Acceptance:
  - `python manage.py makemigrations accounts && python manage.py migrate` succeeds.
  - Creating a Django user auto-creates a `UserProfile`.

---

## Prompt 3A - Backfill Profiles for Existing Users

- Goal: Prevent 500s when calling `/api/auth/me` for users created before introducing profiles.
- Actions:
  - Create a data migration in `accounts` that iterates all users and ensures a `UserProfile` exists for each (use `get_or_create`). This migration is mandatory and must run before exposing `/api/auth/me`.
- Acceptance:
  - After migrating, all existing users have a corresponding `UserProfile`.

---

## Prompt 4 - Profile and Settings Serializers

- Goal: Serialize profile data safely and validate settings keys.
- Serializer (backend/accounts/serializers.py):
  - `UserProfileSerializer` exposing: `user` (id, username, email), `person` (id, name, department id), `settings` (dict).
  - Validate `settings` keys and support forward-compatible evolution:
    - Supported keys: `defaultDepartmentId: number|null`, `includeChildren: bool`, `theme: 'light'|'dark'|'system'`, optional `schemaVersion: number`.
    - Unknown keys: ignore and drop them from persisted settings (do not error) to allow non-breaking additions. Return sanitized settings in responses.
    - In development (`DEBUG=True`), log a warning listing any dropped unknown keys to surface client mistakes without breaking requests.
- Acceptance:
  - Unit tests verify valid payloads are persisted and unknown keys are safely ignored.

---

## Prompt 5 - Authenticated Profile Endpoints

- Goal: Provide minimal, secure endpoints for current user.
- Views (backend/accounts/views.py):
  - `@api_view(['GET'])` `me` -> returns `UserProfileSerializer(request.user.profile)`.
  - `@api_view(['PATCH'])` `settings` -> partial update of `profile.settings` using serializer validation; return updated profile.
  - `@api_view(['POST'])` `link_person` -> body `{ person_id: number|null }`:
    - If `null`, unlink.
    - If set, ensure target person isn't already linked and either matches user email (if both present) or user is staff/superuser. Email comparison must be case-insensitive and trimmed. If either side lacks an email, require staff/superuser.
    - Use `@transaction.atomic` on the link/unlink view to ensure all checks and writes complete atomically; on `IntegrityError` (OneToOne collision), return HTTP 409 with a clear message.
  - All endpoints require `IsAuthenticated` and can use DRF `UserRateThrottle` if appropriate.
- URLs (backend/accounts/urls.py):
  - Mount under `/api/auth/`: `me/`, `settings/`, `link_person/`.
  - Include in `backend/config/urls.py`.
- Acceptance:
  - Authenticated requests work; unauthenticated return 401.

---

## Prompt 6 - Enforce Auth Across Existing APIs

- Goal: Require authentication for all non-auth endpoints.
- Actions:
  - Remove any `permission_classes = []` overrides from API viewsets (e.g., `backend/people/views.py`, `backend/assignments/views.py`, others if found) so global `IsAuthenticated` applies.
  - Keep only `/api/token/*` and an optional `/health` endpoint unauthenticated.
  - For endpoints that set cache headers (e.g., people listing), when authentication is required, use `Cache-Control: private, max-age=30` instead of `public` to prevent shared cache leakage. Preserve existing ETag/Last-Modified semantics as appropriate.
- Acceptance:
  - Anonymous requests to `/api/people/` and similar return 401.

---

## Prompt 7 - Optional Health Endpoint (Unauthenticated)

- Goal: Provide a simple unauthenticated liveness check.
- Actions:
  - Add `config/urls.py` path `/health` returning 200 and `{ status: 'ok' }` via lightweight Django view or DRF APIView with `AllowAny`.
- Acceptance:
  - `GET /health` returns 200 without auth; all others require auth.

---

## Prompt 8 - Frontend: Auth Store

- Goal: Centralize auth state (tokens, user, settings) with safe persistence.
- Actions (frontend):
  - Create `src/store/auth.ts` (or `src/stores/auth.ts`) that maintains:
    - In-memory `accessToken`.
    - Persisted `refreshToken` (localStorage key `auth.refreshToken`).
    - `user` and `settings` from `/api/auth/me/`.
    - A boot "hydrating" state to avoid guard races during initialization.
    - Cross-tab synchronization: add a `window.addEventListener('storage', ...)` listener to detect token/state changes from other tabs and update or logout accordingly.
  - Methods: `login(usernameOrEmail, password)`, `logout()`, `loadFromStorage()`, `refreshAccessToken()`, `setSettings(partial)`.
  - On `login`:
    - Call `POST /api/token/` and store tokens; then fetch `/api/auth/me/`.
  - On `logout`:
    - Clear tokens and auth state; optionally call a blacklist endpoint if added (not required initially).
- Acceptance:
  - Refresh token survives reload; access token is reacquired as needed. Guards wait for hydration before redirecting.

---

## Prompt 9 - Frontend: Inject Authorization Header and 401 Handling

- Goal: Attach `Bearer` tokens to API calls and handle expiration robustly.
- Edits (frontend/src/services/api.ts):
  - Inject `Authorization: Bearer <accessToken>` header when present via a minimal token accessor to avoid circular imports. Create `src/utils/auth.ts` with:
    - `export function getAccessToken(): string | null`
  - On 401:
    - Implement a single-flight refresh mechanism with a module-level `let refreshPromise: Promise<string> | null = null;` to ensure concurrent 401s trigger only one refresh. Reuse the same `refreshPromise` for all pending requests and clear it on settle.
    - Retry the original request once on successful refresh; if still 401 or refresh fails, logout and surface a clear error.
    - Network-resilience: add a minimal retry/backoff on refresh (e.g., one retry with short delay) and report offline state if network unavailable.
  - Preemptive refresh: if access token expires in <2 minutes (track `exp`), refresh before making requests. Use a safe decoder like `jwt-decode` or a minimal Base64 parse to read `exp` (never execute payloads). Validate decoded payload fields (`exp` is a finite number, not in distant past/future) and handle invalid/missing gracefully by forcing re-auth.
- Acceptance:
  - Expired access token triggers transparent refresh and retry exactly once.

---

## Prompt 10 - Frontend: Login Page and Route Guard

- Goal: Add a minimal, accessible login experience and gate app routes.
- Actions:
  - Create `src/pages/Auth/Login.tsx` with username/email + password form, validation, and error handling.
  - Add route `/login` and a private route guard that redirects to `/login` when not authenticated.
  - Ensure the guard waits for the auth store hydration state before deciding (to avoid redirect loops on boot).
  - After successful login, redirect to the originally requested path or `/`.
- Acceptance:
  - Navigating to any app page while logged out redirects to `/login` after hydration completes.

---

## Prompt 11 - Frontend: Settings Integration (Department Filter + Theme)

- Goal: Load server settings and apply them consistently.
- Actions:
  - On login and app boot (if refresh token present), call `/api/auth/me/` and hydrate `auth.settings`.
  - Department filter: maintain URL precedence for all users to keep shareable links authoritative. Use server settings only as fallback when the URL lacks values. Recommended order: URL -> server settings -> localStorage -> safe defaults.
  - Theme: add a simple theme controller that applies `light`/`dark`/`system` to document root. Persist changes by `PATCH /api/auth/settings/`.
  - Add a "User Settings" UI (profile dropdown or `/settings`) where users can:
    - Set default department (reuse existing picker).
    - Toggle include-children.
    - Choose theme.
- Acceptance:
  - Changing settings persists server-side and survives reload across devices.

---

## Prompt 12 - Frontend: Link Account to Person

- Goal: Allow a user to optionally link their account to a Person record.
- Actions:
  - In the settings UI, add a Person selector using `peopleApi.getForAutocomplete()`.
  - If the dataset is large or expected to grow, implement server-side search now (e.g., `/api/people/search/?q=...`) and use it for the selector; otherwise, keep the autocomplete improvement in Prompt 18.
  - On save, call `POST /api/auth/link_person/` with `person_id` or `null` to unlink.
  - Handle errors for already-linked Person and email mismatch.
- Acceptance:
  - Linking/unlinking updates `/api/auth/me/` response and is enforced server-side.

---

## Prompt 13 - Permissions and Security Review

- Goal: Ensure all endpoints except token and health are protected.
- Actions:
  - Verify removal of any `permission_classes = []` overrides; rely on default `IsAuthenticated` from DRF settings.
  - Confirm CORS allowlist is minimal and HTTPS is used in production.
  - Confirm SECRET_KEY is not default in non-dev.
  - Ensure CORS allows the `Authorization` header (default with `django-cors-headers`), and that only trusted origins are configured.
- Acceptance:
  - Anonymous requests (except `/api/token/*` and `/health`) return 401.

---

## Prompt 14 - Tests (Backend)

- Goal: Add essential API tests for auth and settings.
- Actions (pytest or Django TestCase):
  - Token obtain/refresh/verify happy path and throttle edge.
  - `me`, `settings` (valid payloads + unknown key drop), `link_person` (link, unlink, already linked, email mismatch, staff override; transaction collision -> 409).
  - Permission checks: anonymous 401; authenticated 200.
  - Update existing API tests (e.g., people/assignments) to authenticate: obtain a token and set the `Authorization` header or use DRF's `force_authenticate` in view tests.
  - Edge cases: token expiry during an in-flight request (ensures single-flight refresh and retry), concurrent refresh attempts, and storage corruption (missing/invalid refresh token) handling.
- Acceptance:
  - Tests pass locally and in CI.

---

## Prompt 15 - Smoke Tests (Frontend)

- Goal: Validate critical flows manually or with lightweight tests.
- Actions:
  - Login with valid credentials; verify token storage and `/auth/me` fetch.
  - Navigate to protected routes; verify guard behavior after hydration.
  - Change settings; verify persistence and immediate effect (dept filter and theme).
  - Trigger access token expiry to validate single-flight refresh and retry.
  - Link to a Person; verify server response and UI update.
- Acceptance:
  - All flows behave as expected without console errors.

---

## Prompt 16 - Documentation

- Goal: Update project docs for auth.
- Actions (README.md):
  - Add "Authentication" section with token policy (access 60m, refresh 30d, rotation+blacklist), login endpoints, and local dev notes.
  - Document settings keys and linking behavior.
  - Note how to create users via Django admin for now.
  - Document URL vs server vs local precedence for department defaults.
- Acceptance:
  - README reflects the implemented behavior and endpoints.

---

## Prompt 17 - Deployment Checklist

- Goal: Avoid production misconfigurations and enable safe rollout.
- Actions:
  - Set `SECRET_KEY`, disable `DEBUG`, restrict `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`.
  - Run migrations (including SimpleJWT blacklist, accounts app, profile backfill data migration).
  - Ensure HTTPS and secure cookie settings at the proxy level.
  - Optional: introduce an `AUTH_ENFORCED` env flag to stage the switch to `IsAuthenticated` if frontend and backend cannot deploy in lockstep; otherwise flip immediately.
  - Add a `create_dev_user` management command for local development (e.g., username/password args) to simplify setup.
  - Add basic monitoring/logging for auth: failed login attempts (rate spikes), token refresh failures, and suspicious activity patterns.
- Acceptance:
  - App starts with migrations applied; login works in production environment.

---

## Prompt 18 - Post-Phase Tightening (Optional Follow-ups)

- Goal: Future hardening without changing contracts.
- Ideas:
  - Move refresh token to httpOnly SameSite=Strict cookie; keep access token in memory.
  - Add blacklist endpoint on logout.
  - Add SSO (e.g., SAML/OIDC) while keeping `UserProfile` and settings contract intact.
  - Optimize People autocomplete: add a server-side search endpoint to avoid fetching the entire list as the dataset grows.

