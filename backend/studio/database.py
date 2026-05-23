"""SQLite persistence for Skill Harbor catalog."""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from studio import config
from studio.db_config import resolve_sqlite_path
from studio.migrate import run_migrations

_schema_lock = threading.Lock()
_schema_initialized = False


def get_db_path() -> Path:
    return resolve_sqlite_path()


# Backward-compatible module attribute (resolved at import; restart after URL change)
DB_PATH = get_db_path()


def get_min_repo_stars() -> int:
    from studio.app_settings import get_min_repo_stars as _g

    return _g()

SCHEMA = """
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    path TEXT NOT NULL,
    source_repo TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    install_name TEXT NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'skill',
    category TEXT NOT NULL DEFAULT '',
    rank INTEGER NOT NULL DEFAULT 99,
    stars INTEGER NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0,
    content_sha256 TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    content_preview TEXT NOT NULL DEFAULT '',
    raw_url TEXT NOT NULL DEFAULT '',
    branch TEXT NOT NULL DEFAULT 'main',
    repo_pushed_at TEXT NOT NULL DEFAULT '',
    synced_at TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL DEFAULT 'discovered',
    upvotes INTEGER NOT NULL DEFAULT 0,
    downvotes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_domains (
    asset_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    PRIMARY KEY (asset_id, domain),
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_votes (
    asset_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (asset_id, voter_id),
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    CHECK (vote IN (-1, 1))
);

CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'running',
    assets_updated INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_assets_stars ON assets(stars DESC);
CREATE INDEX IF NOT EXISTS idx_assets_rank ON assets(rank ASC);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_asset_domains_domain ON asset_domains(domain);
"""


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()
    run_migrations(conn)
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_assets_source ON assets(source_type)")
        conn.commit()
    except sqlite3.OperationalError:
        pass


def configure_sqlite(conn: sqlite3.Connection) -> None:
    """Per-connection pragmas — WAL allows API reads during registry job writes."""
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 30000")


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Run DDL/migrations once per process (not on every HTTP poll or log line)."""
    global _schema_initialized
    if _schema_initialized:
        return
    with _schema_lock:
        if _schema_initialized:
            return
        init_schema(conn)
        _schema_initialized = True


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    config.STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    configure_sqlite(conn)
    ensure_schema(conn)
    try:
        yield conn
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)
