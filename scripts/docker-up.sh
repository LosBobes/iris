#!/usr/bin/env bash
#
# docker-up.sh — build the Iris image, start the stack, wait until the API is
# healthy, and (optionally) seed demo data into the SQLite volume.
#
# Usage:
#   scripts/docker-up.sh           # build + up + wait for /healthz
#   scripts/docker-up.sh --seed    # ...then seed demo data via irisctl
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${IRIS_API_PORT:-8080}"
BASE="http://localhost:${PORT}"
SERVICE="iris-api"

compose() { docker compose "$@"; }

wait_for_health() {
  local attempts="${1:-60}"
  echo "→ Waiting for ${BASE}/healthz ..."
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "${BASE}/healthz" >/dev/null 2>&1; then
      echo "✓ API healthy after ${i}s"
      return 0
    fi
    sleep 1
  done
  echo "✗ API did not become healthy within ${attempts}s" >&2
  compose logs "$SERVICE" >&2 || true
  return 1
}

echo "→ Building image and starting stack ..."
compose up -d --build

wait_for_health 90

if [[ "${1:-}" == "--seed" ]]; then
  echo "→ Seeding demo data ..."
  compose exec -T "$SERVICE" irisctl seed-demo
  echo "✓ Demo data seeded"
fi

echo
echo "Iris is up: ${BASE}"
echo "  Health:   ${BASE}/healthz"
echo "  Stop:     docker compose down        (keeps SQLite volume)"
echo "  Wipe:     docker compose down -v      (deletes SQLite volume)"
