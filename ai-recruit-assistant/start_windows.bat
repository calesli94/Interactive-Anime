@echo off
setlocal

REM AI Recruit Assistant internal trial one-click launcher.
REM It creates a local virtual environment, installs FastAPI dependencies,
REM and starts the local service at http://127.0.0.1:8787.

set PROJECT_DIR=%~dp0
set SERVER_DIR=%PROJECT_DIR%local_server
set VENV_DIR=%PROJECT_DIR%.venv

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found. Please install Python 3.10+ from https://www.python.org/downloads/
  echo Make sure to check "Add python.exe to PATH" during installation.
  pause
  exit /b 1
)

if not exist "%VENV_DIR%\Scripts\python.exe" (
  echo [1/3] Creating virtual environment...
  python -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment.
    pause
    exit /b 1
  )
)

echo [2/3] Installing/updating dependencies...
"%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip
"%VENV_DIR%\Scripts\python.exe" -m pip install -r "%SERVER_DIR%\requirements.txt"
if errorlevel 1 (
  echo [ERROR] Dependency installation failed.
  pause
  exit /b 1
)

echo [3/3] Starting AI Recruit Assistant local service...
echo Service URL: http://127.0.0.1:8787
echo Swagger UI : http://127.0.0.1:8787/docs
echo Press Ctrl+C to stop the service.
cd /d "%SERVER_DIR%"
"%VENV_DIR%\Scripts\python.exe" run_server.py

endlocal
