@echo off
setlocal
chcp 65001 >nul

title AI Recruit Assistant Installer
set "PROJECT_DIR=%~dp0"
set "SERVER_DIR=%PROJECT_DIR%local_server"

echo ================================================
echo   AI Recruit Assistant - 一键安装
echo ================================================
echo.

echo [1/4] 检查 Python ...
where python >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Python。
  echo 请安装 Python 3.10 或以上版本，并勾选 Add python.exe to PATH。
  echo 下载地址：https://www.python.org/downloads/
  pause
  exit /b 1
)
python --version
if errorlevel 1 (
  echo [错误] Python 无法运行，请检查安装和 PATH。
  pause
  exit /b 1
)

echo.
echo [2/4] 进入本地服务目录 ...
if not exist "%SERVER_DIR%" (
  echo [错误] 未找到 local_server 目录：%SERVER_DIR%
  pause
  exit /b 1
)
cd /d "%SERVER_DIR%"

echo.
echo [3/4] 升级 pip ...
python -m pip install --upgrade pip
if errorlevel 1 (
  echo [错误] pip 升级失败，请检查网络或 Python 安装。
  pause
  exit /b 1
)

echo.
echo [4/4] 安装依赖 requirements.txt ...
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo [错误] 依赖安装失败，请复制本窗口错误信息给技术同学。
  pause
  exit /b 1
)

echo.
echo ================================================
echo 安装完成，请双击 start.bat 启动服务。
echo ================================================
pause
endlocal
