"""Audit log for admin registry operations."""

from __future__ import annotations

from typing import Any

from studio.admin_jobs import _enrich
from studio.database import get_connection, row_to_dict
from studio.safety import sanitize_for_log


def log_activity(action: str, detail: str = "", *, status: str = "ok") -> int:
    safe_detail = sanitize_for_log(detail)[:2000]
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO admin_activity (action, detail, status, progress, logs, finished_at)
            VALUES (?, ?, ?, 100, '[]', datetime('now'))
            """,
            (action, safe_detail, status),
        )
        conn.commit()
        return int(cur.lastrowid)


def list_activity(limit: int = 50) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, action, detail, status, created_at, progress, step, finished_at, logs, meta_json, result_json
            FROM admin_activity
            ORDER BY
              CASE WHEN status = 'running' THEN 0 ELSE 1 END,
              id DESC
            LIMIT ?
            """,
            (max(1, min(limit, 200)),),
        ).fetchall()
    return [_enrich(row_to_dict(r) or {}) for r in rows]
