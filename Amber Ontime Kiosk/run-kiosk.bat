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

set "HTML_FILE=%~dp0index.html"

if "%BROWSER%"=="" (
    start "" "%HTML_FILE%"
    exit /b
)

:: Production Touch Kiosk Flags
set FLAGS=--kiosk --disable-pinch --overscroll-history-navigation=0 --disable-features=TouchpadOverscrollHistoryNavigation,OverscrollHistoryNavigation --no-first-run --no-default-browser-check --disable-web-security --allow-file-access-from-files --user-data-dir="%TEMP%\amber_kiosk_profile"

:: Launch browser in locked fullscreen kiosk mode
start "" "%BROWSER%" %FLAGS% "%HTML_FILE%"
exit /b
