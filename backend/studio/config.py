from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

STUDIO_DIR = Path.home() / ".skill-harbor"
LEGACY_STUDIO_DIR = Path.home() / ".cursor-skills-studio"
CONFIG_PATH = STUDIO_DIR / "config.json"
LEGACY_CONFIG_PATH = LEGACY_STUDIO_DIR / "config.json"


def _migrate_legacy_config() -> None:
    if CONFIG_PATH.is_file() or not LEGACY_CONFIG_PATH.is_file():
        return
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LEGACY_CONFIG_PATH, CONFIG_PATH)


def default_project_dir() -> Path:
    return Path.cwd()


def load_config() -> dict[str, Any]:
    _migrate_legacy_config()
    if not CONFIG_PATH.is_file():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_config(data: dict[str, Any]) -> None:
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_project_dir() -> Path:
    cfg = load_config()
    raw = cfg.get("project_dir")
    if raw:
        p = Path(raw)
        if p.is_dir():
            return p.resolve()
    return default_project_dir().resolve()


def set_project_dir(path: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_dir():
        raise ValueError(f"Not a directory: {resolved}")
    cfg = load_config()
    cfg["project_dir"] = str(resolved)
    save_config(cfg)
    return resolved


def get_github_token() -> str | None:
    cfg = load_config()
    token = cfg.get("github_token") or os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    return token or None


def set_github_token(token: str | None) -> None:
    cfg = load_config()
    if token:
        cfg["github_token"] = token.strip()
    else:
        cfg.pop("github_token", None)
    save_config(cfg)
