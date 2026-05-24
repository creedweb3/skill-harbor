"""Schema migrations for harbor.db."""

from __future__ import annotations

import sqlite3


def run_migrations(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(assets)").fetchall()}
    if "source_type" not in cols:
        conn.execute(
            "ALTER TABLE assets ADD COLUMN source_type TEXT NOT NULL DEFAULT 'discovered'"
        )
    if "upvotes" not in cols:
        conn.execute("ALTER TABLE assets ADD COLUMN upvotes INTEGER NOT NULL DEFAULT 0")
    if "downvotes" not in cols:
        conn.execute("ALTER TABLE assets ADD COLUMN downvotes INTEGER NOT NULL DEFAULT 0")
    if "primary_domain" not in cols:
        conn.execute(
            "ALTER TABLE assets ADD COLUMN primary_domain TEXT NOT NULL DEFAULT ''"
        )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'ok',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS asset_tech_tags (
            asset_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            PRIMARY KEY (asset_id, tag),
            FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_asset_tech_tags_tag ON asset_tech_tags(tag)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_assets_primary_domain ON assets(primary_domain)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            value_type TEXT NOT NULL DEFAULT 'string',
            description TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_by TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token TEXT PRIMARY KEY,
            admin_user_id INTEGER NOT NULL,
            expires_at REAL NOT NULL,
            FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at)"
    )
    activity_cols = {row[1] for row in conn.execute("PRAGMA table_info(admin_activity)").fetchall()}
    if "progress" not in activity_cols:
        conn.execute(
            "ALTER TABLE admin_activity ADD COLUMN progress INTEGER NOT NULL DEFAULT 0"
        )
    if "step" not in activity_cols:
        conn.execute("ALTER TABLE admin_activity ADD COLUMN step TEXT NOT NULL DEFAULT ''")
    if "finished_at" not in activity_cols:
        conn.execute(
            "ALTER TABLE admin_activity ADD COLUMN finished_at TEXT NOT NULL DEFAULT ''"
        )
    if "logs" not in activity_cols:
        conn.execute(
            "ALTER TABLE admin_activity ADD COLUMN logs TEXT NOT NULL DEFAULT '[]'"
        )
    if "result_json" not in activity_cols:
        conn.execute(
            "ALTER TABLE admin_activity ADD COLUMN result_json TEXT NOT NULL DEFAULT ''"
        )
    if "meta_json" not in activity_cols:
        conn.execute(
            "ALTER TABLE admin_activity ADD COLUMN meta_json TEXT NOT NULL DEFAULT '{}'"
        )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS repo_crawl_state (
            full_name TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            repo TEXT NOT NULL,
            stars INTEGER NOT NULL DEFAULT 0,
            assets_found INTEGER NOT NULL DEFAULT 0,
            last_crawled_at TEXT NOT NULL,
            last_pushed_at TEXT NOT NULL DEFAULT '',
            crawl_status TEXT NOT NULL DEFAULT 'ok'
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_repo_crawl_last ON repo_crawl_state(last_crawled_at DESC)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS discovery_queue (
            full_name TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            repo TEXT NOT NULL,
            stars INTEGER NOT NULL DEFAULT 0,
            source_query TEXT NOT NULL DEFAULT '',
            discovered_at TEXT NOT NULL,
            priority_score REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            last_error TEXT NOT NULL DEFAULT '',
            crawl_attempts INTEGER NOT NULL DEFAULT 0,
            assets_found INTEGER NOT NULL DEFAULT 0,
            last_crawled_at TEXT NOT NULL DEFAULT ''
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_discovery_queue_status ON discovery_queue(status, priority_score DESC)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS discover_query_cursors (
            query_key TEXT PRIMARY KEY,
            page INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS asset_platforms (
            asset_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            PRIMARY KEY (asset_id, platform),
            FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_asset_platforms_platform ON asset_platforms(platform)"
    )
    conn.commit()
