@echo off
setlocal
title Amber OnTime - Production Kiosk Mode

:: Ensure current working directory is the kiosk folder
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

:: Start local Node.js server in background if not already running on port 3000
netstat -ano | findstr :3000 >nul 2>nul
if %errorlevel% neq 0 (
    echo Starting Amber OnTime Local Kiosk Server...
    start /b "" node server.js >nul 2>nul
    timeout /t 2 /nobreak >nul
)

set "TARGET_URL=http://localhost:3000"

if "%BROWSER%"=="" (
    start "" "%TARGET_URL%"
    exit /b
)

:: Production Touch Kiosk Flags
set FLAGS=--kiosk --disable-pinch --overscroll-history-navigation=0 --disable-features=TouchpadOverscrollHistoryNavigation,OverscrollHistoryNavigation --no-first-run --no-default-browser-check --disable-web-security --user-data-dir="%TEMP%\amber_kiosk_profile"

:: Launch browser in locked fullscreen kiosk mode connecting to local server
start "" "%BROWSER%" %FLAGS% "%TARGET_URL%"
exit /b

