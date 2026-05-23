"""Database environment: dev (local SQLite) vs prod (remote URL).

Development (default):
  SKILL_HARBOR_ENV=development
  → ~/.cursor-skills-studio/harbor.db

Production (future / optional now):
  SKILL_HARBOR_ENV=production
  SKILL_HARBOR_DATABASE_URL=postgresql://user:pass@host:5432/harbor
  → remote PostgreSQL (driver support planned; use SQLite URL for single-node prod)

SQLite file in prod (single server):
  SKILL_HARBOR_DATABASE_URL=sqlite:////var/lib/harbor/harbor.db
"""

from __future__ import annotations

import os
from enum import Enum
from pathlib import Path

from studio import config


class HarborEnv(str, Enum):
    DEVELOPMENT = "development"
    PRODUCTION = "production"


def get_harbor_env() -> HarborEnv:
    raw = (os.environ.get("SKILL_HARBOR_ENV") or "development").strip().lower()
    if raw in ("prod", "production"):
        return HarborEnv.PRODUCTION
    return HarborEnv.DEVELOPMENT


def get_database_url() -> str | None:
    """Explicit URL wins. None = default local SQLite path."""
    url = (os.environ.get("SKILL_HARBOR_DATABASE_URL") or "").strip()
    return url or None


def resolve_sqlite_path() -> Path:
    """Resolve SQLite file path from env or default studio dir."""
    url = get_database_url()
    if url:
        if url.startswith("sqlite:///"):
            path_part = url[len("sqlite:///") :]
            if path_part.startswith("/") or (len(path_part) > 1 and path_part[1] == ":"):
                return Path(path_part)
            return Path(path_part)
        if url.startswith("postgresql://") or url.startswith("postgres://"):
            raise NotImplementedError(
                "PostgreSQL is not wired yet. For production today use "
                "SKILL_HARBOR_DATABASE_URL=sqlite:////absolute/path/harbor.db "
                "or keep SKILL_HARBOR_ENV=development. Full Postgres support is next."
            )
        raise ValueError(f"Unsupported SKILL_HARBOR_DATABASE_URL: {url[:32]}…")
    return config.STUDIO_DIR / "harbor.db"


def database_info() -> dict[str, str]:
    path = resolve_sqlite_path()
    env = get_harbor_env()
    url = get_database_url()
    return {
        "environment": env.value,
        "engine": "sqlite",
        "database_url_set": str(bool(url)),
        "path": str(path),
        "mode": "remote-ready" if env == HarborEnv.PRODUCTION else "local",
    }
