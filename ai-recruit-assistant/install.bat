@echo off
setlocal

REM Install dependencies for AI Recruit Assistant local FastAPI service.
set PROJECT_DIR=%~dp0
set SERVER_DIR=%PROJECT_DIR%local_server

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found. Please install Python 3.10+ and check Add python.exe to PATH.
  pause
  exit /b 1
)

cd /d "%SERVER_DIR%"
echo Installing Python dependencies from requirements.txt ...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo [ERROR] Dependency installation failed.
  pause
  exit /b 1
)

echo Install complete. You can now run start.bat or start_windows.bat.
pause
endlocal
