# update.ps1
#
# Runs on the client's Windows Server via a Scheduled Task (see
# register-task.ps1). It pulls the latest images from GHCR and recreates the
# containers. State lives in named volumes, so recreating containers does not
# touch the SQLite data.
#
# Run by hand for a manual update, or:
#   Start-ScheduledTask -TaskName IrisAutoUpdate

$ErrorActionPreference = "Stop"

# TODO: set this to the deploy directory on the client server (the folder that
# holds docker-compose.yml and these scripts).
$AppDir  = "C:\apps\iris"
$LogFile = Join-Path $AppDir "update.log"

function Log($msg) {
    "$(Get-Date -Format o)  $msg" | Tee-Object -FilePath $LogFile -Append
}

try {
    Set-Location $AppDir
    Log "Pulling latest images"
    docker compose pull
    Log "Recreating containers"
    docker compose up -d
    Log "Pruning old images"
    docker image prune -f
    Log "Update complete"
}
catch {
    Log "Update FAILED: $_"
    exit 1
}
