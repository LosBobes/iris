# restore.ps1
#
# Restores a pg_dump (custom format) into the on-premises PostgreSQL database:
# the cutover from the Hetzner box, or a nightly backup from .\backups.
#
# It REPLACES the data in the database. It first takes a safety dump of the
# current database (backups\pre-restore-*.dump), stops the backend so nothing
# writes during the restore, restores with --clean --if-exists, then starts
# the stack again.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\iris\restore.ps1 -DumpFile C:\apps\iris\iris-cutover.dump

param(
    [Parameter(Mandatory = $true)][string]$DumpFile,
    # Skip the confirmation prompt.
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

$AppDir  = $PSScriptRoot
$LogFile = Join-Path $AppDir "restore.log"

function Log($msg) {
    "$(Get-Date -Format o)  $msg" | Tee-Object -FilePath $LogFile -Append
}

function Invoke-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') exited with code $LASTEXITCODE" }
}

Set-Location $AppDir
$DumpFile = (Resolve-Path $DumpFile).Path

if (-not $Yes) {
    Write-Host "This replaces ALL data in the Iris database with $DumpFile."
    if ((Read-Host "Type RESTORE to continue") -ne "RESTORE") { Write-Host "Cancelled."; exit 1 }
}

try {
    Log "Restore of $DumpFile started"
    Invoke-Docker compose up -d db
    # Wait for Postgres to accept connections (fresh volume: first start runs initdb).
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        & docker compose exec -T db pg_isready -U iris -d iris | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw "PostgreSQL did not become ready" }

    Log "Taking a safety dump of the current database"
    & (Join-Path $AppDir "backup.ps1") -Prefix "pre-restore"
    if ($LASTEXITCODE -ne 0) { throw "safety dump failed; see backup.log" }

    Log "Stopping frontend and backend"
    Invoke-Docker compose stop frontend backend

    Invoke-Docker compose cp $DumpFile db:/tmp/iris-restore.dump
    Log "Restoring"
    Invoke-Docker compose exec -T db pg_restore -U iris -d iris --clean --if-exists --no-owner --exit-on-error /tmp/iris-restore.dump
    Invoke-Docker compose exec -T db rm -f /tmp/iris-restore.dump

    Log "Starting the stack"
    Invoke-Docker compose up -d
    Log "Restore complete. Check: docker compose logs backend"
}
catch {
    Log "Restore FAILED: $_"
    Log "The backend may be stopped. Fix the cause and re-run, or restore the backups\pre-restore-*.dump taken above."
    exit 1
}
