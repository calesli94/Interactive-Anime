@echo off
chcp 65001 >nul
setlocal
title AI Recruit Assistant Local Server
cd /d "%~dp0local_server"
python -m uvicorn main:app --reload --port 8787
pause
endlocal
