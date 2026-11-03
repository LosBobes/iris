#!/usr/bin/env bash
# backup.sh — nightly pg_dump of the Iris database (from /etc/cron.d/iris).
# Writes backups/iris-YYYYMMDD-HHMMSS.dump (custom format), keeps the newest
# $KEEP, and copies the new file to $MIRROR_DIR when that is set.
#
# A backup on the VM's own disk is not a backup: point MIRROR_DIR at an
# off-machine folder, e.g. the NAS share mounted at /mnt/iris-backups (VM.md).
#
#   ./backup.sh            nightly backup
#   ./backup.sh pre-restore  safety copy (restore.sh), never pruned
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

PREFIX="${1:-iris}"
KEEP=14
# TODO: set to the mounted off-machine folder, e.g. /mnt/iris-backups. Empty = off.
MIRROR_DIR=""

log() { echo "$(date -Is)  $*" | tee -a backup.log; }
trap 'log "Backup FAILED (line $LINENO)"' ERR

mkdir -p backups
name="$PREFIX-$(date +%Y%m%d-%H%M%S).dump"
tmp="backups/.$name.partial"
log "Dumping database to $name"
docker compose exec -T db pg_dump -U iris -d iris --format=custom > "$tmp"
[ -s "$tmp" ] || { log "Backup FAILED: $name is empty"; rm -f "$tmp"; exit 1; }
mv "$tmp" "backups/$name"
log "Wrote $name ($(du -k "backups/$name" | cut -f1) KB)"

if [ "$PREFIX" = "iris" ]; then
  ls -1t backups/iris-*.dump | tail -n +$((KEEP + 1)) | while read -r old; do
    log "Removing old backup $old"; rm -f "$old"
  done
fi

if [ -n "$MIRROR_DIR" ]; then
  # A share that is not mounted would silently fill the local disk instead.
  mountpoint -q "$MIRROR_DIR" || { log "Backup FAILED: $MIRROR_DIR is not mounted"; exit 1; }
  cp "backups/$name" "$MIRROR_DIR/"
  log "Copied $name to $MIRROR_DIR"
fi
log "Backup complete"
