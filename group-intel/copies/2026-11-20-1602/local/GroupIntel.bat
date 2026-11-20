@echo off
rem Double-click to launch the desktop client (opens its own app window).
chcp 65001 >nul
cd /d %~dp0
set SERVER=%1
set PORT=%2

where python >nul 2>nul
if %errorlevel%==0 (
  if "%SERVER%"=="" ( python launcher.py ) else ( python launcher.py --server %SERVER% --port %PORT% )
  exit /b
)
where py >nul 2>nul
if %errorlevel%==0 (
  if "%SERVER%"=="" ( py launcher.py ) else ( py launcher.py --server %SERVER% --port %PORT% )
  exit /b
)
echo Python 3 not found. Install it first, or just open http://%SERVER%:%PORT% in your browser.
pause
