"""Track per-repo crawl state — avoid re-crawling the same repo every evolve run."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from studio.app_settings import get_int
from studio.database import get_connection, row_to_dict


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hours_since(iso_ts: str) -> float | None:
    if not iso_ts:
        return None
    try:
        ts = iso_ts.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
    except ValueError:
        return None


def get_crawl_state(full_name: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM repo_crawl_state WHERE full_name = ?", (full_name,)
        ).fetchone()
    return row_to_dict(row)


def list_crawl_states(*, limit: int = 500) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM repo_crawl_state
            ORDER BY last_crawled_at DESC
            LIMIT ?
            """,
            (max(1, min(limit, 2000)),),
        ).fetchall()
    return [row_to_dict(r) or {} for r in rows]


def should_skip_crawl(
    owner: str,
    repo: str,
    *,
    force: bool = False,
    cooldown_hours: int | None = None,
) -> tuple[bool, str]:
    """Return (skip, reason). Seeds and discovered repos share the same cooldown."""
    if force:
        return False, ""
    full = f"{owner}/{repo}"
    row = get_crawl_state(full)
    if not row:
        return False, ""
    hours = cooldown_hours if cooldown_hours is not None else get_int("crawl_cooldown_hours", 168)
    elapsed = _hours_since(str(row.get("last_crawled_at") or ""))
    if elapsed is None:
        return False, ""
    if elapsed < hours:
        ago = int(elapsed) if elapsed >= 1 else 1
        unit = "hour" if ago == 1 else "hours"
        if ago >= 48:
            ago = int(elapsed / 24)
            unit = "day" if ago == 1 else "days"
        return True, f"last crawled {ago} {unit} ago"
    return False, ""


def mark_crawled(
    owner: str,
    repo: str,
    *,
    stars: int = 0,
    assets_found: int = 0,
    pushed_at: str = "",
    status: str = "ok",
) -> None:
    full = f"{owner}/{repo}"
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO repo_crawl_state
              (full_name, owner, repo, stars, assets_found, last_crawled_at, last_pushed_at, crawl_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(full_name) DO UPDATE SET
              stars = excluded.stars,
              assets_found = excluded.assets_found,
              last_crawled_at = excluded.last_crawled_at,
              last_pushed_at = CASE WHEN excluded.last_pushed_at != '' THEN excluded.last_pushed_at ELSE repo_crawl_state.last_pushed_at END,
              crawl_status = excluded.crawl_status
            """,
            (full, owner, repo, stars, assets_found, now, pushed_at or "", status),
        )
        conn.commit()


def repos_in_registry() -> set[str]:
    with get_connection() as conn:
        rows = conn.execute("SELECT DISTINCT source_repo FROM assets").fetchall()
    return {str(r[0]) for r in rows if r[0]}
