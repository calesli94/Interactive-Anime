@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "local_server" (
  echo ERROR: local_server not found.
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: python not found.
  pause
  exit /b 1
)

cd /d "%~dp0local_server"
python -m pip install --upgrade pip
if errorlevel 1 (
  echo ERROR: pip upgrade failed.
  pause
  exit /b 1
)

python -m pip install -r requirements.txt
if errorlevel 1 (
  echo ERROR: requirements install failed.
  pause
  exit /b 1
)

echo Install complete. Run start.bat.
pause
endlocal
