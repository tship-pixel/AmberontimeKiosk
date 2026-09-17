$wsh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "Amber OnTime Kiosk.lnk"

# Target Launch Kiosk.vbs to run server and kiosk in background
$scriptDir = (Get-Location).Path
$vbsPath = Join-Path $scriptDir "Launch Kiosk.vbs"

# Detect icon from Chrome or Edge
$iconPath = ""
if (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") {
    $iconPath = "C:\Program Files\Google\Chrome\Application\chrome.exe,0"
} elseif (Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") {
    $iconPath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe,0"
} elseif (Test-Path "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") {
    $iconPath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe,0"
} elseif (Test-Path "C:\Program Files\Microsoft\Edge\Application\msedge.exe") {
    $iconPath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe,0"
}

$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $scriptDir
if ($iconPath) {
    $shortcut.IconLocation = $iconPath
}
$shortcut.Description = "Amber OnTime Kiosk"
$shortcut.Save()

Write-Host "Success: Desktop shortcut created at $shortcutPath pointing to $vbsPath"

