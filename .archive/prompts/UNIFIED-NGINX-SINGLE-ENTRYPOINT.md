# Unified Nginx Single Entrypoint + Cookie Refresh

Goal: Use a single reverse proxy (Nginx) as the only public entrypoint across environments, serve the SPA at `/`, proxy `/api/` to Django, and enable cookie-based refresh in production. The frontend calls `'/api'` (same-origin), containers communicate by service name on the Docker network, and no host/IPs are hardcoded in application code.

Below are prescriptive steps. Each step includes an “Agent Prompt” you can paste back into the AI agent to make the exact code/config changes and run the necessary commands.

---

## Step 0 — Backup and Baseline Validation

Outcome: Safeguard current production Nginx config and confirm the current stack state before changes.

Agent Prompt:

"""
Backup existing production site config:
- cp nginx/sites-available/workload-tracker.conf nginx/sites-available/workload-tracker.conf.bak

Baseline checks (optional but recommended):
- docker compose up -d
- curl -fsS http://localhost:8000/api/health/   # backend direct (default compose exposes 8000)
- curl -I http://localhost:3000/                # dev frontend direct (Vite)
"""

---

## Step 1 — Add Nginx to default compose (dev/staging), with a separate dev sites directory

Outcome: The default `docker-compose.yml` includes an `nginx` service that exposes port 80 and proxies to `frontend` (Vite dev server) and `backend`. Dev uses a dedicated sites directory to avoid loading the prod site simultaneously.

Agent Prompt:

"""
Prep and compose updates:
- Create a new directory `nginx/sites-available-dev/` (parallel to `nginx/sites-available/`).
- In `docker-compose.yml`, add an `nginx` service that:
  - Mounts `./nginx/nginx.conf` to `/etc/nginx/nginx.conf:ro`
  - Mounts `./nginx/sites-available-dev` to `/etc/nginx/sites-available:ro`
  - Publishes `80:80`
  - Depends on `backend` and `frontend`
  - Joins the existing `tracker-network`
  - Optionally mounts backend volumes: `static_volume:/var/www/static:ro`, `media_volume:/var/www/media:ro`

Do not remove existing services or ports. Place the new service after `frontend`.

Important: Do not modify `docker-compose.prod.yml` for this step — production already defines its own `nginx` service with production mounts and should remain unchanged.

Then write the dev site config file `nginx/sites-available-dev/workload-tracker.dev.conf` with the exact content below. Important:
- Do NOT define `limit_req_zone` here (it already exists in `nginx/nginx.conf`).
- Forward `Authorization` header for JWT.
- Limit only `/api/(token|auth)/` like prod; do not rate-limit all `/api/`.
- Proxy admin/static/media to backend during dev (Django serves them in DEBUG).

File: nginx/sites-available-dev/workload-tracker.dev.conf
---
upstream backend {
    server backend:8000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

upstream frontend_dev {
    server frontend:3000 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 80;
    server_name _;

    # Security headers (mirrors prod defaults)
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()" always;

    # Health shortcut
    location = /health {
        proxy_pass http://backend/api/health/;
        access_log off;
    }

    # Rate limit only auth endpoints (uses zone defined in nginx.conf)
    location ~ ^/api/(token|auth)/ {
        limit_req zone=auth_zone burst=20 nodelay;
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }

    # API -> Django backend (general)
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Authorization $http_authorization;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_connect_timeout 60s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
    }

    # Django admin -> backend
    location /admin/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static/media -> backend (dev convenience; Django serves in DEBUG)
    location /static/ {
        proxy_pass http://backend/static/;
        proxy_set_header Host $host;
    }
    location /media/ {
        proxy_pass http://backend/media/;
        proxy_set_header Host $host;
    }

    # Dev frontend -> Vite server (supports HMR)
    location / {
        proxy_pass http://frontend_dev;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Block hidden/unsafe files
    location ~ /\. { deny all; }
    location ~* \.(env|log|ini|conf|bak|swp|tmp)$ { deny all; }
}
---

After changes, run:
- docker compose up -d nginx
- docker compose exec nginx nginx -t
- curl -fsS http://localhost/health
- curl -I http://localhost/
"""

---

## Step 2 — Keep frontend API base same-origin

Outcome: The frontend always calls `'/api'` by default. No hostnames or IPs are baked into the app. This is already true in this repo; we validate and lock it in.

Agent Prompt:

"""
Verify the frontend uses same-origin API base:
- Confirm `frontend/src/api/client.ts` sets `const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'`.
- Confirm `frontend/src/utils/apiBase.ts` resolves relative paths to same origin.
- Confirm `docker-compose.prod.yml` builds the frontend with `VITE_API_URL=/api` build arg.

Do not remove the Vite dev proxy config; it is harmless when you access via Nginx on port 80. Ensure `VITE_API_URL` remains `/api` in dev and prod.
"""

---

## Step 3 — Align backend hosts/CORS for same-origin

Outcome: Backend allows the public domain(s)/IP via `ALLOWED_HOSTS`. Since traffic is same-origin through Nginx, CORS need not be permissive.

Agent Prompt:

"""
Update `.env` and/or deployment env to set:
- `DEBUG=false` for staging/prod
- `ALLOWED_HOSTS=<your.domain>,<alt.domain>,<public-ip>` (no spaces)

For cross-origin admin tools (if any) keep `CORS_ALLOWED_ORIGINS` minimal. Otherwise, rely on same-origin and omit.
If enabling cookie-based auth (next step) behind HTTPS, set:
- `CSRF_TRUSTED_ORIGINS=https://<your.domain>` (comma-separated if multiple)

Do not modify Django settings code—only environment variables.
"""

---

## Step 4 — Enable cookie-based refresh in production

Outcome: Refresh token is stored as an httpOnly cookie, rotated by the server, and never exposed to JS. Access token remains in memory. Works over HTTPS with Secure cookies.

Agent Prompt:

"""
Enable cookie-based refresh for production:
1) Backend env:
   - Set `COOKIE_REFRESH_AUTH=true`
   - Ensure `DEBUG=false` so refresh cookie is `Secure`
   - Set `CSRF_TRUSTED_ORIGINS=https://<your.domain>` (comma-separated for multiple)

2) Frontend prod build args (docker-compose.prod.yml -> frontend.build.args):
   - Add `VITE_COOKIE_REFRESH_AUTH: "true"`

3) Nginx TLS:
   - In `nginx/sites-available/workload-tracker.conf`, enable the HTTPS server block or add one with your certificates in `nginx/ssl/`.
   - Expose `443:443` in the Nginx service (already present in prod compose).

Do not change application logic. Rely on existing `accounts/token_views.py` to set/rotate the refresh cookie and remove it from JSON payloads in cookie mode.
"""

---

## Step 5 — Prod-like usage in non-prod environments

Outcome: When you need LAN/mobile access in non-prod, use the Nginx entrypoint, not port 3000.

Agent Prompt:

"""
Run the dev stack with Nginx as the entrypoint:
- Start services: `docker compose up -d`
- Access app at `http://<HOST_IP>/` instead of `http://<HOST_IP>:3000`
- Verify API: `curl -fsS http://<HOST_IP>/api/health/`

No code changes required. Ensure the new `nginx` service is running and listening on port 80.
"""

---

## Step 6 — Validation checklist

Outcome: Confidence that the unified entrypoint and cookie flow work across environments.

Agent Prompt:

"""
Validation commands:
- Backend reachable: `curl -i http://localhost/api/health/`
- App serves from Nginx: `curl -I http://localhost/`
- Optional (dev direct access): `curl -I http://localhost:3000/`
- Token obtain (dev without TLS): `curl -i -X POST http://localhost/api/token/ -H 'Content-Type: application/json' --data '{"username":"<u>","password":"<p>"}'`
- Token obtain (prod with TLS + cookie refresh on):
  - Expect `Set-Cookie: refresh_token=...; HttpOnly; Secure; Path=/api/token/`
  - Access token in JSON body; refresh NOT in JSON when cookie mode is enabled
- Token refresh (cookie mode): `curl -i -X POST https://<domain>/api/token/refresh/ -H 'Content-Type: application/json' --cookie "refresh_token=<value>"`
  - Expect a new access token; and if rotation enabled, cookie updated

Browser checks from another machine on the LAN:
- Navigate to `http://<HOST_IP>/` and log in
- Reload to confirm session persists via cookie refresh (if enabled)
"""

---

## Step 7 — Optional TLS setup notes

Outcome: HTTPS termination at Nginx with HSTS enabled (already configured when `DEBUG=false`).

Agent Prompt:

"""
Configure TLS certificates for Nginx:
- Place cert and key under `nginx/ssl/` (e.g., `fullchain.pem`, `privkey.pem`)
- In `nginx/sites-available/workload-tracker.conf`, enable the `server { listen 443 ssl http2; ... }` block and reference the certs
- Recreate Nginx: `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx`
- Verify: `curl -I https://<domain>/` and `curl -I https://<domain>/api/health/`
"""

---

## Notes and Rationale

- Same-origin through Nginx eliminates CORS and LAN/mobile inconsistencies.
- Docker service names (`backend`, `frontend`, `nginx`) provide portable intra-container DNS; no host IPs in app code.
- Cookie-based refresh is a security best practice: the refresh token never touches JS or localStorage.
- We do not remove or disable existing logic; we configure the environment and edge layer (Nginx) to provide a consistent, production-grade topology everywhere.
