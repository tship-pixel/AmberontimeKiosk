@echo off
setlocal
title Amber OnTime - Kiosk Ad Server
cd /d "%~dp0"

echo ========================================================
echo   Amber OnTime Kiosk - Local Ad Server
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found on your system!
    echo Please install Node.js from https://nodejs.org to run the local server.
    echo.
    pause
    exit /b 1
)

echo Starting Ad Server on http://localhost:3000 ...
echo Press Ctrl+C in this window to stop the server at any time.
echo.
node server.js
pause
