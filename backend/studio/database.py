"""SQLite persistence for Skill Harbor catalog."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from studio import config

DB_PATH = config.STUDIO_DIR / "harbor.db"

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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_domains (
    asset_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    PRIMARY KEY (asset_id, domain),
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
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


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    config.STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    init_schema(conn)
    try:
        yield conn
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)
