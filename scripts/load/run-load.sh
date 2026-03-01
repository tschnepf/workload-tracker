#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOAD_ROOT="${ROOT_DIR}/tests/load"

MODE="quick"
RUN_ID="$(date +%Y%m%d%H%M%S)"
KEEP_STACK=0
SKIP_UI_CHECKS="${LOAD_SKIP_UI_CHECKS:-0}"
SOURCE_PROJECT="${SOURCE_PROJECT:-workload-tracker}"
PROJECT_NAME=""
BACKEND_PORT="${LOAD_BACKEND_PORT:-18080}"
FRONTEND_PORT="${LOAD_FRONTEND_PORT:-13000}"
K6_IMAGE="${K6_IMAGE:-grafana/k6:0.49.0}"
SNAPSHOT_FILE="${LOAD_ROOT}/data/source_snapshot.sql.gz"
SCENARIO_FILE_REL="${LOAD_SCENARIO_FILE_REL:-config/scenario.json}"
LOAD_SECRET_KEY="${LOAD_SECRET_KEY:-lt-secret-${RUN_ID}-$(date +%s)}"
LOAD_RESTORE_JOB_TOKEN_SECRET="${LOAD_RESTORE_JOB_TOKEN_SECRET:-lt-restore-secret-${RUN_ID}-$(date +%s)}"
LOAD_REDIS_PASSWORD="${LOAD_REDIS_PASSWORD:-}"

resolve_env_var_from_file() {
  local key="$1"
  local env_file="${ROOT_DIR}/.env"
  if [[ ! -f "${env_file}" ]]; then
    return 1
  fi
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "${env_file}" | tail -n 1 || true)"
  if [[ -z "${line}" ]]; then
    return 1
  fi
  line="${line#*=}"
  line="${line%%#*}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf "%s" "${line}"
}

REDIS_PASSWORD_VALUE="${LOAD_REDIS_PASSWORD:-${REDIS_PASSWORD:-}}"
if [[ -z "${REDIS_PASSWORD_VALUE}" ]]; then
  REDIS_PASSWORD_VALUE="$(resolve_env_var_from_file REDIS_PASSWORD || true)"
fi
if [[ -z "${REDIS_PASSWORD_VALUE}" ]]; then
  REDIS_PASSWORD_VALUE="workload-redis-prod"
fi

usage() {
  cat <<'EOF'
Usage: scripts/load/run-load.sh [options]

Options:
  --mode quick|soak        Load profile mode (default: quick)
  --run-id ID              Run identifier used in LT_<run_id>_ data prefix
  --project-name NAME      Dedicated compose project name
  --keep-stack             Keep isolated stack running after completion
  --skip-ui-checks         Skip pre/post Playwright checks
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-quick}"; shift 2 ;;
    --run-id) RUN_ID="${2:-}"; shift 2 ;;
    --project-name) PROJECT_NAME="${2:-}"; shift 2 ;;
    --keep-stack) KEEP_STACK=1; shift ;;
    --skip-ui-checks) SKIP_UI_CHECKS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "${MODE}" != "quick" && "${MODE}" != "soak" ]]; then
  echo "Invalid --mode '${MODE}'. Use quick or soak." >&2
  exit 1
fi

if [[ -z "${RUN_ID}" ]]; then
  echo "--run-id cannot be empty" >&2
  exit 1
fi

if [[ -z "${PROJECT_NAME}" ]]; then
  SAFE_RUN_ID="$(echo "${RUN_ID}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
  PROJECT_NAME="wtload${SAFE_RUN_ID}"
fi

if [[ -z "${PROJECT_NAME}" ]]; then
  echo "Unable to derive compose project name from run id." >&2
  exit 1
fi

if [[ ! -f "${LOAD_ROOT}/${SCENARIO_FILE_REL}" ]]; then
  echo "Scenario file not found: ${LOAD_ROOT}/${SCENARIO_FILE_REL}" >&2
  exit 1
fi

REPORT_NAME="$(date +%Y%m%d_%H%M%S)_${MODE}_${RUN_ID}"
REPORT_DIR="${LOAD_ROOT}/reports/${REPORT_NAME}"
REPORT_REL="reports/${REPORT_NAME}"
mkdir -p "${REPORT_DIR}" "${REPORT_DIR}/sql/pre" "${REPORT_DIR}/sql/post"
USERS_RUNTIME_JSON="${REPORT_DIR}/users.json"
SEED_RUNTIME_JSON="${REPORT_DIR}/seed-data.json"

COMPOSE_ARGS=(
  --project-directory "${ROOT_DIR}"
  -p "${PROJECT_NAME}"
)

TMP_COMPOSE_DIR="$(mktemp -d)"
BASE_COMPOSE_TMP="${TMP_COMPOSE_DIR}/docker-compose.yml"
PROD_COMPOSE_TMP="${TMP_COMPOSE_DIR}/docker-compose.prod.yml"
NOHOST_COMPOSE_TMP="${TMP_COMPOSE_DIR}/docker-compose.no-host-db-ports.yml"
HARNESS_COMPOSE_TMP="${TMP_COMPOSE_DIR}/docker-compose.load-harness.yml"

rewrite_compose() {
  local src="$1"
  local dst="$2"
  sed \
    -e '/^[[:space:]]*container_name:[[:space:]]*/d' \
    -e "s|^\([[:space:]]*-[[:space:]]\)\.env\$|\1${ROOT_DIR}/.env|g" \
    -e 's|^\([[:space:]]*-[[:space:]]*\)"5432:5432"|\1"0:5432"|' \
    -e 's|^\([[:space:]]*-[[:space:]]*\)"6379:6379"|\1"0:6379"|' \
    "${src}" > "${dst}"
}

rewrite_compose "${ROOT_DIR}/docker-compose.yml" "${BASE_COMPOSE_TMP}"
rewrite_compose "${ROOT_DIR}/docker-compose.prod.yml" "${PROD_COMPOSE_TMP}"
cp "${ROOT_DIR}/docker-compose.no-host-db-ports.yml" "${NOHOST_COMPOSE_TMP}"
cat > "${HARNESS_COMPOSE_TMP}" <<'EOF'
services:
  pgbouncer:
    image: edoburu/pgbouncer:latest
    environment:
      - DB_HOST=db
      - DB_PORT=5432
      - DB_USER=${POSTGRES_USER:-postgres}
      - DB_PASSWORD=${POSTGRES_PASSWORD:-postgres}
      - DB_NAME=${POSTGRES_DB:-workload_tracker}
      - AUTH_TYPE=scram-sha-256
      - POOL_MODE=transaction
      - MAX_CLIENT_CONN=1500
      - DEFAULT_POOL_SIZE=60
      - RESERVE_POOL_SIZE=20
      - MAX_DB_CONNECTIONS=120
      - LISTEN_PORT=6432
      - IGNORE_STARTUP_PARAMETERS=extra_float_digits,options
      - SERVER_RESET_QUERY=DISCARD ALL
      - ADMIN_USERS=${POSTGRES_USER:-postgres}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - tracker-network
      - default
  migrator:
    image: alpine:3.20
    entrypoint: ["/bin/sh", "-lc"]
    command: "echo 'Skipping prod migrator in load harness'; exit 0"
    restart: "no"
  backend:
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --worker-class sync --max-requests 1000 --max-requests-jitter 50
    environment:
      - RUN_MIGRATIONS_ON_START=false
      - AUTO_FIX_JWT_BLACKLIST=false
      - DB_WAIT_HOST=db
      - DB_WAIT_PORT=5432
      - DATABASE_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@pgbouncer:6432/${POSTGRES_DB:-workload_tracker}
      - DB_ADMIN_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-workload_tracker}
      - POSTGRES_HOST=pgbouncer
      - POSTGRES_PORT=6432
      - DISABLE_SERVER_SIDE_CURSORS=true
      - SECRET_KEY=${SECRET_KEY}
      - RESTORE_JOB_TOKEN_SECRET=${RESTORE_JOB_TOKEN_SECRET}
      - DRF_THROTTLE_ANON=${DRF_THROTTLE_ANON:-}
      - DRF_THROTTLE_USER=${DRF_THROTTLE_USER:-}
      - DRF_THROTTLE_LOGIN=${DRF_THROTTLE_LOGIN:-}
      - DRF_THROTTLE_TOKEN_OBTAIN=${DRF_THROTTLE_TOKEN_OBTAIN:-}
      - DRF_THROTTLE_TOKEN_REFRESH=${DRF_THROTTLE_TOKEN_REFRESH:-}
      - ASSIGNMENTS_PAGE_CACHE_TTL_SECONDS=${ASSIGNMENTS_PAGE_CACHE_TTL_SECONDS:-}
      - GRID_SNAPSHOT_CACHE_TTL_SECONDS=${GRID_SNAPSHOT_CACHE_TTL_SECONDS:-}
      - SNAPSHOT_CACHE_SWR_SECONDS=${SNAPSHOT_CACHE_SWR_SECONDS:-}
      - ASSIGNMENT_HOURS_STORAGE_MODE=${ASSIGNMENT_HOURS_STORAGE_MODE:-normalized}
      - SNAPSHOT_SCOPE_INVALIDATION_ENABLED=${SNAPSHOT_SCOPE_INVALIDATION_ENABLED:-true}
      - SNAPSHOT_INVALIDATION_CHANNEL=${SNAPSHOT_INVALIDATION_CHANNEL:-snapshot_invalidation}
      - REDIS_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - SECURE_SSL_REDIRECT=false
      - CORS_ALLOWED_ORIGINS=http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}
      - CSRF_TRUSTED_ORIGINS=http://localhost:${BACKEND_PORT},http://127.0.0.1:${BACKEND_PORT},http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}
  worker:
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@pgbouncer:6432/${POSTGRES_DB:-workload_tracker}
      - DB_ADMIN_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-workload_tracker}
      - DB_WAIT_HOST=db
      - DB_WAIT_PORT=5432
      - POSTGRES_HOST=pgbouncer
      - POSTGRES_PORT=6432
      - DISABLE_SERVER_SIDE_CURSORS=true
      - ASSIGNMENT_HOURS_STORAGE_MODE=${ASSIGNMENT_HOURS_STORAGE_MODE:-normalized}
      - SNAPSHOT_SCOPE_INVALIDATION_ENABLED=${SNAPSHOT_SCOPE_INVALIDATION_ENABLED:-true}
      - SNAPSHOT_INVALIDATION_CHANNEL=${SNAPSHOT_INVALIDATION_CHANNEL:-snapshot_invalidation}
      - SECRET_KEY=${SECRET_KEY}
      - RESTORE_JOB_TOKEN_SECRET=${RESTORE_JOB_TOKEN_SECRET}
      - REDIS_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - SECURE_SSL_REDIRECT=false
      - CORS_ALLOWED_ORIGINS=http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}
      - CSRF_TRUSTED_ORIGINS=http://localhost:${BACKEND_PORT},http://127.0.0.1:${BACKEND_PORT},http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}
  worker_db:
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@pgbouncer:6432/${POSTGRES_DB:-workload_tracker}
      - DB_ADMIN_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-workload_tracker}
      - DB_WAIT_HOST=db
      - DB_WAIT_PORT=5432
      - POSTGRES_HOST=pgbouncer
      - POSTGRES_PORT=6432
      - DISABLE_SERVER_SIDE_CURSORS=true
      - ASSIGNMENT_HOURS_STORAGE_MODE=${ASSIGNMENT_HOURS_STORAGE_MODE:-normalized}
      - SNAPSHOT_SCOPE_INVALIDATION_ENABLED=${SNAPSHOT_SCOPE_INVALIDATION_ENABLED:-true}
      - SNAPSHOT_INVALIDATION_CHANNEL=${SNAPSHOT_INVALIDATION_CHANNEL:-snapshot_invalidation}
      - SECRET_KEY=${SECRET_KEY}
      - RESTORE_JOB_TOKEN_SECRET=${RESTORE_JOB_TOKEN_SECRET}
      - REDIS_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - SECURE_SSL_REDIRECT=false
      - CORS_ALLOWED_ORIGINS=http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}
      - CSRF_TRUSTED_ORIGINS=http://localhost:${BACKEND_PORT},http://127.0.0.1:${BACKEND_PORT},http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}
  worker_beat:
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@pgbouncer:6432/${POSTGRES_DB:-workload_tracker}
      - DB_ADMIN_URL=postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-workload_tracker}
      - DB_WAIT_HOST=db
      - DB_WAIT_PORT=5432
      - POSTGRES_HOST=pgbouncer
      - POSTGRES_PORT=6432
      - DISABLE_SERVER_SIDE_CURSORS=true
      - ASSIGNMENT_HOURS_STORAGE_MODE=${ASSIGNMENT_HOURS_STORAGE_MODE:-normalized}
      - SNAPSHOT_SCOPE_INVALIDATION_ENABLED=${SNAPSHOT_SCOPE_INVALIDATION_ENABLED:-true}
      - SNAPSHOT_INVALIDATION_CHANNEL=${SNAPSHOT_INVALIDATION_CHANNEL:-snapshot_invalidation}
      - SECRET_KEY=${SECRET_KEY}
      - RESTORE_JOB_TOKEN_SECRET=${RESTORE_JOB_TOKEN_SECRET}
      - REDIS_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD:-workload-redis-prod}@redis:6379/1
      - SECURE_SSL_REDIRECT=false
      - CORS_ALLOWED_ORIGINS=http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}
      - CSRF_TRUSTED_ORIGINS=http://localhost:${BACKEND_PORT},http://127.0.0.1:${BACKEND_PORT},http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}
EOF
COMPOSE_ARGS+=(
  -f "${BASE_COMPOSE_TMP}"
  -f "${PROD_COMPOSE_TMP}"
  -f "${NOHOST_COMPOSE_TMP}"
  -f "${HARNESS_COMPOSE_TMP}"
)

compose() {
  BACKEND_PORT="${BACKEND_PORT}" FRONTEND_PORT="${FRONTEND_PORT}" SECRET_KEY="${LOAD_SECRET_KEY}" \
    RESTORE_JOB_TOKEN_SECRET="${LOAD_RESTORE_JOB_TOKEN_SECRET}" REDIS_PASSWORD="${REDIS_PASSWORD_VALUE}" \
    docker compose "${COMPOSE_ARGS[@]}" "$@"
}

STATS_PID=""
QUEUE_PID=""

stop_samplers() {
  if [[ -n "${STATS_PID}" ]]; then kill "${STATS_PID}" >/dev/null 2>&1 || true; fi
  if [[ -n "${QUEUE_PID}" ]]; then kill "${QUEUE_PID}" >/dev/null 2>&1 || true; fi
}

on_exit() {
  local code=$?
  stop_samplers
  if [[ "${KEEP_STACK}" -eq 0 ]]; then
    compose down -v >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_COMPOSE_DIR}" >/dev/null 2>&1 || true
  exit "${code}"
}
trap on_exit EXIT

wait_for_backend() {
  local url="http://localhost:${BACKEND_PORT}/api/health/"
  for _ in $(seq 1 90); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Backend did not become healthy at ${url}" >&2
  return 1
}

build_snapshot_if_needed() {
  if [[ -f "${SNAPSHOT_FILE}" ]]; then
    return 0
  fi
  echo "Creating one-time snapshot from source project '${SOURCE_PROJECT}' ..."
  mkdir -p "$(dirname "${SNAPSHOT_FILE}")"
  docker compose -p "${SOURCE_PROJECT}" -f "${ROOT_DIR}/docker-compose.yml" exec -T db \
    pg_dump -U postgres -d workload_tracker | gzip > "${SNAPSHOT_FILE}"
}

restore_snapshot_into_isolated_db() {
  echo "Restoring snapshot into isolated DB ..."
  compose stop backend worker >/dev/null 2>&1 || true
  compose exec -T db psql -U postgres -d workload_tracker -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  gzip -dc "${SNAPSHOT_FILE}" | compose exec -T db psql -U postgres -d workload_tracker
  compose start backend worker >/dev/null
  wait_for_backend
  compose exec -T \
    -e DATABASE_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:-postgres}@db:5432/${POSTGRES_DB:-workload_tracker}" \
    backend python manage.py migrate --noinput
}

seed_load_data() {
  echo "Seeding deterministic load-test data for run ${RUN_ID} ..."
  local prefix="LT_${RUN_ID}_"
  local lower_prefix
  lower_prefix="$(echo "${prefix}" | tr '[:upper:]' '[:lower:]')"
  local seed_log="${REPORT_DIR}/seed-command.log"
  local seed_timeout="${LOAD_SEED_TIMEOUT_SECONDS:-900}"
  local target_projects=200
  local target_people=600
  local target_assignments=4000
  local hot_assignment_count=120
  local seed_pid=""
  local counts_line=""
  local project_count=0
  local person_count=0
  local assignment_count=0
  local start_ts
  start_ts="$(date +%s)"

  set +e
  compose exec -T backend python manage.py seed_load_test_data \
    --run-id "${RUN_ID}" \
    --manager-count 48 \
    --user-count 72 \
    --project-count "${target_projects}" \
    --person-count "${target_people}" \
    --assignment-count "${target_assignments}" \
    --week-count 12 \
    --hot-assignment-count "${hot_assignment_count}" \
    --password "LoadTest123!" \
    --purge-existing > "${seed_log}" 2>&1 &
  seed_pid="$!"
  set -e

  while true; do
    counts_line="$(
      compose exec -T db psql -U postgres -d workload_tracker -At -F '|' -c \
        "select
          coalesce((select count(*) from projects_project where substr(name,1,length('${prefix}'))='${prefix}'),0),
          coalesce((select count(*) from people_person where substr(name,1,length('${prefix}'))='${prefix}'),0),
          coalesce((select count(*) from assignments_assignment a join projects_project p on p.id=a.project_id where substr(p.name,1,length('${prefix}'))='${prefix}'),0);" \
        2>/dev/null || true
    )"
    IFS='|' read -r project_count person_count assignment_count <<< "${counts_line}"
    project_count="${project_count:-0}"
    person_count="${person_count:-0}"
    assignment_count="${assignment_count:-0}"

    if [[ "${project_count}" -ge "${target_projects}" && "${person_count}" -ge "${target_people}" && "${assignment_count}" -ge "${target_assignments}" ]]; then
      echo "Seed targets reached (${project_count} projects, ${person_count} people, ${assignment_count} assignments)."
      break
    fi

    if ! kill -0 "${seed_pid}" >/dev/null 2>&1; then
      break
    fi

    if (( "$(date +%s)" - start_ts >= seed_timeout )); then
      echo "Seed command timeout after ${seed_timeout}s." >&2
      break
    fi

    sleep 2
  done

  if kill -0 "${seed_pid}" >/dev/null 2>&1; then
    if [[ "${project_count}" -ge "${target_projects}" && "${person_count}" -ge "${target_people}" && "${assignment_count}" -ge "${target_assignments}" ]]; then
      echo "Terminating lingering seed process after target data was created ..."
      kill "${seed_pid}" >/dev/null 2>&1 || true
      wait "${seed_pid}" >/dev/null 2>&1 || true
      compose exec -T backend sh -lc "pkill -f 'seed_load_test_data --run-id ${RUN_ID}' >/dev/null 2>&1 || true" >/dev/null 2>&1 || true
    else
      kill "${seed_pid}" >/dev/null 2>&1 || true
      wait "${seed_pid}" >/dev/null 2>&1 || true
      echo "Seed command exited/timeout before reaching target counts. See ${seed_log}" >&2
      return 1
    fi
  else
    wait "${seed_pid}" >/dev/null 2>&1 || true
    if [[ "${project_count}" -lt "${target_projects}" || "${person_count}" -lt "${target_people}" || "${assignment_count}" -lt "${target_assignments}" ]]; then
      echo "Seed command finished but target counts were not reached. See ${seed_log}" >&2
      return 1
    fi
  fi

  compose exec -T db psql -U postgres -d workload_tracker -At -c \
    "select id from projects_project where substr(name,1,length('${prefix}'))='${prefix}' order by id;" \
    > "${REPORT_DIR}/seed-project-ids.txt"
  compose exec -T db psql -U postgres -d workload_tracker -At -c \
    "select id from people_person where substr(name,1,length('${prefix}'))='${prefix}' order by id;" \
    > "${REPORT_DIR}/seed-person-ids.txt"
  compose exec -T db psql -U postgres -d workload_tracker -At -c \
    "select a.id from assignments_assignment a join projects_project p on p.id=a.project_id where substr(p.name,1,length('${prefix}'))='${prefix}' and a.is_active=true order by a.id;" \
    > "${REPORT_DIR}/seed-assignment-ids.txt"
  compose exec -T db psql -U postgres -d workload_tracker -At -F '|' -c \
    "select u.username,coalesce(up.person_id,0) from auth_user u left join accounts_userprofile up on up.user_id=u.id where substr(u.username,1,length('${lower_prefix}mgr_'))='${lower_prefix}mgr_' order by u.username;" \
    > "${REPORT_DIR}/seed-manager-users.txt"
  compose exec -T db psql -U postgres -d workload_tracker -At -F '|' -c \
    "select u.username,coalesce(up.person_id,0) from auth_user u left join accounts_userprofile up on up.user_id=u.id where substr(u.username,1,length('${lower_prefix}usr_'))='${lower_prefix}usr_' order by u.username;" \
    > "${REPORT_DIR}/seed-user-users.txt"

  python3 - "${RUN_ID}" "${REPORT_DIR}" "${USERS_RUNTIME_JSON}" "${SEED_RUNTIME_JSON}" "${hot_assignment_count}" <<'PY'
import json
import pathlib
import hashlib
import sys
from datetime import date, timedelta, datetime, timezone

run_id = sys.argv[1]
report_dir = pathlib.Path(sys.argv[2])
users_path = pathlib.Path(sys.argv[3])
seed_path = pathlib.Path(sys.argv[4])
hot_count = int(sys.argv[5])

prefix = f"LT_{run_id}_"
seed_value = int(hashlib.sha256(run_id.encode("utf-8")).hexdigest()[:16], 16)

def read_int_list(path: pathlib.Path) -> list[int]:
    values: list[int] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        values.append(int(line))
    return values

def read_user_rows(path: pathlib.Path, role: str) -> list[dict]:
    rows: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        username, person_id = line.split("|", 1)
        rows.append(
            {
                "username": username,
                "password": "LoadTest123!",
                "role": role,
                "personId": int(person_id),
            }
        )
    return rows

def sunday_week_keys(weeks: int) -> list[str]:
    today = date.today()
    offset = (today.weekday() + 1) % 7
    first_sunday = today - timedelta(days=offset)
    return [(first_sunday + timedelta(days=(7 * idx))).isoformat() for idx in range(weeks)]

project_ids = read_int_list(report_dir / "seed-project-ids.txt")
person_ids = read_int_list(report_dir / "seed-person-ids.txt")
assignment_ids = read_int_list(report_dir / "seed-assignment-ids.txt")
manager_users = read_user_rows(report_dir / "seed-manager-users.txt", "manager")
user_users = read_user_rows(report_dir / "seed-user-users.txt", "user")
week_keys = sunday_week_keys(12)
hot_assignment_ids = assignment_ids[:hot_count]

if len(manager_users) < 48 or len(user_users) < 72:
    raise RuntimeError(
        f"Insufficient seeded users: managers={len(manager_users)} users={len(user_users)}"
    )
if len(project_ids) < 200 or len(person_ids) < 600 or len(assignment_ids) < 4000:
    raise RuntimeError(
        f"Insufficient seeded entities: projects={len(project_ids)} people={len(person_ids)} assignments={len(assignment_ids)}"
    )

manifest = {
    "runId": run_id,
    "prefix": prefix,
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "seed": seed_value,
    "weekKeys": week_keys,
    "managerUsers": manager_users,
    "userUsers": user_users,
    "ids": {
        "projectIds": project_ids,
        "personIds": person_ids,
        "assignmentIds": assignment_ids,
        "hotAssignmentIds": hot_assignment_ids,
        "departmentIds": [],
        "roleIds": [],
    },
    "counts": {
        "managerUsers": len(manager_users),
        "userUsers": len(user_users),
        "projects": len(project_ids),
        "people": len(person_ids),
        "assignments": len(assignment_ids),
    },
}

(report_dir / "seed-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
users_path.write_text(
    json.dumps({"managerUsers": manager_users, "userUsers": user_users}, indent=2) + "\n"
)
seed_path.write_text(
    json.dumps(
        {
            "runId": run_id,
            "prefix": prefix,
            "weekKeys": week_keys,
            "ids": {
                "projectIds": project_ids,
                "personIds": person_ids,
                "assignmentIds": assignment_ids,
                "hotAssignmentIds": hot_assignment_ids,
            },
        },
        indent=2,
    )
    + "\n"
)
PY
}

preflight_checks() {
  echo "Running preflight gates ..."
  local health_url="http://localhost:${BACKEND_PORT}/api/health/"
  local readiness_url="http://localhost:${BACKEND_PORT}/api/readiness/"
  local health_code=""
  local readiness_code=""

  wait_for_backend
  for _ in $(seq 1 45); do
    health_code="$(curl -sS -o "${REPORT_DIR}/preflight-health.json" -w "%{http_code}" "${health_url}" || true)"
    if [[ "${health_code}" == "200" ]]; then
      break
    fi
    sleep 2
  done
  for _ in $(seq 1 45); do
    readiness_code="$(curl -sS -o "${REPORT_DIR}/preflight-readiness.json" -w "%{http_code}" "${readiness_url}" || true)"
    if [[ "${readiness_code}" == "200" ]]; then
      break
    fi
    sleep 2
  done
  if [[ "${health_code}" != "200" ]]; then
    echo "Preflight failed: health endpoint returned HTTP ${health_code}" >&2
    return 1
  fi
  if [[ "${readiness_code}" != "200" ]]; then
    echo "Preflight warning: readiness endpoint returned HTTP ${readiness_code}; continuing for diagnostics." >&2
  fi
  test -s "${REPORT_DIR}/preflight-health.json"
  test -s "${REPORT_DIR}/preflight-readiness.json"

  compose exec -T db psql -U postgres -d workload_tracker -c "select extname from pg_extension where extname='pg_stat_statements';" \
    > "${REPORT_DIR}/preflight-pg-extension.txt"
  compose exec -T db psql -U postgres -d workload_tracker -c "select count(*) from pg_stat_statements;" \
    > "${REPORT_DIR}/preflight-pg-statements-count.txt"
  compose exec -T -e REDISCLI_AUTH="${REDIS_PASSWORD_VALUE}" redis sh -lc 'for k in $(redis-cli -n 1 --scan --pattern "*throttle*" | sort -u); do redis-cli -n 1 DEL "$k" >/dev/null; done; echo done' \
    > "${REPORT_DIR}/preflight-throttle-reset.txt"

  python3 - "${USERS_RUNTIME_JSON}" "${SEED_RUNTIME_JSON}" "${BACKEND_PORT}" "${REPORT_DIR}" <<'PY'
import json
import pathlib
import sys
import time
from http.cookies import SimpleCookie
import urllib.error
import urllib.request

users = json.loads(pathlib.Path(sys.argv[1]).read_text())
seed = json.loads(pathlib.Path(sys.argv[2]).read_text())
port = sys.argv[3]
report_dir = pathlib.Path(sys.argv[4])
base = f"http://localhost:{port}"

def parse_body(body: str):
    if not body:
        return {}
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return {"_raw": body}

def response_headers_dict(headers):
    result = {}
    if headers is None:
        return result
    for key, value in headers.items():
        result[key.lower()] = value
    try:
        set_cookies = headers.get_all("Set-Cookie") or []
    except Exception:
        set_cookies = []
    if set_cookies:
        result["set-cookie-list"] = set_cookies
    return result

def extract_refresh_token(headers):
    if not isinstance(headers, dict):
        return None
    cookie_values = []
    if isinstance(headers.get("set-cookie-list"), list):
        cookie_values.extend(headers.get("set-cookie-list"))
    single = headers.get("set-cookie")
    if single:
        cookie_values.append(single)
    for raw in cookie_values:
        if not raw:
            continue
        parsed = SimpleCookie()
        try:
            parsed.load(raw)
        except Exception:
            continue
        if "refresh_token" in parsed:
            return parsed["refresh_token"].value
    return None

def post_json(path, payload, token=None):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base + path,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, parse_body(body), response_headers_dict(resp.headers)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        return exc.code, parse_body(body), response_headers_dict(exc.headers)
    except urllib.error.URLError as exc:
        return 0, {"error": str(exc)}, {}

def patch_json(path, payload, token=None):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base + path,
        data=data,
        method="PATCH",
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, parse_body(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8")
        return exc.code, parse_body(body)
    except urllib.error.URLError as exc:
        return 0, {"error": str(exc)}

def require_auth(credential, label):
    last_status = None
    last_body = None
    for attempt in range(1, 6):
        status, body, headers = post_json("/api/token/", {"username": credential["username"], "password": credential["password"]})
        last_status = status
        last_body = body
        if status == 200 and "access" in body:
            access = body["access"]
            refresh_payload = {"refresh": extract_refresh_token(headers)}
            if isinstance(body, dict) and body.get("refresh"):
                refresh_payload = {"refresh": body["refresh"]}
            if not refresh_payload.get("refresh"):
                refresh_payload = {}
            status_refresh, _, _ = post_json("/api/token/refresh/", refresh_payload)
            if status_refresh == 200:
                return access
            if status_refresh in (429, 0, 500, 502, 503, 504):
                time.sleep(2)
                continue
        if status in (429,):
            time.sleep(5)
            continue
        if status in (0, 500, 502, 503, 504):
            time.sleep(2)
            continue
        break
    raise RuntimeError(f"{label} auth failed after retries: status={last_status} body={last_body}")

manager = users["managerUsers"][0]
user = users["userUsers"][0]
manager_access = require_auth(manager, "manager")
_ = require_auth(user, "user")

status_search, body_search, _ = post_json(
    "/api/projects/search/",
    {"page": 1, "page_size": 5, "search_tokens": [{"term": seed.get("prefix", "LT_"), "op": "and"}]},
    token=manager_access,
)
if status_search != 200:
    raise RuntimeError(f"projects/search smoke failed: status={status_search}")

assignment_ids = (seed.get("ids", {}) or {}).get("assignmentIds", [])
week_keys = seed.get("weekKeys", [])
if not assignment_ids or not week_keys:
    raise RuntimeError("seed data missing assignment IDs or week keys for write smoke check")

status_bulk, body_bulk = patch_json(
    "/api/assignments/bulk_update_hours/",
    {"updates": [{"assignmentId": assignment_ids[0], "weeklyHours": {week_keys[0]: 6}}]},
    token=manager_access,
)
if status_bulk != 200:
    raise RuntimeError(f"bulk_update_hours smoke failed: status={status_bulk}")

(report_dir / "preflight-auth-smoke.json").write_text(
    json.dumps(
        {
            "managerUser": manager["username"],
            "userUser": user["username"],
            "projectsSearchStatus": status_search,
            "bulkUpdateStatus": status_bulk,
            "bulkUpdateResponse": body_bulk,
        },
        indent=2,
    )
    + "\n"
)
PY
}

run_ui_checks() {
  local phase="$1"
  if [[ "${SKIP_UI_CHECKS}" -eq 1 ]]; then
    echo "Skipping UI checks (${phase}) by request."
    return 0
  fi
  echo "Running UI checks (${phase}) ..."
  pushd "${ROOT_DIR}/frontend" >/dev/null
  PLAYWRIGHT_BASE_URL="http://localhost:${FRONTEND_PORT}" \
  API_CALL_BUDGET_MODE=production-build \
  API_CALL_BUDGET_OUTPUT_PREFIX="../tests/load/reports/${REPORT_NAME}/playwright-${phase}" \
  npm run perf:probe:api-calls > "${REPORT_DIR}/ui-${phase}-probe.log" 2>&1
  PLAYWRIGHT_BASE_URL="http://localhost:${FRONTEND_PORT}" \
  npx playwright test tests/e2e/01_login.spec.ts tests/e2e/02_people.spec.ts \
    --project=chromium --reporter=line > "${REPORT_DIR}/ui-${phase}-playwright.log" 2>&1
  popd >/dev/null
}

capture_sql_snapshot() {
  local stage="$1"
  for sql_file in "${LOAD_ROOT}"/sql/*.sql; do
    local name
    name="$(basename "${sql_file}" .sql)"
    if ! compose exec -T db psql -U postgres -d workload_tracker -f - < "${sql_file}" \
      > "${REPORT_DIR}/sql/${stage}/${name}.txt" 2> "${REPORT_DIR}/sql/${stage}/${name}.err"; then
      echo "SQL snapshot failed for ${name} (${stage}); see ${REPORT_DIR}/sql/${stage}/${name}.err" >&2
    fi
  done
}

start_samplers() {
  local backend_cid db_cid redis_cid worker_cid
  backend_cid="$(compose ps -q backend)"
  db_cid="$(compose ps -q db)"
  redis_cid="$(compose ps -q redis)"
  worker_cid="$(compose ps -q worker)"

  (
    while true; do
      printf "%s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      docker stats --no-stream --format '{{json .}}' "${backend_cid}" "${db_cid}" "${redis_cid}" "${worker_cid}" || true
      sleep 10
    done
  ) > "${REPORT_DIR}/docker-stats.log" &
  STATS_PID="$!"

  (
    while true; do
      printf "%s " "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
      compose exec -T -e REDISCLI_AUTH="${REDIS_PASSWORD_VALUE}" redis sh -lc 'printf "celery=%s db_maintenance=%s\n" "$(redis-cli -n 1 LLEN celery)" "$(redis-cli -n 1 LLEN db_maintenance)"' || true
      sleep 10
    done
  ) > "${REPORT_DIR}/redis-queue-depth.log" &
  QUEUE_PID="$!"
}

run_k6() {
  local k6_status
  docker run --rm \
    --network "${PROJECT_NAME}_tracker-network" \
    -v "${LOAD_ROOT}:/work" \
    -e SCENARIO_FILE="/work/${SCENARIO_FILE_REL}" \
    -e USERS_FILE="/work/${REPORT_REL}/users.json" \
    -e SEED_FILE="/work/${REPORT_REL}/seed-data.json" \
    -e LOAD_MODE="${MODE}" \
    -e RUN_ID="${RUN_ID}" \
    -e BASE_URL="http://backend:8000" \
    "${K6_IMAGE}" run /work/k6/stack-concurrency.js \
    --summary-export "/work/${REPORT_REL}/k6-summary.json" \
    --out "json=/work/${REPORT_REL}/k6-raw.json" \
    > "${REPORT_DIR}/k6-console.log" 2>&1
  k6_status=$?
  echo "${k6_status}" > "${REPORT_DIR}/k6-exit-code.txt"
  return "${k6_status}"
}

aggregate_logs() {
  : > "${REPORT_DIR}/backend.log"
  : > "${REPORT_DIR}/worker.log"
  : > "${REPORT_DIR}/redis.log"
  compose logs --no-color backend > "${REPORT_DIR}/backend.log" || true
  compose logs --no-color worker > "${REPORT_DIR}/worker.log" || true
  compose logs --no-color redis > "${REPORT_DIR}/redis.log" || true

  python3 - "${REPORT_DIR}/backend.log" "${REPORT_DIR}/backend-status-counts.json" <<'PY'
import json
import pathlib
import re
import sys

log_path = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])
counts = {}
status_by_endpoint = {}
patterns = [
    re.compile(r'"status"\s*:\s*(\d{3})'),
    re.compile(r"\bstatus=(\d{3})\b"),
    re.compile(r'"status_code"\s*:\s*(\d{3})'),
]
path_patterns = [
    re.compile(r'"path"\s*:\s*"([^"]+)"'),
    re.compile(r"\bpath=([^\s,]+)"),
]
if log_path.exists():
    for line in log_path.read_text(errors="ignore").splitlines():
        code = None
        for pattern in patterns:
            m = pattern.search(line)
            if m:
                code = m.group(1)
                break
        if code:
            counts[code] = counts.get(code, 0) + 1
            path = None
            for path_pattern in path_patterns:
                pm = path_pattern.search(line)
                if pm:
                    path = pm.group(1)
                    break
            if path:
                endpoint = path.split("?", 1)[0]
                endpoint_counts = status_by_endpoint.setdefault(endpoint, {})
                endpoint_counts[code] = endpoint_counts.get(code, 0) + 1
out_path.write_text(json.dumps({"statusCounts": counts, "statusByEndpoint": status_by_endpoint}, indent=2) + "\n")
PY

  python3 - "${REPORT_DIR}/backend.log" "${REPORT_DIR}/endpoint-db-breakdown.json" <<'PY'
import json
import pathlib
import re

log_path = pathlib.Path(__import__('sys').argv[1])
out_path = pathlib.Path(__import__('sys').argv[2])
pat = re.compile(r'endpoint_timing\s+(\{.*\})')
rows = []
if log_path.exists():
    for line in log_path.read_text(errors="ignore").splitlines():
        m = pat.search(line)
        if not m:
            continue
        try:
            payload = json.loads(m.group(1))
        except Exception:
            continue
        rows.append(payload)

grouped = {}
for row in rows:
    endpoint = str(row.get("endpoint") or "<unknown>")
    g = grouped.setdefault(endpoint, {"count": 0, "durations": [], "dbTimes": [], "dbQueries": []})
    g["count"] += 1
    try:
        g["durations"].append(float(row.get("duration_ms") or 0.0))
    except Exception:
        pass
    try:
        g["dbTimes"].append(float(row.get("db_time_ms") or 0.0))
    except Exception:
        pass
    try:
        g["dbQueries"].append(int(row.get("db_query_count") or 0))
    except Exception:
        pass

def pct(values, p):
    if not values:
        return 0.0
    s = sorted(values)
    idx = (len(s) - 1) * (p / 100.0)
    lo = int(idx)
    hi = min(lo + 1, len(s) - 1)
    frac = idx - lo
    return s[lo] * (1 - frac) + s[hi] * frac

endpoint_rows = []
for endpoint, g in grouped.items():
    endpoint_rows.append({
        "endpoint": endpoint,
        "count": g["count"],
        "durationP95Ms": round(pct(g["durations"], 95), 2),
        "durationP99Ms": round(pct(g["durations"], 99), 2),
        "dbTimeP95Ms": round(pct(g["dbTimes"], 95), 2),
        "dbQueryCountP95": int(round(pct(g["dbQueries"], 95), 0)),
    })
endpoint_rows.sort(key=lambda r: (r["durationP95Ms"], r["count"]), reverse=True)
out_path.write_text(json.dumps({"rows": endpoint_rows}, indent=2) + "\n")
PY
}

generate_queue_recovery() {
  python3 - "${REPORT_DIR}/redis-queue-depth.log" "${REPORT_DIR}/queue-recovery.json" <<'PY'
import json
import pathlib
import re
import datetime as dt
import sys

in_path = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])
if not in_path.exists():
    out_path.write_text(json.dumps({"rows": [], "peakDepth": 0, "recoverySeconds": None}, indent=2) + "\n")
    raise SystemExit(0)

rows = []
pat = re.compile(r'^(?P<ts>\S+)\s+celery=(?P<celery>\d+)\s+db_maintenance=(?P<dbm>\d+)')
for line in in_path.read_text(errors="ignore").splitlines():
    m = pat.search(line.strip())
    if not m:
        continue
    ts = m.group("ts")
    celery = int(m.group("celery"))
    dbm = int(m.group("dbm"))
    rows.append({"ts": ts, "celery": celery, "dbMaintenance": dbm, "total": celery + dbm})

peak = max((r["total"] for r in rows), default=0)
baseline = rows[0]["total"] if rows else 0
peak_idx = None
for i, r in enumerate(rows):
    if r["total"] == peak:
        peak_idx = i
        break

recovery_seconds = None
if rows and peak_idx is not None:
    for r in rows[peak_idx:]:
        if r["total"] <= baseline:
            try:
                t0 = dt.datetime.fromisoformat(rows[peak_idx]["ts"].replace("Z", "+00:00"))
                t1 = dt.datetime.fromisoformat(r["ts"].replace("Z", "+00:00"))
                recovery_seconds = int((t1 - t0).total_seconds())
            except Exception:
                recovery_seconds = None
            break

out_path.write_text(json.dumps({
    "rows": rows,
    "baselineDepth": baseline,
    "peakDepth": peak,
    "recoverySeconds": recovery_seconds,
}, indent=2) + "\n")
PY
}

echo "Starting isolated production-like stack (${PROJECT_NAME}) ..."
SERVICES=(db redis pgbouncer backend worker)
if [[ "${SKIP_UI_CHECKS}" -ne 1 ]]; then
  SERVICES+=(frontend)
fi
compose up -d --build "${SERVICES[@]}"

wait_for_backend
build_snapshot_if_needed
restore_snapshot_into_isolated_db
wait_for_backend
seed_load_data
preflight_checks
run_ui_checks "pre"

capture_sql_snapshot "pre"
start_samplers

set +e
run_k6
K6_STATUS=$?
set -e

stop_samplers
capture_sql_snapshot "post"
aggregate_logs
generate_queue_recovery
run_ui_checks "post"

if ! "${ROOT_DIR}/scripts/load/analyze-load.sh" --report-dir "${REPORT_DIR}"; then
  echo "Warning: load analysis script failed for ${REPORT_DIR}" >&2
fi
if [[ ! -s "${REPORT_DIR}/endpoint-latency.json" ]]; then
  printf '{\n  "rows": []\n}\n' > "${REPORT_DIR}/endpoint-latency.json"
fi

echo "Load test run complete:"
echo "  Report: ${REPORT_DIR}"
echo "  k6 exit code: ${K6_STATUS}"

exit "${K6_STATUS}"
