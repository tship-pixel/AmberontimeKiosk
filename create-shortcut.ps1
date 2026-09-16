$wsh = New-Object -ComObject WScript.Shell
$desktop = [System.Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "Amber OnTime Kiosk.lnk"

# Detect Chrome or Edge
$browser = ""
if (Test-Path "C:\Program Files\Google\Chrome\Application\chrome.exe") {
    $browser = "C:\Program Files\Google\Chrome\Application\chrome.exe"
} elseif (Test-Path "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe") {
    $browser = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
} elseif (Test-Path "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe") {
    $browser = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
} elseif (Test-Path "C:\Program Files\Microsoft\Edge\Application\msedge.exe") {
    $browser = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
}

$htmlPath = (Resolve-Path "index.html").Path
$userProfile = "$env:TEMP\amber_kiosk_profile"
$args = "--kiosk --disable-pinch --overscroll-history-navigation=0 --disable-features=TouchpadOverscrollHistoryNavigation,OverscrollHistoryNavigation --no-first-run --no-default-browser-check --disable-web-security --allow-file-access-from-files --user-data-dir=`"$userProfile`" `"$htmlPath`""

$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $browser
$shortcut.Arguments = $args
$shortcut.WorkingDirectory = (Get-Location).Path
$shortcut.IconLocation = "$browser,0"
$shortcut.Description = "Amber OnTime Kiosk"
$shortcut.Save()

Write-Host "Success: Desktop shortcut created at $shortcutPath"
