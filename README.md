## Ubuntu Deployment (Recommended)

This runbook is for an IT administrator deploying Workload Tracker on a single Ubuntu server.  
It is written for operations use, not software development. You do not need to modify application code.

### Deployment model (what will run)
- `frontend`: User-facing web interface.
- `backend`: Main API/application service.
- `db`: PostgreSQL database.
- `redis`: Queue/cache service.
- `worker`, `worker_db`, `worker_beat`: Background jobs and scheduled tasks.
- Optional `nginx` profile for reverse proxy and TLS termination.

### 1. Prepare the Ubuntu host
Recommended OS: Ubuntu Server `22.04 LTS` or `24.04 LTS`.

1. Update packages:
```bash
sudo apt update && sudo apt upgrade -y
```
2. Install Docker Engine and Docker Compose plugin:
```bash
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
```
3. (Optional) Allow your admin user to run Docker without `sudo`:
```bash
sudo usermod -aG docker $USER
```
After this command, sign out/in once so the group change applies.

### 2. Place the application files on the server
Use your standard IT process (Git, artifact copy, or backup restore). If you are using Git, this is the recommended sequence:

```bash
sudo mkdir -p /opt/workload-tracker
sudo chown -R $USER:$USER /opt/workload-tracker
cd /opt/workload-tracker
git clone https://github.com/tschnepf/workload-tracker.git
cd workload-tracker
```

If your organization provides a release artifact instead of Git access, extract it into `/opt/workload-tracker` and run the remaining steps from that project root directory.

### 3. Create production environment file
From the project root:
```bash
cp .env.production.template .env
```

Open `.env` in your editor and set production values (domain, credentials, and secrets).  
Minimum required values for a secure deployment:
- `DEBUG=false`
- `ALLOWED_HOSTS=<your domain(s)>`
- `SECRET_KEY=<strong random value>`
- `POSTGRES_PASSWORD=<strong random value>`
- `REDIS_PASSWORD=<strong random value>`
- `CSRF_TRUSTED_ORIGINS=https://<your-domain>`
- `CORS_ALLOWED_ORIGINS=https://<your-domain>`
- `RESTORE_JOB_TOKEN_SECRET=<strong random value>`

### 4. Generate strong secrets
Run on the Ubuntu host:

```bash
openssl rand -base64 48   # SECRET_KEY
openssl rand -hex 32      # RESTORE_JOB_TOKEN_SECRET
openssl rand -hex 24      # DB/Redis passwords
```

### 5. Deploy the production stack
From the project root:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.no-host-db-ports.yml \
  up -d --build
```

If you want the built-in Nginx reverse proxy from this repository:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.no-host-db-ports.yml \
  --profile proxy \
  up -d --build
```

### 6. Validate service health
Check container state:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml ps
```

Review startup logs (especially migrations and backend):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml logs -f migrator backend
```

Health checks:
- Internal: `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml exec backend curl -fsS http://localhost:8000/api/health/`
- External: `curl -i https://<your-domain>/api/health/`

### 7. Day-2 operations (routine maintenance)
- Restart services: `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml restart`
- Pull and redeploy updates:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml up -d
```
- Check status after updates: `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml ps`

### 8. Optional: Dockage (Dockge) and File Browser
These tools are recommended for IT operations teams who want a web UI for container and file management:
- `Dockge` (often pronounced "Dockage") for Docker Compose stack management.
- `File Browser` for secure web-based file access (for example, backups and attachments).

Security recommendation: keep both tools on an internal admin network or behind VPN/SSO. Do not expose them directly to the public internet.

1. Create operations directories:
```bash
sudo mkdir -p /opt/ops-tools/dockge
sudo mkdir -p /opt/ops-tools/stacks
sudo mkdir -p /opt/ops-tools/filebrowser/database
sudo mkdir -p /opt/ops-tools/filebrowser/config
sudo chown -R $USER:$USER /opt/ops-tools
```

2. Deploy Dockge (Docker Compose manager):
```bash
cd /opt/ops-tools/dockge
curl -fsSL https://raw.githubusercontent.com/louislam/dockge/master/compose.yaml -o compose.yaml
docker compose up -d
```
Dockge default URL: `http://<ubuntu-server-ip>:5001`

3. Deploy File Browser:
```bash
cd /opt/ops-tools/filebrowser
cat > compose.yaml <<'YAML'
services:
  filebrowser:
    image: filebrowser/filebrowser:s6
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - /opt/workload-tracker:/srv/workload-tracker
      - /opt/ops-tools/filebrowser/database:/database
      - /opt/ops-tools/filebrowser/config:/config
YAML
docker compose up -d
```
File Browser URL: `http://<ubuntu-server-ip>:8080`

4. First login and hardening:
- Retrieve first-run admin password from logs: `docker compose -f /opt/ops-tools/filebrowser/compose.yaml logs --tail=100 filebrowser`
- Change admin password immediately after first login.
- If you use Ubuntu UFW, allow admin access only from trusted IP ranges.

5. Basic operations commands:
- Update Dockge: `cd /opt/ops-tools/dockge && docker compose pull && docker compose up -d`
- Update File Browser: `cd /opt/ops-tools/filebrowser && docker compose pull && docker compose up -d`

### 9. Network and security checklist
- DNS for your domain points to this Ubuntu host.
- Ports `80`/`443` are allowed through firewall/security group.
- SSH access is restricted to trusted admin sources.
- `.env` is backed up securely and not committed to source control.
- TLS certificates are managed (either by repo `nginx` setup or your external reverse proxy).

## Unraid Deployment

This runbook is for IT administrators deploying Workload Tracker on Unraid.  
It is focused on operations and configuration, not software development.

### Deployment model on Unraid
- `frontend`: User web application (`:3000` on host).
- `backend`: API/application service (`:8000` on host).
- `db`: PostgreSQL database.
- `pgbouncer`: PostgreSQL connection pooler used by backend and workers.
- `redis`: Queue/cache service.
- `worker`, `worker_db`, `worker_beat`: Background and scheduled jobs.
- Reverse proxy/TLS is normally handled by your Unraid proxy app (for example SWAG or NPM).

### 1. Prerequisites on Unraid
- Unraid array is started.
- Docker service is enabled.
- Compose Manager plugin is installed and working.
- DNS for your domain points to the Unraid host.
- A reverse proxy (SWAG/NPM/etc.) is available for HTTPS.
- If using Vault workflow: `vault` CLI and `jq` installed on the host.

### 2. Create application folders
From the Unraid terminal:

```bash
mkdir -p /mnt/user/appdata/workload-tracker
mkdir -p /mnt/user/appdata/workload-tracker/backups
```

### 3. Place project files on Unraid
If you use Git:

```bash
cd /mnt/user/appdata/workload-tracker
git clone https://github.com/tschnepf/workload-tracker.git .
```

If your organization provides a release artifact, extract it into `/mnt/user/appdata/workload-tracker`.

### 4. Create the Unraid environment file
This stack expects the env file at:

`/boot/config/plugins/compose.manager/projects/workload-tracker/.env`

Create it from the provided template:

```bash
mkdir -p /boot/config/plugins/compose.manager/projects/workload-tracker
cp /mnt/user/appdata/workload-tracker/unraid/.env.unraid.example \
  /boot/config/plugins/compose.manager/projects/workload-tracker/.env
```

### 4.1 Choose a secrets workflow (new deployments)
This repository's compose files expect a runtime `.env` file for container `env_file` loading.
If you want secret isolation, keep separate source files and generate `.env` before deploy.

Option A: Single `.env` (simplest)
- Keep everything in `/boot/config/plugins/compose.manager/projects/workload-tracker/.env`
- Restrict permissions:

```bash
chmod 600 /boot/config/plugins/compose.manager/projects/workload-tracker/.env
```

Option B: Split `.env.base` + `.env.secrets` (recommended without external services)
1. Create source files:

```bash
cp /mnt/user/appdata/workload-tracker/unraid/.env.unraid.example \
  /boot/config/plugins/compose.manager/projects/workload-tracker/.env.base

cp /mnt/user/appdata/workload-tracker/.env.secrets.example \
  /boot/config/plugins/compose.manager/projects/workload-tracker/.env.secrets
```

2. Edit `.env.base` for non-secret values and `.env.secrets` for credentials.
3. Generate runtime `.env` used by compose:

```bash
cat /boot/config/plugins/compose.manager/projects/workload-tracker/.env.base \
    /boot/config/plugins/compose.manager/projects/workload-tracker/.env.secrets \
  > /boot/config/plugins/compose.manager/projects/workload-tracker/.env
chmod 600 /boot/config/plugins/compose.manager/projects/workload-tracker/.env*
```

4. Re-run the `cat ... > .env` command after any base/secret change.

Option C: HashiCorp Vault + generated `.env.secrets` (no external SaaS)
1. Deploy Vault (single-node is acceptable for small environments; use HA for critical production).
2. Initialize and unseal Vault, then log in with an admin token:

```bash
export VAULT_ADDR=http://<vault-host>:8200
vault operator init
vault operator unseal <unseal-key-1>
vault operator unseal <unseal-key-2>
vault operator unseal <unseal-key-3>
vault login <initial-root-token>
```

3. Enable KV v2 and write workload secrets:

```bash
vault secrets enable -path=workload-tracker kv-v2
vault kv put workload-tracker/prod \
  SECRET_KEY='<value>' \
  POSTGRES_PASSWORD='<value>' \
  REDIS_PASSWORD='<value>' \
  RESTORE_JOB_TOKEN_SECRET='<value>' \
  EMAIL_HOST_USER='<value>' \
  EMAIL_HOST_PASSWORD='<value>' \
  SENTRY_DSN='<value>'
```

4. Create a read-only policy and AppRole for deployments:

```bash
cat > /tmp/workload-tracker-read.hcl <<'EOF'
path "workload-tracker/data/prod" {
  capabilities = ["read"]
}
EOF

vault policy write workload-tracker-read /tmp/workload-tracker-read.hcl
vault auth enable approle
vault write auth/approle/role/workload-tracker \
  token_policies="workload-tracker-read" \
  token_ttl=1h \
  token_max_ttl=4h

vault read -field=role_id auth/approle/role/workload-tracker/role-id
vault write -f -field=secret_id auth/approle/role/workload-tracker/secret-id
```

5. On the Unraid host, use AppRole to fetch secrets into `.env.secrets`, then generate runtime `.env`:

```bash
export VAULT_ADDR=http://<vault-host>:8200
export ROLE_ID=<role-id>
export SECRET_ID=<secret-id>

export VAULT_TOKEN="$(vault write -field=token auth/approle/login role_id=\"$ROLE_ID\" secret_id=\"$SECRET_ID\")"

vault kv get -format=json workload-tracker/prod \
  | jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"' \
  > /boot/config/plugins/compose.manager/projects/workload-tracker/.env.secrets

cat /boot/config/plugins/compose.manager/projects/workload-tracker/.env.base \
    /boot/config/plugins/compose.manager/projects/workload-tracker/.env.secrets \
  > /boot/config/plugins/compose.manager/projects/workload-tracker/.env
chmod 600 /boot/config/plugins/compose.manager/projects/workload-tracker/.env*
```

6. Redeploy after secret updates:
- Regenerate `.env` from `.env.base` + `.env.secrets`
- Run `docker compose ... up -d`

### 5. Configure required values in `.env` (or `.env.base` + `.env.secrets`)
Edit:

`/boot/config/plugins/compose.manager/projects/workload-tracker/.env`

Set at minimum:
- `SECRET_KEY`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `RESTORE_JOB_TOKEN_SECRET`
- `PGBOUNCER_AUTH_TYPE=scram-sha-256`
- `ALLOWED_HOSTS=smc-projects.com,www.smc-projects.com`
- `CSRF_TRUSTED_ORIGINS=https://smc-projects.com,https://www.smc-projects.com`
- `COOKIE_REFRESH_AUTH=true`
- `SECURE_SSL_REDIRECT=true`
- `PWA_ENABLED=true` (installable app shell)
- `WEB_PUSH_ENABLED=true` only after setting `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`

Notes:
- Service workers and web push require HTTPS in production.
- Keep `WEB_PUSH_TEST_STAFF_ONLY=true` to restrict `/api/auth/push/test/` to staff/superusers.

### 6. Generate strong secrets
Run these on the Unraid host and paste values into your source env file(s):

```bash
openssl rand -base64 48   # SECRET_KEY
openssl rand -hex 24      # POSTGRES_PASSWORD / REDIS_PASSWORD
openssl rand -hex 32      # RESTORE_JOB_TOKEN_SECRET
```

### 7. Deploy with Unraid Compose Manager
In the Unraid web UI:
1. Open `Docker` -> `Compose`.
2. Create project name: `workload-tracker`.
3. Set compose file path to:
   `/mnt/user/appdata/workload-tracker/docker-compose.unraid.yml`
4. Set env file path to:
   `/boot/config/plugins/compose.manager/projects/workload-tracker/.env`
5. Start/Deploy the project.

CLI equivalent:

```bash
docker compose \
  -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml \
  --env-file /boot/config/plugins/compose.manager/projects/workload-tracker/.env \
  up -d --build
```

### 7.1 Create the initial admin user
After the stack is up, create your first admin account from the backend container:

```bash
docker compose \
  -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml \
  exec backend \
  python manage.py createsuperuser --username admin --email admin@smc-projects.com
```

You will be prompted to enter a password.

If the admin user already exists and you need to reset the password:

```bash
docker compose \
  -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml \
  exec backend \
  python manage.py changepassword admin
```

### 7.2 PgBouncer setup and verification
`docker-compose.unraid.yml` includes PgBouncer by default. App services connect to Postgres through PgBouncer for better burst handling.

How this stack is wired:
- `backend`, `worker`, `worker_db`, `worker_beat` use `DATABASE_URL=...@pgbouncer:6432/...`
- Maintenance operations still use direct DB via `DB_ADMIN_URL=...@db:5432/...`
- Reverse proxy still routes to backend (`:8000`) and frontend (`:3000`) only.

Recommended PgBouncer env keys in `/boot/config/plugins/compose.manager/projects/workload-tracker/.env`:
- `PGBOUNCER_AUTH_TYPE=scram-sha-256`
- `PGBOUNCER_PORT=6432`
- `PGBOUNCER_POOL_MODE=transaction`
- `PGBOUNCER_MAX_CLIENT_CONN=1500`
- `PGBOUNCER_DEFAULT_POOL_SIZE=60`
- `PGBOUNCER_RESERVE_POOL_SIZE=20`
- `PGBOUNCER_MAX_DB_CONNECTIONS=120`

After changing PgBouncer or DB auth settings, recreate services:

```bash
docker compose -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml \
  up -d --force-recreate pgbouncer backend worker worker_db worker_beat
```

Verify pooler and backend startup:

```bash
docker compose -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml logs --tail=150 pgbouncer backend
```

### 8. Configure reverse proxy and TLS
For public access at `https://smc-projects.com`:
- Route `/api` to `http://<unraid-ip>:8000`.
- Route `/` to `http://<unraid-ip>:3000`.
- Enable TLS certificate for `smc-projects.com` and `www.smc-projects.com`.
- Preserve headers required for HTTPS-aware apps (`Host`, `X-Forwarded-Proto`).

### 9. Validate deployment
Check stack status:

```bash
docker compose -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml ps
```

Review logs:

```bash
docker compose -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml logs -f pgbouncer backend worker
```

Health checks:
- Internal: `curl -fsS http://<unraid-ip>:8000/api/health/`
- External: `curl -i https://smc-projects.com/api/health/`

### 10. Routine operations
- Restart: `docker compose -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml restart`
- Rebuild/redeploy after updates:
```bash
docker compose -f /mnt/user/appdata/workload-tracker/docker-compose.unraid.yml up -d --build
```
- Backup data in: `/mnt/user/appdata/workload-tracker/backups`

### 11. Common issues
- Backend cannot start: verify `.env` path and required secrets.
- CORS/CSRF errors: verify `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` exactly match your HTTPS domains.
- Browser login/session issues: verify proxy forwards HTTPS correctly and `COOKIE_REFRESH_AUTH=true`.
- PgBouncer error `wrong password type`:
  - Set `PGBOUNCER_AUTH_TYPE=scram-sha-256` and recreate `pgbouncer` + app services.
- PgBouncer startup error with malformed host/port in generated config:
  - Ensure you are using the current `docker-compose.unraid.yml` from this repo (PgBouncer uses `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`).
  - Remove old overrides that set PgBouncer `DATABASE_URL`.


## Deployment

Use this section to install and deploy the production stack with Docker Compose.

### 1. Prerequisites
- Docker Engine + Docker Compose plugin installed on the host.
- DNS for your domain pointed to the host.
- TLS terminated either by this stack (`nginx` profile) or an external reverse proxy.
- If using Vault workflow: `vault` CLI and `jq` installed on the deployment host.

### 2. Create production `.env`
```bash
cp .env.production.template .env
```

Edit `.env` and replace all `CHANGE_ME_*` values.

### 2.1 Optional secret isolation patterns
For new deployments, you can choose one of these patterns:

Option A: Single `.env`
- Keep all values in `.env` (simplest).
- Set file permissions: `chmod 600 .env`

Option B: `.env.base` + `.env.secrets` (no external services)
1. Create split source files:

```bash
cp .env.production.template .env.base
cp .env.secrets.example .env.secrets
```

2. Put non-secrets in `.env.base` and secrets in `.env.secrets`.
3. Generate runtime `.env` before each deploy:

```bash
cat .env.base .env.secrets > .env
chmod 600 .env .env.base .env.secrets
```

Option C: HashiCorp Vault + generated `.env.secrets`
- Store secrets in Vault KV v2 and materialize `.env.secrets` at deploy time.
- Minimum flow:
  1. `vault kv put workload-tracker/prod ...`
  2. Authenticate deploy host using AppRole.
  3. Render `.env.secrets`:

```bash
vault kv get -format=json workload-tracker/prod \
  | jq -r '.data.data | to_entries[] | "\(.key)=\(.value)"' > .env.secrets
cat .env.base .env.secrets > .env
chmod 600 .env .env.base .env.secrets
```

Operational note:
- Compose interpolation and service `env_file` in this repo rely on the runtime `.env`.
- If you split files, always regenerate `.env` before `docker compose up`.

### 3. Generate required secrets
Generate strong random values on the deployment host:

```bash
# Django app secret
openssl rand -base64 48

# Restore job token signing secret (required when JOB_RESTORE_TOKEN_MODE=true)
openssl rand -hex 32

# Recommended strong DB/Redis passwords
openssl rand -hex 24
```

Set the generated values in `.env`:
- `SECRET_KEY=<random value>`
- `RESTORE_JOB_TOKEN_SECRET=<random value>`
- `POSTGRES_PASSWORD=<random value>`
- `REDIS_PASSWORD=<random value>`

### 4. Required production variables
These variables must be set correctly when `DEBUG=false`:

- `DEBUG=false`
- `ALLOWED_HOSTS=smc-projects.com,www.smc-projects.com`
- `SECRET_KEY=<non-default secret>`
- `COOKIE_REFRESH_AUTH=true` (if enabled, CORS credentials are enabled)
- `CORS_ALLOWED_ORIGINS=https://smc-projects.com,https://www.smc-projects.com`
- `CSRF_TRUSTED_ORIGINS=https://smc-projects.com,https://www.smc-projects.com`
- `OAUTH_POPUP_ALLOWED_ORIGINS=https://smc-projects.com,https://www.smc-projects.com`
- `JOB_RESTORE_TOKEN_MODE=true`
- `RESTORE_JOB_TOKEN_SECRET=<non-default secret>`
- `RESTORE_JOB_TOKEN_TTL_SECONDS=300` (must be `1` to `900`)

Database configuration (pick one approach):
- `DATABASE_URL=postgresql://...` (managed DB), or
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`.

### 5. Deploy the stack
Build and start production services:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.no-host-db-ports.yml \
  up -d --build
```

If you want the bundled nginx reverse proxy in this repo, include the profile:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.no-host-db-ports.yml \
  --profile proxy \
  up -d --build
```

### 6. Validate startup
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml logs -f migrator backend
```

Health checks:
- Internal: `docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.no-host-db-ports.yml exec backend curl -fsS http://localhost:8000/api/health/`
- External: `curl -i https://smc-projects.com/api/health/`

### 7. Common startup failures
- `CORS_ALLOWED_ORIGINS must be explicitly configured...`
  - Set `CORS_ALLOWED_ORIGINS` to your exact HTTPS origins (comma-separated, no paths).
- `RESTORE_JOB_TOKEN_SECRET must be set to a non-default value...`
  - Generate a new random value and set `RESTORE_JOB_TOKEN_SECRET`.
- `CSRF_TRUSTED_ORIGINS must be explicitly configured...`
  - Set exact HTTPS origins in `CSRF_TRUSTED_ORIGINS`.

Workload Tracker — User Guide

Getting Started
- Sign in at the login screen with your account.
- If you forget your password, use “Forgot password?” to receive a reset link.
- After signing in, you will land on “My Work” or the Team Dashboard depending on your settings.


Navigation Overview
- My Work: Your personal overview — assignments, milestones, and schedule.
- Dashboard: Organization‑wide snapshot of workload and upcoming items.
- Assignments: Spreadsheet‑style planning by person. Add and adjust weekly hours.
- Project Assignments: Planning by project. See who is assigned and when.
- Projects: Create, edit, and manage projects and their milestones.
- People: Browse the team, filter by department/location, and make updates.
- Departments: Manage departments, view manager tools, and see the org chart.
- Deliverables Calendar: Week‑by‑week timeline of upcoming milestones.
- Reports: Role capacity, team forecast, and personal experience insights.
- Settings: System and admin tools such as roles, backups, and calendar feeds.
- Profile: Update your name, password, and color theme.


Page‑by‑Page Guide

**My Work**
- Purpose: Shows your projects, milestones, and schedule.
- What you’ll see:
  - Summary of items that need attention (for example, overdue milestones).
  - Your projects list and upcoming milestones.
  - A compact calendar with your upcoming work.
  - A weekly schedule strip showing capacity versus planned hours.
- Tips:
  - If your account isn’t linked to your person profile yet, you’ll see a note to contact an administrator.

**Dashboard**
- Purpose: A team‑level overview for quick health checks and planning.
- What you’ll see:
  - Headline metrics: assignments, project mix, and utilization summaries.
  - Visual cards for hours by client, weekly trends, and role capacity.
  - A heatmap to spot busy and quiet weeks across the team.
- Tips:
  - Use the department selector to focus on a specific group.
  - Adjust the weeks shown to widen or narrow the planning window.

**Assignments (Grid)**
- Purpose: Plan weekly hours in a familiar, spreadsheet‑like view per person.
- What you’ll see:
  - Left column: people grouped by department.
  - Columns by week with each person’s planned hours per project.
  - A floating legend that explains milestone markers and colors.
- Common actions:
  - Add assignment: Use the “Add project” row under a person to attach a project.
  - Edit hours: Click a week cell and type the hours for that week.
  - Change role: Open the role menu on a row to assign a role for that project.
  - Filter: Use the top‑bar department and status filters to narrow the view.
- Tips:
  - The header “Weeks” selector adjusts how far ahead you plan.
  - Markers show upcoming project milestones to help you place hours.

**Project Assignments (Grid)**
- Purpose: See planning by project rather than by person.
- What you’ll see:
  - Projects in rows, weeks in columns, similar to the people‑oriented grid.
  - A quick view on project names to peek at details without leaving the page.
- Common actions:
  - Sort by client, project, or milestones to focus your work.
  - Edit weekly hours in the grid where appropriate.
- Tips:
  - Use the status chips to hide projects you don’t need to see.

**Projects (List)**
- Purpose: Manage the list of projects.
- What you’ll see:
  - Search, sort, and quick filters (including upcoming/previous milestones).
  - A details panel for the selected project (assignments and notes).
- Common actions:
  - Create: “New Project” opens the form to add a project.
  - Update status: Use the status badge dropdown (for example, Active, On Hold).
  - Inline staffing: From the project details, add people to the project.

**Project Form (Create/Edit)**
- Purpose: Add a new project or update an existing one.
- What to fill in:
  - Project name and client (required), project number (optional), description, and start date.
  - Pre‑deliverable rules for the project (for example, when to create design reviews ahead of the main milestone) if your organization uses them.
- Tips:
  - You can return later to refine details such as hours and pre‑deliverable rules.

**People**
- Purpose: Browse and manage the team.
- What you’ll see:
  - Left panel: a searchable list with department/location filters.
  - Right panel: details for the selected person — including skills.
- Common actions:
  - Edit basic details and role for a person.
  - Use bulk actions to assign people to a department in one step.
  - Load more results as you scroll when the list is long.

**Departments (List)**
- Purpose: Create and maintain departments.
- What you’ll see:
  - A searchable list of departments.
  - A details panel with manager, description, and team statistics.
- Common actions:
  - Add, rename, or remove departments.
  - Pick a department to see its people and related information.

**Manager Dashboard (Departments)**
- Purpose: A focused view for department leaders.
- What you’ll see:
  - Team size, average utilization, and items that need attention.
  - Quick period buttons (1, 2, 4, 8 weeks) to change the summary window.
- Tips:
  - Choose a department at the top‑right to switch context.

**Hierarchy (Departments)**
- Purpose: An organizational chart of all departments and teams.
- What you’ll see:
  - A visual tree of the department structure and a side panel with details.
- Tips:
  - Click a department in the chart to view its manager, team members, and stats.

**Deliverables Calendar**
- Purpose: A weekly calendar showing upcoming milestones.
- What you’ll see:
  - A timeline of milestones by week, with color‑coding by type.
  - Optional pre‑deliverables (pre‑work items) you can show or hide.
- Common actions:
  - Change the week range using the controls at the top.
  - Search and filter by person to see milestones relevant to them.

**Reports — Role Capacity**
- Purpose: See how staffing compares to capacity for each role.
- What you’ll see:
  - A card summarizing where you are under‑ or over‑staffed by role.
- Tips:
  - Use this to guide hiring or reassignments.

**Reports — Team Forecast**
- Purpose: Look ahead at team workload and a project’s weekly timeline.
- What you’ll see:
  - A capacity timeline across weeks.
  - A project chooser that shows weekly hours and milestone markers for that project.
- Tips:
  - Adjust the weeks shown and the department to focus your view.

**Reports — Person Experience**
- Purpose: Summarize project experience for a person over a time window.
- What you’ll see:
  - Search for a person and select a time frame (months or years).
  - A breakdown of projects, hours, common roles, and phases worked.

**Settings**
- Purpose: Administrative tools and system options.
- Sections include:
  - Roles: Add, remove, reorder, and rename job roles used across the system.
  - Utilization scheme: Adjust color ranges and thresholds for workload badges.
  - Backups and restore: Create or restore database backups.
  - Department‑scoped roles (if enabled): Configure allowed roles by department.
  - Calendar Feeds: Generate a private link you can paste into calendar tools.
- Calendar feeds (Subscriptions):
  - The “Calendar Feeds” card shows a private address ending with “deliverables.ics”.
  - Copy the link and add it to your calendar:
    - Outlook: Add calendar → Subscribe from web → paste the link.
    - Google Calendar: Other calendars → From URL → paste the link.
  - Anyone with the link can view milestones. Regenerate the token to revoke old links.

**Profile**
- Purpose: Update your personal information and preferences.
- What you can do:
  - Change your display name and password.
  - Choose a color theme.
  - See your username, email, and account role.

## Integrations Prerequisites

The upcoming Integrations Hub relies on `cryptography` (for secure token storage) and `jsonschema` (provider metadata validation). Both packages are tracked in `backend/requirements.txt`. Run `pip install -r backend/requirements.txt` after pulling the latest code so these dependencies are available before working on the Integrations app.

When running the backend container locally, set `INTEGRATIONS_ENABLED=true`. OAuth client metadata (`client_id`, `client_secret`, redirect URI) is now stored via the Integrations UI instead of `.env`, so you can rotate it without redeploying. (Environment variables are still supported for advanced overrides.)

Register an app in the BQE developer portal and set the redirect URI to your instance’s callback path (`https://<host>/api/integrations/providers/bqe/connect/callback`). Keep the client ID/secret handy—they are entered inside Settings → Integrations rather than `.env`, but you can still rotate them without downtime. The Integrations Hub currently understands the BQE **Projects** and **Clients** objects; use the mapping UI to decide which fields flow into local storage.

See `docs/integrations/key-rotation.md` for the MultiFernet rotation runbook and `prompts/INTEGRATIONS-HUB-E2E-CHECKLIST.md` for the manual test plan.

## Using the Integrations Hub (BQE)

1. **Unlock the hub** – Navigate to Settings → Integrations. If this is the first run, paste or generate a Fernet key in the unlock form and click **Save Key**. The key is stored encrypted and can be rotated any time via the same UI.
2. **Enter provider credentials** – In the “Provider Credentials” card, paste the BQE `client_id`, `client_secret`, and redirect URI from the BQE developer portal. BQE CORE now requires OAuth 2.0 Authorization Code + PKCE against `https://api-identity.bqecore.com/idp/connect/authorize` and `https://api-identity.bqecore.com/idp/connect/token` with the scopes `readwrite:core offline_access openid email profile`. The redirect URI must match exactly, and the secret is encrypted via MultiFernet.
3. **Connect to BQE** – Click the “Connect Provider” button on the BQE card, choose Sandbox or Production, and walk through the OAuth consent screen. Each environment supports one connection per provider; use “Force reconnect” (or “Reconnect OAuth”) to re-authorize the existing Sandbox/Production record instead of creating duplicates. Successful connections appear as selectable pills with environment badges.
3. **Configure field mapping** – Within the provider’s detail card, open the “Field Mapping” section to review the defaults (e.g., BQE `clientName` → local `project.client` and `project.bqe_client_name`). Adjust or add rows, then click **Save Mapping**. The same flow is available for the new **Clients** object (`integration_client.*` fields).
4. **Create/enable rules** – Use the Rules panel to define sync interval, fields, client sync policy, and deletion behavior per object. Saving a rule schedules the Celery planner to run it automatically; you can also trigger a Post-restore resync from the Sync Controls modal.
5. **Run the matching wizard (Projects)** – Before enabling automatic project sync, click “Load Initial Matching” to pair BQE parent projects with local records. Review suggestions, override as needed, and Save Matches. Enabling “turn on the rule after saving” will immediately allow deltas.
6. **Monitor jobs & health** – The Sync Controls card lists recent jobs, metrics (running count, 24h success rate, items processed), and job history filters. Failed jobs expose a **Retry job** action that queues a new run and logs an audit entry. If Celery or Redis are unavailable, a banner will warn that sync controls are temporarily paused.
7. **Sync additional objects** – The catalog now includes the BQE **Clients** object. Create a Clients rule to keep the `IntegrationClient` table up to date and use that data elsewhere in the platform (e.g., to drive mapping suggestions or future client matching flows).

**Authentication Pages**
- Login: Enter your username (or email) and password.
- Reset Password: Request a reset link if you forget your password.
- Set Password: Complete a reset by choosing a new password from the link.

**Coming Soon**
- Placeholder page used for features that are being prepared and will appear in future updates.

Storage Notes (Risk Attachments)
- Risk log attachments are stored in a protected volume mounted at `/app/risk_attachments`.
- In Docker, map a persistent volume to that path (the compose files include `risk_attachments_volume:/app/risk_attachments`).
- You can override the path with `RISK_ATTACHMENTS_DIR` if you mount a different host path or volume.


Helpful Concepts
- Assignment: A person planned to work on a project, with weekly hours.
- Deliverable: A project milestone or due date.
- Pre‑deliverable: A preparatory step created automatically before a milestone.
- Capacity: The hours a person can work in a week.
- Utilization: How much of someone’s capacity is planned (for example, 30 of 36 hours).
- Department: A group such as “Design” or “Engineering”.
- Role: A job type such as “Project Manager” or “Designer”.


Where to Get Help
- If something looks wrong on a page, try refreshing the browser.
- If you cannot sign in, use “Forgot password?” on the login page.
- For account or data issues, contact your administrator.
