#!/usr/bin/env bash
set -euo pipefail

staged_files=$(git diff --cached --name-only)
if [ -z "${staged_files}" ]; then
  exit 0
fi

backend_py_changed=$(printf "%s\n" "${staged_files}" | grep -E '^backend/.*\.py$' | grep -v '/migrations/' || true)
if [ -z "${backend_py_changed}" ]; then
  exit 0
fi

missing=0
if ! printf "%s\n" "${staged_files}" | grep -q '^backend/openapi\.json$'; then
  echo "backend/openapi.json is not staged. Run: make openapi"
  missing=1
fi

if ! printf "%s\n" "${staged_files}" | grep -q '^frontend/src/api/schema\.ts$'; then
  echo "frontend/src/api/schema.ts is not staged. Run: make openapi"
  missing=1
fi

if [ "${missing}" -ne 0 ]; then
  echo "If this is intentional, bypass with: SKIP=openapi-updated git commit ..."
  exit 1
fi
