#!/usr/bin/env bash
# install-cron.sh — installs /etc/cron.d/iris for the on-premises VM:
#   02:15  backup.sh  (pg_dump)
#   03:00  update.sh  (pull new images, recreate)
# Run once with sudo from the deploy directory; re-running replaces the file.
set -euo pipefail
dir="$(dirname "$(readlink -f "$0")")"
cat > /etc/cron.d/iris <<CRON
# Installed by $dir/install-cron.sh. Logs: $dir/backup.log, $dir/update.log
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 2 * * * root $dir/backup.sh >/dev/null 2>&1
0 3 * * * root $dir/update.sh >/dev/null 2>&1
CRON
chmod 644 /etc/cron.d/iris
echo "Installed /etc/cron.d/iris:"
cat /etc/cron.d/iris
