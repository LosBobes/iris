#!/usr/bin/env bash
# restore.sh — loads a pg_dump (custom format) into the Iris database: the
# cutover from Hetzner, or a backup from backups/.
#
# It REPLACES all data. It first takes a safety dump of the current database
# (backups/pre-restore-*.dump), stops the backend so nothing writes, restores
# with --clean --if-exists, then starts the stack again. Safe to re-run.
#
#   ./restore.sh /opt/iris/iris-cutover.dump [--yes]
set -euo pipefail
dump="$(readlink -f "${1:?usage: restore.sh <file.dump> [--yes]}")"
cd "$(dirname "$(readlink -f "$0")")"
[ -s "$dump" ] || { echo "No such dump: $dump"; exit 1; }

log() { echo "$(date -Is)  $*" | tee -a restore.log; }
trap 'log "Restore FAILED (line $LINENO). The backend may be stopped: fix the cause and re-run, or restore the backups/pre-restore-*.dump taken above."' ERR

if [ "${2:-}" != "--yes" ]; then
  echo "This replaces ALL data in the Iris database with $dump."
  read -r -p "Type RESTORE to continue: " answer
  [ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }
fi

log "Restore of $dump started"
docker compose up -d db
for _ in $(seq 60); do
  docker compose exec -T db pg_isready -U iris -d iris >/dev/null 2>&1 && break
  sleep 2
done
docker compose exec -T db pg_isready -U iris -d iris >/dev/null

log "Taking a safety dump of the current database"
./backup.sh pre-restore

log "Stopping frontend and backend"
docker compose stop frontend backend

log "Restoring"
docker compose exec -T db pg_restore -U iris -d iris --clean --if-exists --no-owner --exit-on-error < "$dump"

log "Starting the stack"
docker compose up -d
log "Restore complete. Check: docker compose ps; docker compose logs backend"
