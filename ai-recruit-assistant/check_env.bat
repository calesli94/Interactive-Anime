@echo off
setlocal
chcp 65001 >nul

title AI Recruit Assistant Environment Check
set "PROJECT_DIR=%~dp0"
set "SERVER_DIR=%PROJECT_DIR%local_server"
set "DB_FILE=%SERVER_DIR%\data\recruitment.db"
set "HAS_ERROR=0"

echo ================================================
echo   AI Recruit Assistant - 环境检查
echo ================================================
echo.

echo [1/5] 检查 Python 版本 ...
where python >nul 2>nul
if errorlevel 1 (
  echo [失败] 未找到 Python。请安装 Python 3.10+ 并勾选 Add python.exe to PATH。
  set "HAS_ERROR=1"
) else (
  python --version
  echo [通过] Python 可用。
)

echo.
echo [2/5] 检查 pip ...
python -m pip --version >nul 2>nul
if errorlevel 1 (
  echo [失败] pip 不可用。请重新安装 Python 或运行 python -m ensurepip。
  set "HAS_ERROR=1"
) else (
  python -m pip --version
  echo [通过] pip 可用。
)

echo.
echo [3/5] 检查 requirements 是否已安装 ...
if not exist "%SERVER_DIR%\requirements.txt" (
  echo [失败] 未找到 requirements.txt。
  set "HAS_ERROR=1"
) else (
  cd /d "%SERVER_DIR%"
  python -c "import fastapi, uvicorn, pydantic, multipart; print('fastapi/uvicorn/pydantic/python-multipart 已安装')" >nul 2>nul
  if errorlevel 1 (
    echo [失败] 依赖未完整安装。请双击 install.bat。
    set "HAS_ERROR=1"
  ) else (
    echo [通过] requirements 关键依赖已安装。
  )
)

echo.
echo [4/5] 检查 8787 端口 ...
netstat -ano | findstr ":8787" >nul 2>nul
if errorlevel 1 (
  echo [通过] 8787 端口当前未被占用，可启动服务。
) else (
  echo [提示] 8787 端口已有进程占用。如果服务正常运行，这是正常现象；如果启动失败，请关闭旧 start.bat 窗口后重试。
)

echo.
echo [5/5] 检查数据库文件 ...
if exist "%DB_FILE%" (
  echo [通过] 已找到数据库：%DB_FILE%
) else (
  echo [提示] 数据库暂不存在。首次启动 start.bat 后会自动生成：%DB_FILE%
)

echo.
echo ================================================
if "%HAS_ERROR%"=="0" (
  echo 环境检查完成：未发现阻塞问题。
) else (
  echo 环境检查完成：存在失败项，请按提示处理。
)
echo ================================================
pause
endlocal
