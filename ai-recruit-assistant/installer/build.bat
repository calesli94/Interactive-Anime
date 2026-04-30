@echo off
setlocal

REM Build Windows executable for AI Recruit Assistant local server
set PROJECT_ROOT=%~dp0..\
set SERVER_DIR=%PROJECT_ROOT%local_server
set DIST_DIR=%~dp0dist

cd /d %SERVER_DIR%

echo [1/4] Installing dependencies...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller

echo [2/4] Cleaning old build artifacts...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist AIRecruitAssistant.spec del /f /q AIRecruitAssistant.spec

echo [3/4] Building AIRecruitAssistant.exe ...
pyinstaller --noconfirm --onefile --name AIRecruitAssistant --add-data "data;data" run_server.py

echo [4/4] Copying output...
if not exist %DIST_DIR% mkdir %DIST_DIR%
copy /y dist\AIRecruitAssistant.exe %DIST_DIR%\AIRecruitAssistant.exe

if exist %DIST_DIR%\AIRecruitAssistant.exe (
  echo Build success: %DIST_DIR%\AIRecruitAssistant.exe
) else (
  echo Build failed.
  exit /b 1
)

endlocal
pause
