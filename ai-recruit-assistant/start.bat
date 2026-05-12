@echo off
setlocal
chcp 65001 >nul

title AI Recruit Assistant Local Server
set "PROJECT_DIR=%~dp0"
set "SERVER_DIR=%PROJECT_DIR%local_server"

echo ================================================
echo   AI Recruit Assistant Local Server
echo ================================================
echo 请不要关闭此窗口。
echo 服务启动后可访问：
echo   http://127.0.0.1:8787/health
echo   http://127.0.0.1:8787/dashboard
echo ================================================
echo.

if not exist "%SERVER_DIR%" (
  echo [错误] 未找到 local_server 目录：%SERVER_DIR%
  pause
  exit /b 1
)

cd /d "%SERVER_DIR%"
python -m uvicorn main:app --reload --port 8787

echo.
echo 服务已停止。如需继续使用，请重新双击 start.bat。
pause
endlocal
