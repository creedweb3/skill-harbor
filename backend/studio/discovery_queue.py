"""Persistent discovery queue — accumulate GitHub repos across evolve runs."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from studio.database import get_connection, row_to_dict


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def priority_score(stars: int, *, query_weight: float = 1.0) -> float:
    return math.log10(max(stars, 1) + 1) * 100.0 * query_weight


def queue_stats() -> dict[str, int]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT status, COUNT(*) AS n
            FROM discovery_queue
            GROUP BY status
            """
        ).fetchall()
    out = {"pending": 0, "crawling": 0, "done": 0, "failed": 0, "skipped": 0, "total": 0}
    for row in rows:
        status = str(row["status"])
        count = int(row["n"])
        if status in out:
            out[status] = count
        out["total"] += count
    return out


def get_query_page(query_key: str) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT page FROM discover_query_cursors WHERE query_key = ?", (query_key,)
        ).fetchone()
    return int(row["page"]) if row else 1


def set_query_page(query_key: str, page: int) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO discover_query_cursors (query_key, page, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(query_key) DO UPDATE SET page = excluded.page, updated_at = excluded.updated_at
            """,
            (query_key, max(1, page), _now_iso()),
        )
        conn.commit()


def enqueue_repo(
    owner: str,
    repo: str,
    stars: int,
    *,
    source_query: str = "",
    query_weight: float = 1.0,
) -> bool:
    """Insert if new. Returns True when a new pending row was added."""
    full = f"{owner}/{repo}"
    now = _now_iso()
    score = priority_score(stars, query_weight=query_weight)
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT status FROM discovery_queue WHERE full_name = ?", (full,)
        ).fetchone()
        if existing:
            status = str(existing["status"])
            if status in ("done", "crawling"):
                return False
            if status == "pending":
                conn.execute(
                    """
                    UPDATE discovery_queue
                    SET stars = CASE WHEN stars < ? THEN ? ELSE stars END,
                        priority_score = CASE WHEN priority_score < ? THEN ? ELSE priority_score END,
                        source_query = CASE WHEN source_query = '' THEN ? ELSE source_query END
                    WHERE full_name = ?
                    """,
                    (stars, stars, score, score, source_query[:500], full),
                )
                conn.commit()
                return False
            # failed/skipped → revive as pending if higher stars
            conn.execute(
                """
                UPDATE discovery_queue
                SET status = 'pending', stars = ?, priority_score = ?, source_query = ?,
                    discovered_at = ?, last_error = '', crawl_attempts = crawl_attempts
                WHERE full_name = ?
                """,
                (stars, score, source_query[:500], now, full),
            )
            conn.commit()
            return True

        conn.execute(
            """
            INSERT INTO discovery_queue
              (full_name, owner, repo, stars, source_query, discovered_at, priority_score, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
            """,
            (full, owner, repo, stars, source_query[:500], now, score),
        )
        conn.commit()
        return True


def dequeue_pending(limit: int = 30) -> list[tuple[str, str, int]]:
    """Mark top pending repos as crawling and return them."""
    limit = max(1, min(limit, 100))
    now = _now_iso()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT full_name, owner, repo, stars
            FROM discovery_queue
            WHERE status = 'pending'
            ORDER BY priority_score DESC, stars DESC, discovered_at ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        if not rows:
            return []
        names = [str(r["full_name"]) for r in rows]
        placeholders = ",".join("?" for _ in names)
        conn.execute(
            f"""
            UPDATE discovery_queue
            SET status = 'crawling', crawl_attempts = crawl_attempts + 1
            WHERE full_name IN ({placeholders})
            """,
            names,
        )
        conn.commit()
    return [(str(r["owner"]), str(r["repo"]), int(r["stars"])) for r in rows]


def set_queue_status(
    owner: str,
    repo: str,
    status: str,
    *,
    assets_found: int = 0,
    last_error: str = "",
) -> None:
    full = f"{owner}/{repo}"
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE discovery_queue
            SET status = ?, assets_found = ?, last_error = ?,
                last_crawled_at = CASE WHEN ? IN ('done', 'skipped', 'failed') THEN ? ELSE last_crawled_at END
            WHERE full_name = ?
            """,
            (status, assets_found, last_error[:1000], status, now, full),
        )
        conn.commit()


def requeue_recrawlable_skipped() -> int:
    """Re-queue repos skipped by outdated path rules or transient API errors."""
    with get_connection() as conn:
        cur = conn.execute(
            """
            UPDATE discovery_queue
            SET status = 'pending', last_error = 'Requeued for recrawl'
            WHERE status = 'skipped'
              AND (
                last_error LIKE '%No skill%'
                OR last_error LIKE '%no skill%'
                OR last_error LIKE '%not a skills repo%'
                OR last_error LIKE '%rate-limit%'
                OR last_error LIKE '%rate limit%'
                OR last_error LIKE '%tree %'
              )
            """
        )
        conn.commit()
        return cur.rowcount


def reset_stale_crawling(limit: int = 50) -> int:
    """Recover repos stuck in 'crawling' after a crash."""
    lim = max(1, min(limit, 500))
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT full_name FROM discovery_queue
            WHERE status = 'crawling'
            LIMIT ?
            """,
            (lim,),
        ).fetchall()
        if not rows:
            return 0
        names = [str(r["full_name"]) for r in rows]
        placeholders = ",".join("?" for _ in names)
        cur = conn.execute(
            f"""
            UPDATE discovery_queue
            SET status = 'pending', last_error = 'Reset after interrupted crawl'
            WHERE full_name IN ({placeholders})
            """,
            names,
        )
        conn.commit()
        return cur.rowcount
