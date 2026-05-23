"""Admin registry refresh: stars update, prune, expand, sync."""

from __future__ import annotations

from typing import Any

from studio import config
from studio.catalog import CatalogService
from studio.app_settings import get_min_repo_stars
from studio.database import get_connection
from studio.policy import SOURCE_CUSTOM
from studio import sync as harbor_sync
from studio.dedupe import dedupe_registry
from studio.registry_expand import expand_registry


def refresh_repo_stars() -> dict[str, Any]:
    import scrape_cursor_github as scraper

    token = config.get_admin_github_token()
    if not token:
        return {"updated": 0, "skipped": True, "reason": "No admin token"}

    client = scraper.GitHubClient(token, use_api_metadata=True)
    catalog = CatalogService()
    updated = 0
    errors: list[str] = []

    repos: set[tuple[str, str]] = set()
    for row in catalog.all_asset_rows():
        repos.add((row["owner"], row["repo"]))

    from studio.stars_cache import set_stars

    star_by_repo: dict[str, int] = {}
    for owner, repo in repos:
        full = f"{owner}/{repo}"
        try:
            meta = client.repo_meta(owner, repo)
            stars = int(meta.get("stargazers_count") or 0)
            star_by_repo[full] = stars
            set_stars(full, stars)
        except Exception as e:
            errors.append(f"{full}: {e}")

    with get_connection() as conn:
        for full, stars in star_by_repo.items():
            conn.execute(
                "UPDATE assets SET stars = ? WHERE source_repo = ?",
                (stars, full),
            )
            updated += conn.execute(
                "SELECT changes()"
            ).fetchone()[0] or 0
        conn.commit()

    if star_by_repo:
        config.set_last_stars_refresh()

    return {
        "repos": len(star_by_repo),
        "rows_touched": updated,
        "errors": errors[:10],
        "refreshed_at": config.get_last_stars_refresh_iso(),
    }


def prune_low_star_assets() -> dict[str, Any]:
    with get_connection() as conn:
        before = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        conn.execute(
            """
            DELETE FROM assets
            WHERE stars < ? AND source_type != ?
            """,
            (get_min_repo_stars(), SOURCE_CUSTOM),
        )
        removed = before - conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        conn.commit()
    return {"removed": removed, "min_stars": get_min_repo_stars()}


def admin_refresh_registry(*, expand: bool = True, sync: bool = True, evolve: bool = False) -> dict[str, Any]:
    if evolve:
        from studio.registry_evolve import evolve_registry

        return evolve_registry(sync=sync, discover=True)

    out: dict[str, Any] = {}
    if expand:
        out["expand"] = expand_registry(max_files_per_repo=150)
    out["stars"] = refresh_repo_stars()
    out["prune"] = prune_low_star_assets()
    from studio.safety import purge_unsafe_assets
    from studio.reclassify import reclassify_registry

    out["safety"] = purge_unsafe_assets()
    out["dedupe"] = dedupe_registry()
    out["reclassify"] = reclassify_registry()
    if sync:
        out["sync"] = harbor_sync.sync_catalog(force=False)
    out["stats"] = CatalogService().stats()
    return out
