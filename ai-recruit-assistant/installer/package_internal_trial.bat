@echo off
setlocal
set PROJECT_DIR=%~dp0..
cd /d "%PROJECT_DIR%"
python scripts\package_internal_trial.py
if errorlevel 1 (
  echo [ERROR] Packaging failed.
  pause
  exit /b 1
)
echo Packaging complete. See the release folder.
pause
endlocal
