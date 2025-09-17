# TODO — TLS Enablement and Redirects

Context: We unified on Nginx as the single entrypoint. In HTTP on a non-localhost IP, browsers flag COOP as untrustworthy (warning only). To eliminate that and validate cookie-based auth under Secure cookies, enable HTTPS.

Decide between:

1) Dev TLS with self-signed cert (prove COOP warning goes away)
   - Generate self-signed certs (valid for 365 days):
     - openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout nginx/ssl/privkey.pem -out nginx/ssl/fullchain.pem -subj "/CN=dev.local"
   - Use the production site’s HTTPS server block (already added in `nginx/sites-available/workload-tracker.conf`).
   - Bring up Nginx with the prod compose so it mounts `nginx/sites-available/` and `nginx/ssl/`:
     - docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx
     - docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -t
   - Visit https://<host>/ (browser will warn about untrusted cert; proceed to test). COOP warning should disappear.
   - Notes:
     - If the prod frontend health check blocks startup in dev, either set `frontend.healthcheck.test` to a simple TCP check temporarily, or test HTTPS using only the nginx service with static mounts.

2) Production TLS with real certs + HTTP→HTTPS redirect (permanent)
   - Place real certs in `nginx/ssl/fullchain.pem` and `nginx/ssl/privkey.pem`.
   - In backend env, set:
     - `DEBUG=false`
     - `ALLOWED_HOSTS=<your.domain>,<alt>` (no spaces)
     - `CSRF_TRUSTED_ORIGINS=https://<your.domain>[,https://alt]`
     - `COOKIE_REFRESH_AUTH=true`
   - Enable strict redirect on port 80 (preserving `/health` if needed). Example server block for HTTP:
     - server {
         listen 80;
         server_name _;
         location = /health { proxy_pass http://backend/api/health/; access_log off; }
         location / { return 301 https://$host$request_uri; }
       }
   - Bring up production stack and verify:
     - docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx
     - curl -I https://<domain>/
     - curl -I https://<domain>/api/health/
     - Login at https://<domain>/ and confirm Set-Cookie for refresh is HttpOnly; Secure; Path=/api/token/

References
- Prod site with HTTPS block: `nginx/sites-available/workload-tracker.conf`
- Dev site (HTTP proxy to Vite): `nginx/sites-available-dev/workload-tracker.dev.conf`
- Compose files:
  - `docker-compose.yml` (dev; mounts sites-available-dev)
  - `docker-compose.prod.yml` (prod; mounts sites-available)

