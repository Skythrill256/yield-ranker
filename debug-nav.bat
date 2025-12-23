@echo off
REM Batch script to debug NAV trends - works from any directory
REM Usage: debug-nav.bat UTG

setlocal

REM Get the script directory
set "SCRIPT_DIR=%~dp0"

REM Check if we're in the root or server directory
if exist "%SCRIPT_DIR%server\scripts\debug_nav_trend.ts" (
    set "SERVER_DIR=%SCRIPT_DIR%server"
) else if exist "%SCRIPT_DIR%scripts\debug_nav_trend.ts" (
    set "SERVER_DIR=%SCRIPT_DIR%"
) else (
    echo Error: Could not find debug_nav_trend.ts script
    echo Please run this from the project root or server directory
    exit /b 1
)

REM Change to server directory
pushd "%SERVER_DIR%"

if "%1"=="" (
    echo Usage: debug-nav.bat ^<TICKER^>
    echo Example: debug-nav.bat UTG
    popd
    exit /b 1
)

echo Running NAV trend debug for: %1
echo Working directory: %SERVER_DIR%
echo.

npx tsx scripts/debug_nav_trend.ts %1

popd

