from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any

STUDIO_DIR = Path.home() / ".cursor-skills-studio"
CONFIG_DIR = STUDIO_DIR
CONFIG_PATH = STUDIO_DIR / "config.json"


def default_project_dir() -> Path:
    return Path.cwd()


def load_config() -> dict[str, Any]:
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


def get_admin_github_token() -> str | None:
    cfg = load_config()
    token = (
        cfg.get("admin_github_token")
        or os.environ.get("SKILL_HARBOR_ADMIN_TOKEN")
        or os.environ.get("SKILL_HARBOR_ADMIN_GITHUB_TOKEN")
    )
    return token or None


def set_admin_github_token(token: str | None) -> None:
    cfg = load_config()
    if token:
        cfg["admin_github_token"] = token.strip()
    else:
        cfg.pop("admin_github_token", None)
    save_config(cfg)


def get_admin_username() -> str:
    return (
        os.environ.get("SKILL_HARBOR_ADMIN_USER")
        or load_config().get("admin_username")
        or "admin"
    )


def get_admin_password_salt() -> str:
    cfg = load_config()
    salt = cfg.get("admin_password_salt")
    if not salt:
        salt = os.urandom(16).hex()
        cfg["admin_password_salt"] = salt
        save_config(cfg)
    return str(salt)


def set_admin_password(password: str) -> None:
    cfg = load_config()
    get_admin_password_salt()
    cfg["admin_password_hash"] = hashlib.sha256(
        f"{cfg['admin_password_salt']}:{password}".encode("utf-8")
    ).hexdigest()
    save_config(cfg)


def get_last_stars_refresh() -> float | None:
    raw = load_config().get("stars_last_refreshed_at")
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def set_last_stars_refresh(ts: float | None = None) -> None:
    cfg = load_config()
    cfg["stars_last_refreshed_at"] = ts if ts is not None else time.time()
    save_config(cfg)


def get_last_stars_refresh_iso() -> str | None:
    ts = get_last_stars_refresh()
    if not ts:
        return None
    from datetime import datetime, timezone

    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
