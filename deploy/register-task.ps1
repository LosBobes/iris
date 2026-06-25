# register-task.ps1
#
# Registers the Windows Scheduled Task that runs update.ps1 once a day.
# Run this once, elevated (Administrator), on the client's Windows Server.
#
# The task runs as SYSTEM so it works with no user logged in, which is what
# you want on an unattended server.

# TODO: set this to the deploy directory on the client server (must match the
# $AppDir in update.ps1).
$AppDir = "C:\apps\iris"

$Action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$AppDir\update.ps1`""
$Trigger   = New-ScheduledTaskTrigger -Daily -At 3am
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" `
    -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "IrisAutoUpdate" -Action $Action `
    -Trigger $Trigger -Principal $Principal `
    -Description "Pulls and redeploys the latest Iris app images"
