#!/usr/bin/env bash
set -euo pipefail

# Simple Docker Compose backup + retention script
# Usage: scripts/backup.sh [daily|weekly|monthly]
# Defaults: daily=7, weekly=4, monthly=12 (override via env)

TIER="${1:-daily}"
DAILY_KEEP="${DAILY_KEEP:-7}"
WEEKLY_KEEP="${WEEKLY_KEEP:-4}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"

case "$TIER" in
  daily|weekly|monthly) ;;
  *) echo "Unknown tier: $TIER (expected daily|weekly|monthly)" >&2; exit 2;;
esac

# Resolve repo root from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Ensure subdirectories exist under host ./backups (bind-mounts to /backups in container)
mkdir -p backups/daily backups/weekly backups/monthly

# Compose files
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)

# Build archive filename and run backup in container (custom format)
UTCSTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILENAME="$TIER/backup_${UTCSTAMP}.pgcustom"

echo "[backup] Starting $TIER backup -> backups/$FILENAME"
docker compose "${COMPOSE_FILES[@]}" exec -T backend \
  python manage.py backup_database --format custom \
  --filename "$FILENAME" --description "cron-$TIER"

# Retention pruning per tier
KEEP=$DAILY_KEEP
if [[ "$TIER" == "weekly" ]]; then KEEP=$WEEKLY_KEEP; fi
if [[ "$TIER" == "monthly" ]]; then KEEP=$MONTHLY_KEEP; fi

TARGET_DIR="backups/$TIER"
echo "[backup] Pruning $TIER backups in $TARGET_DIR (keep $KEEP)"

# List files by mtime descending, keep first N, delete the rest (archive + meta sidecar)
mapfile -t ALL_FILES < <(ls -1t "$TARGET_DIR"/*.pgcustom 2>/dev/null || true)

if (( ${#ALL_FILES[@]} > KEEP )); then
  for (( i=KEEP; i<${#ALL_FILES[@]}; i++ )); do
    ARCH="${ALL_FILES[$i]}"
    META="${ARCH%.pgcustom}.meta.json"
    echo "[backup] Deleting old: $ARCH"
    rm -f -- "$ARCH"
    if [[ -f "$META" ]]; then
      echo "[backup] Deleting sidecar: $META"
      rm -f -- "$META"
    fi
  done
else
  echo "[backup] Nothing to prune (count=${#ALL_FILES[@]})"
fi

echo "[backup] Done ($TIER)"

