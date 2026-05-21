@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

python --version
python -m pip --version

if not exist "local_server" (
  echo ERROR: local_server not found.
) else (
  echo OK: local_server found.
)

if not exist "local_server\requirements.txt" (
  echo ERROR: requirements.txt not found.
) else (
  echo OK: requirements.txt found.
)

if not exist "local_server\main.py" (
  echo ERROR: main.py not found.
) else (
  echo OK: main.py found.
)

if not exist "local_server\data" (
  mkdir "local_server\data"
  echo OK: data directory created.
) else (
  echo OK: data directory found.
)

pause
endlocal
