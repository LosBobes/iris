#!/usr/bin/env bash
#
# docker-persistence-test.sh — prove the SQLite database survives a Docker image
# update + prune, as long as the named volume (iris_sqlite_data) is kept.
#
# This is the CI/CD persistence guarantee: when you push code and the image is
# rebuilt and redeployed, work-order data must NOT be lost. It is only lost when
# the named volume itself is removed (`docker compose down -v`).
#
# What it does:
#   1. Clean start (drops any old volume), builds, brings the stack up.
#   2. Seeds demo data into the SQLite volume.
#   3. Snapshots the work-orders list via the API (state BEFORE).
#   4. Simulates a deploy: rebuild image with --no-cache, force-recreate the
#      container, and `docker system prune -af` (removes old/dangling images and
#      build cache, but NOT named volumes).
#   5. Snapshots the work-orders list again (state AFTER).
#   6. PASS if BEFORE == AFTER and non-empty -> data persisted across the update.
#   7. Negative check: `down -v` removes the volume -> data is wiped, proving the
#      volume is what holds the data.
#
# Usage:
#   scripts/docker-persistence-test.sh
#
# Exit code 0 = persistence guarantee holds, non-zero = broken.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${IRIS_API_PORT:-8080}"
BASE="http://localhost:${PORT}"
SERVICE="iris-api"
USERNAME="admin"
PASSWORD="admin123"

WORKDIR="$(mktemp -d)"
JAR="${WORKDIR}/cookies.txt"
BEFORE="${WORKDIR}/before.json"
AFTER="${WORKDIR}/after.json"

GREEN="\033[0;32m"; RED="\033[0;31m"; BOLD="\033[1m"; DIM="\033[2m"; OFF="\033[0m"

compose() { docker compose "$@"; }
step()  { echo -e "\n${BOLD}▶ $*${OFF}"; }
info()  { echo -e "  ${DIM}$*${OFF}"; }
pass()  { echo -e "${GREEN}✓ $*${OFF}"; }
fail()  { echo -e "${RED}✗ $*${OFF}" >&2; cleanup; exit 1; }

cleanup() {
  info "Cleaning up containers and test volume ..."
  compose down -v >/dev/null 2>&1 || true
  rm -rf "$WORKDIR" 2>/dev/null || true
}
trap 'fail "Aborted unexpectedly."' ERR

wait_for_health() {
  local attempts="${1:-90}"
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "${BASE}/healthz" >/dev/null 2>&1; then
      info "API healthy after ${i}s"
      return 0
    fi
    sleep 1
  done
  fail "API did not become healthy within ${attempts}s"
}

# Logs in and writes the work-orders JSON to $1. Returns 1 if login fails.
snapshot_work_orders() {
  local out="$1"
  local login
  login="$(curl -fsS -c "$JAR" -X POST "${BASE}/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}")"
  if ! grep -q '"success":true' <<<"$login"; then
    return 1
  fi
  curl -fsS -b "$JAR" "${BASE}/work-orders" >"$out"
}

count_orders() { grep -o '"orderNumber"' "$1" 2>/dev/null | wc -l | tr -d ' '; }

# ── 1. Clean start ──────────────────────────────────────────────────────────
step "1/7  Clean start (fresh volume) + build + up"
compose down -v >/dev/null 2>&1 || true
compose up -d --build
wait_for_health

# ── 2. Seed demo data ───────────────────────────────────────────────────────
step "2/7  Seed demo data into SQLite volume"
compose exec -T "$SERVICE" irisctl seed-demo
pass "Seeded"

# ── 3. Snapshot BEFORE ──────────────────────────────────────────────────────
step "3/7  Snapshot work orders (BEFORE update)"
snapshot_work_orders "$BEFORE" || fail "Login/snapshot failed before update."
COUNT_BEFORE="$(count_orders "$BEFORE")"
info "Work orders before: ${COUNT_BEFORE}"
[[ "$COUNT_BEFORE" -gt 0 ]] || fail "Expected seeded work orders, found none."

# ── 4. Simulate a deploy: rebuild image, recreate container, prune ──────────
step "4/7  Simulate code update: rebuild --no-cache, recreate, prune images"
info "Rebuilding image without cache (as if code changed) ..."
compose build --no-cache
info "Recreating container from the new image (named volume is kept) ..."
compose up -d --force-recreate
wait_for_health
info "Pruning unused images / build cache (NOT volumes) ..."
# NOTE: `docker system prune -af` removes ALL unused images on this machine,
# not just Iris ones (this is the realistic CI scenario). Set PRUNE_SCOPE=image
# to only prune dangling Iris layers on a shared dev machine.
if [[ "${PRUNE_SCOPE:-system}" == "image" ]]; then
  docker image prune -f >/dev/null
else
  docker system prune -af >/dev/null
fi
pass "Image updated and old layers pruned"

# ── 5. Snapshot AFTER ───────────────────────────────────────────────────────
step "5/7  Snapshot work orders (AFTER update)"
snapshot_work_orders "$AFTER" || fail "Login/snapshot failed after update (data may be lost)."
COUNT_AFTER="$(count_orders "$AFTER")"
info "Work orders after: ${COUNT_AFTER}"

# ── 6. Assert persistence ───────────────────────────────────────────────────
step "6/7  Assert data persisted across the update"
if [[ "$COUNT_AFTER" -eq "$COUNT_BEFORE" ]] && diff -q "$BEFORE" "$AFTER" >/dev/null; then
  pass "SQLite persisted: ${COUNT_AFTER} work orders identical before and after the rebuild+prune."
else
  fail "Data changed across update (before=${COUNT_BEFORE}, after=${COUNT_AFTER}). Volume persistence is broken."
fi

# ── 7. Negative check: removing the volume wipes the data ───────────────────
step "7/7  Negative check: 'down -v' must wipe the data"
compose down -v >/dev/null 2>&1
compose up -d --build
wait_for_health
if snapshot_work_orders "${WORKDIR}/wiped.json"; then
  fail "Expected empty DB after volume removal, but login still succeeded."
else
  pass "Volume removed -> database empty (login fails). Confirms the volume holds the data."
fi

trap - ERR
cleanup
echo
echo -e "${GREEN}${BOLD}PERSISTENCE GUARANTEE HOLDS${OFF}"
echo "SQLite survives image update + prune; it is wiped only by removing the named volume."
