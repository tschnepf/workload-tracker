#!/bin/sh
set -e

LOCKFILE="/app/package-lock.json"
HASHFILE="/app/node_modules/.package-lock.hash"

install_deps() {
  echo "[entrypoint] Installing npm dependencies..."
  npm install --loglevel warn
  sha256sum "$LOCKFILE" | awk '{print $1}' > "$HASHFILE"
}

if [ ! -d "/app/node_modules" ]; then
  mkdir -p /app/node_modules
fi

if [ ! -f "$LOCKFILE" ]; then
  echo "[entrypoint] Missing package-lock.json; cannot install dependencies." >&2
  exit 1
fi

if [ ! -f "$HASHFILE" ]; then
  install_deps
else
  CURRENT_HASH=$(sha256sum "$LOCKFILE" | awk '{print $1}')
  STORED_HASH=$(cat "$HASHFILE" 2>/dev/null || echo "")
  if [ "$CURRENT_HASH" != "$STORED_HASH" ]; then
    install_deps
  fi
fi

exec "$@"
