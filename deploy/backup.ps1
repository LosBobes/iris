# backup.ps1
#
# Nightly PostgreSQL backup for the on-premises install (run by the
# IrisBackup Scheduled Task, see register-task.ps1). It writes a pg_dump
# (custom format) to .\backups, keeps the newest $Keep files, and copies the
# new one to $MirrorDir when that is set.
#
# A backup on the same disk as the database is not a backup: set $MirrorDir
# to a NAS share or another machine (for example \\nas\iris-backups).
#
# Run by hand:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\iris\backup.ps1

param(
    # Override the file name prefix (restore.ps1 uses "pre-restore").
    [string]$Prefix = "iris"
)

$ErrorActionPreference = "Stop"

$AppDir    = $PSScriptRoot
$BackupDir = Join-Path $AppDir "backups"
$LogFile   = Join-Path $AppDir "backup.log"
$Keep      = 14
# TODO: set to an off-machine folder, e.g. "\\nas\iris-backups". Empty = off.
$MirrorDir = ""

function Log($msg) {
    "$(Get-Date -Format o)  $msg" | Tee-Object -FilePath $LogFile -Append
}

function Invoke-Docker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "docker $($args -join ' ') exited with code $LASTEXITCODE" }
}

try {
    Set-Location $AppDir
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

    $Name   = "$Prefix-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
    $Target = Join-Path $BackupDir $Name

    # The dump is written inside the container and copied out with
    # `docker compose cp`. Redirecting pg_dump's stdout (`> file`) would go
    # through PowerShell's text pipeline and corrupt the binary dump.
    Log "Dumping database to $Name"
    Invoke-Docker compose exec -T db pg_dump -U iris -d iris --format=custom -f /tmp/iris-backup.dump
    Invoke-Docker compose cp db:/tmp/iris-backup.dump $Target
    Invoke-Docker compose exec -T db rm -f /tmp/iris-backup.dump

    $Size = (Get-Item $Target).Length
    if ($Size -eq 0) { throw "dump $Name is empty" }
    Log "Wrote $Name ($([math]::Round($Size / 1KB)) KB)"

    if ($Prefix -eq "iris") {
        Get-ChildItem -Path $BackupDir -Filter "iris-*.dump" |
            Sort-Object LastWriteTime -Descending |
            Select-Object -Skip $Keep |
            ForEach-Object { Log "Removing old backup $($_.Name)"; Remove-Item $_.FullName }
    }

    if ($MirrorDir -ne "") {
        Copy-Item -Path $Target -Destination $MirrorDir -Force
        Log "Copied $Name to $MirrorDir"
    }
    Log "Backup complete"
}
catch {
    Log "Backup FAILED: $_"
    exit 1
}
