@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python dashboard\server.py --open
) else (
  python3 dashboard\server.py --open
)
pause
