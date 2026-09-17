@echo off
setlocal
title Amber OnTime Kiosk - Windowed Test Mode

cd /d "%~dp0"

:: Start local Node.js server in background if not already running on port 3000
netstat -ano | findstr :3000 >nul 2>nul
if %errorlevel% neq 0 (
    echo Starting Amber OnTime Local Kiosk Server...
    start /b "" node server.js >nul 2>nul
    timeout /t 2 /nobreak >nul
)

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

if "%BROWSER%"=="" (
    start "" "http://localhost:3000"
    exit /b
)

:: Launch in standard window with touch security flags
start "" "%BROWSER%" --disable-web-security --user-data-dir="%TEMP%\amber_kiosk_test" "http://localhost:3000"
exit /b

