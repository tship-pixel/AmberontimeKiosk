@echo off
setlocal
title Amber OnTime Kiosk - Windowed Test Mode

cd /d "%~dp0"

:: Locate Google Chrome or Microsoft Edge
set "BROWSER="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "BROWSER=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
) else if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" (
    set "BROWSER=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

set "HTML_FILE=%~dp0index.html"

if "%BROWSER%"=="" (
    start "" "%HTML_FILE%"
    exit /b
)

:: Launch in standard window with touch security flags
start "" "%BROWSER%" --disable-web-security --allow-file-access-from-files --user-data-dir="%TEMP%\amber_kiosk_test" "%HTML_FILE%"
exit /b
