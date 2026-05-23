"""Registry and engagement analytics for the admin dashboard."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from studio.app_settings import get_min_repo_stars
from studio.database import get_db_path, get_connection, row_to_dict
from studio.catalog import CatalogService


def _rows(conn, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    return [row_to_dict(r) or {} for r in conn.execute(sql, params).fetchall()]


def get_dashboard() -> dict[str, Any]:
    catalog = CatalogService()
    base_stats = catalog.stats()

    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        synced = conn.execute(
            "SELECT COUNT(*) FROM assets WHERE content != ''"
        ).fetchone()[0]
        repos = conn.execute(
            "SELECT COUNT(DISTINCT source_repo) FROM assets"
        ).fetchone()[0]
        custom = conn.execute(
            "SELECT COUNT(*) FROM assets WHERE source_type = 'custom'"
        ).fetchone()[0]
        below_min = conn.execute(
            "SELECT COUNT(*) FROM assets WHERE stars < ? AND source_type != 'custom'",
            (get_min_repo_stars(),),
        ).fetchone()[0]

        vote_totals = row_to_dict(
            conn.execute(
                """
                SELECT
                    COALESCE(SUM(upvotes), 0) AS upvotes,
                    COALESCE(SUM(downvotes), 0) AS downvotes
                FROM assets
                """
            ).fetchone()
        ) or {"upvotes": 0, "downvotes": 0}
        unique_voters = conn.execute(
            "SELECT COUNT(DISTINCT voter_id) FROM asset_votes"
        ).fetchone()[0]
        total_votes = conn.execute("SELECT COUNT(*) FROM asset_votes").fetchone()[0]

        by_type = _rows(
            conn,
            """
            SELECT asset_type AS label, COUNT(*) AS value
            FROM assets GROUP BY asset_type ORDER BY value DESC
            """,
        )
        by_source = _rows(
            conn,
            """
            SELECT source_type AS label, COUNT(*) AS value
            FROM assets GROUP BY source_type ORDER BY value DESC
            """,
        )
        top_repos = _rows(
            conn,
            """
            SELECT source_repo AS label, COUNT(*) AS assets, MAX(stars) AS stars
            FROM assets GROUP BY source_repo ORDER BY assets DESC LIMIT 10
            """,
        )
        top_domains = _rows(
            conn,
            """
            SELECT d.domain AS label, COUNT(*) AS value
            FROM asset_domains d
            GROUP BY d.domain ORDER BY value DESC LIMIT 12
            """,
        )
        top_voted = _rows(
            conn,
            """
            SELECT id, title, install_name, source_repo,
                   upvotes, downvotes,
                   (upvotes - downvotes) AS score
            FROM assets
            WHERE upvotes + downvotes > 0
            ORDER BY score DESC, upvotes DESC
            LIMIT 10
            """,
        )
        growth = _rows(
            conn,
            """
            SELECT date(created_at) AS label, COUNT(*) AS value
            FROM assets
            WHERE created_at IS NOT NULL AND created_at != ''
            GROUP BY date(created_at)
            ORDER BY label DESC
            LIMIT 14
            """,
        )
        growth.reverse()

        sync_history = _rows(
            conn,
            """
            SELECT id, started_at, finished_at, status,
                   assets_updated, error_count, message
            FROM sync_runs ORDER BY id DESC LIMIT 12
            """,
        )

    db_path = get_db_path()
    db_bytes = db_path.stat().st_size if db_path.is_file() else 0
    sync_pct = round((synced / total * 100) if total else 0, 1)

    from studio.discovery_queue import queue_stats

    q = queue_stats()

    return {
        "kpis": {
            "total_assets": total,
            "synced_content": synced,
            "sync_coverage_pct": sync_pct,
            "unique_repos": repos,
            "queue_pending": q.get("pending", 0),
            "queue_total": q.get("total", 0),
            "custom_imports": custom,
            "below_min_stars": below_min,
            "min_repo_stars": get_min_repo_stars(),
            "total_upvotes": int(vote_totals["upvotes"] or 0),
            "total_downvotes": int(vote_totals["downvotes"] or 0),
            "unique_voters": unique_voters,
            "total_vote_records": total_votes,
            "db_size_mb": round(db_bytes / (1024 * 1024), 2),
        },
        "charts": {
            "by_asset_type": by_type,
            "by_source_type": by_source,
            "top_repos": top_repos,
            "top_domains": top_domains,
            "registry_growth": growth,
        },
        "top_voted": top_voted,
        "sync_history": sync_history,
        "last_sync": base_stats.get("last_sync"),
        "db_path": str(db_path),
    }
