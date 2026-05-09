"""Start the AI Recruit Assistant local FastAPI service.

This script is intended for internal trial installs where Python is available.
Run from the repository root or from the ai-recruit-assistant directory:

    python start_local_server.py
"""

from pathlib import Path
import os
import sys

PROJECT_DIR = Path(__file__).resolve().parent
SERVER_DIR = PROJECT_DIR / "local_server"

if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

os.chdir(SERVER_DIR)

from run_server import main  # noqa: E402


if __name__ == "__main__":
    main()
