#!/usr/bin/env bash
# update.sh — pulls the latest images and recreates the containers.
# Runs nightly from /etc/cron.d/iris (install-cron.sh); run by hand for an
# immediate update. Data lives in named volumes and is not touched.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
log() { echo "$(date -Is)  $*" | tee -a update.log; }
trap 'log "Update FAILED (line $LINENO)"' ERR

log "Pulling latest images"
docker compose pull -q
log "Recreating containers"
docker compose up -d
log "Pruning old images"
docker image prune -f >/dev/null
log "Update complete"
