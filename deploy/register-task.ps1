# register-task.ps1
#
# Registers the two Windows Scheduled Tasks for the on-premises install:
#   IrisAutoUpdate  daily 03:00  update.ps1  (pull new images, recreate)
#   IrisBackup      daily 02:15  backup.ps1  (pg_dump; PostgreSQL installs)
#
# Run it once, elevated (Administrator), SIGNED IN AS THE ACCOUNT THAT RUNS
# DOCKER DESKTOP (the one Windows signs in automatically after a reboot).
# Docker Desktop's engine and CLI context belong to that user; a task running
# as SYSTEM cannot reliably reach it. The tasks therefore run as that user,
# only while it is signed in, which with automatic sign-in is always.
#
# Re-running replaces both tasks. Pass -NoBackup on a SQLite install.

param([switch]$NoBackup)

$AppDir = $PSScriptRoot
$User   = "$env:USERDOMAIN\$env:USERNAME"

$Principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Highest
$Settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

function Register($Name, $Script, $At, $Description) {
    $Action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AppDir\$Script`""
    $Trigger = New-ScheduledTaskTrigger -Daily -At $At
    Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger `
        -Principal $Principal -Settings $Settings -Description $Description -Force | Out-Null
    Write-Host "Registered $Name ($Script daily at $At, as $User)"
}

Register "IrisAutoUpdate" "update.ps1" "3:00am" "Pulls and redeploys the latest Iris app images"
if (-not $NoBackup) {
    Register "IrisBackup" "backup.ps1" "2:15am" "Nightly pg_dump of the Iris database"
}
