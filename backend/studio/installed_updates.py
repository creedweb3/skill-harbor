"""Detect registry updates for installed Cursor skills/rules."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from studio import cursor_paths, installed
from studio.database import get_connection


def content_hash(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text.strip())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def _match_registry_row(
    *,
    name: str,
    asset_type: str,
    local_hash: str,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM assets
            WHERE install_name = ? AND asset_type = ?
            ORDER BY stars DESC LIMIT 1
            """,
            (name, asset_type),
        ).fetchone()
        if row:
            return dict(row)
        if local_hash:
            rows = conn.execute(
                "SELECT * FROM assets WHERE content != '' ORDER BY stars DESC"
            ).fetchall()
            for row in rows:
                reg_content = row["content"] or ""
                if reg_content and content_hash(reg_content) == local_hash:
                    return dict(row)
    return None


def check_installed_updates(project_dir: Path) -> list[dict[str, Any]]:
    user_root = cursor_paths.user_cursor_root()
    project_root = cursor_paths.project_cursor_root(project_dir)
    index = installed.build_install_index(user_root, project_root)
    updates: list[dict[str, Any]] = []

    for scope_data in (index["user"], index["project"]):
        for key, entry in scope_data["by_name"].items():
            asset_type, name = key.split(":", 1)
            local_hash = entry.get("hash", "")
            path = Path(entry.get("path", ""))
            local_text = installed.read_file(path) if path else None
            if local_text:
                local_hash = content_hash(local_text)

            row = _match_registry_row(name=name, asset_type=asset_type, local_hash=local_hash)
            if not row:
                continue
            reg_content = row.get("content") or row.get("content_preview") or ""
            if not reg_content.strip():
                continue
            reg_hash = content_hash(reg_content)
            if reg_hash == local_hash:
                continue
            updates.append(
                {
                    "name": name,
                    "scope": entry["scope"],
                    "asset_type": asset_type,
                    "local_hash": local_hash,
                    "registry_hash": reg_hash,
                    "registry_asset_id": row["id"],
                    "registry_title": row.get("title") or name,
                    "source_repo": row.get("source_repo", ""),
                    "stars": int(row.get("stars") or 0),
                }
            )
    return updates
