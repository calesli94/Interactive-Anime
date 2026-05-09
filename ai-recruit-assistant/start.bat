@echo off
setlocal

REM Start AI Recruit Assistant local FastAPI service in development mode.
set PROJECT_DIR=%~dp0
set SERVER_DIR=%PROJECT_DIR%local_server

cd /d "%SERVER_DIR%"
echo Starting AI Recruit Assistant local service at http://127.0.0.1:8787 ...
python -m uvicorn main:app --reload --port 8787

endlocal
