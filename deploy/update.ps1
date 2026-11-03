# update.ps1
#
# Runs on the client's Windows Server via a Scheduled Task (see
# register-task.ps1). It pulls the latest images from GHCR and recreates the
# containers. State lives in named volumes, so recreating containers does not
# touch the database (SQLite or PostgreSQL).
#
# Run by hand for a manual update, or:
#   Start-ScheduledTask -TaskName IrisAutoUpdate

$ErrorActionPreference = "Stop"

# The deploy directory is the folder this script lives in (it holds
# docker-compose.yml and .env).
$AppDir  = $PSScriptRoot
$LogFile = Join-Path $AppDir "update.log"

function Log($msg) {
    "$(Get-Date -Format o)  $msg" | Tee-Object -FilePath $LogFile -Append
}

# Native commands do not throw on a non-zero exit code in Windows PowerShell,
# so a failed pull would otherwise be logged as a successful update.
function Invoke-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') exited with code $LASTEXITCODE" }
}

try {
    Set-Location $AppDir
    Log "Pulling latest images"
    Invoke-Docker compose pull
    Log "Recreating containers"
    Invoke-Docker compose up -d
    Log "Pruning old images"
    Invoke-Docker image prune -f
    Log "Update complete"
}
catch {
    Log "Update FAILED: $_"
    exit 1
}
