"""Build internal trial distributables for AI Recruit Assistant.

Outputs:
- release/AIRecruitAssistant-plugin-v<version>.zip: Chrome/Edge extension package.
- release/AIRecruitAssistant-internal-trial-v<version>.zip: plugin + local server + launch scripts.
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import zipfile

PROJECT_DIR = Path(__file__).resolve().parents[1]
PLUGIN_DIR = PROJECT_DIR / "plugin"
SERVER_DIR = PROJECT_DIR / "local_server"
RELEASE_DIR = PROJECT_DIR / "release"

PLUGIN_FILES = ["manifest.json", "popup.html", "popup.js", "content.js", "styles.css"]
SERVER_FILES = [
    "config.py",
    "db.py",
    "main.py",
    "requirements.txt",
    "run_server.py",
]
SERVICE_DIRS = ["services"]
ROOT_FILES = ["README.md", "start_local_server.py", "start_windows.bat"]
DOC_FILES = ["INTERNAL_TRIAL_USER_MANUAL.md"]


def manifest_version() -> str:
    data = json.loads((PLUGIN_DIR / "manifest.json").read_text(encoding="utf-8"))
    return str(data.get("version") or "0.1.0")


def add_file(zf: zipfile.ZipFile, src: Path, arcname: str) -> None:
    zf.write(src, arcname)


def build_plugin_zip(version: str) -> Path:
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)
    out = RELEASE_DIR / f"AIRecruitAssistant-plugin-v{version}.zip"
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in PLUGIN_FILES:
            add_file(zf, PLUGIN_DIR / name, name)
    return out


def build_internal_zip(version: str, plugin_zip: Path) -> Path:
    out = RELEASE_DIR / f"AIRecruitAssistant-internal-trial-v{version}.zip"
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        add_file(zf, plugin_zip, f"release/{plugin_zip.name}")
        for name in ROOT_FILES:
            add_file(zf, PROJECT_DIR / name, name)
        for name in DOC_FILES:
            add_file(zf, PROJECT_DIR / "docs" / name, f"docs/{name}")
        for name in SERVER_FILES:
            add_file(zf, SERVER_DIR / name, f"local_server/{name}")
        for dirname in SERVICE_DIRS:
            for path in (SERVER_DIR / dirname).rglob("*.py"):
                add_file(zf, path, f"local_server/{dirname}/{path.name}")
        for name in PLUGIN_FILES:
            add_file(zf, PLUGIN_DIR / name, f"plugin/{name}")
    return out


def main() -> None:
    version = manifest_version()
    if not PLUGIN_DIR.exists():
        raise SystemExit(f"Missing plugin dir: {PLUGIN_DIR}")
    if not SERVER_DIR.exists():
        raise SystemExit(f"Missing local_server dir: {SERVER_DIR}")
    plugin_zip = build_plugin_zip(version)
    internal_zip = build_internal_zip(version, plugin_zip)
    print(f"Built plugin package: {plugin_zip.relative_to(PROJECT_DIR)}")
    print(f"Built internal trial package: {internal_zip.relative_to(PROJECT_DIR)}")


if __name__ == "__main__":
    main()
