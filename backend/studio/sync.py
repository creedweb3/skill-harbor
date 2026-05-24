"""Sync harbor catalog content from GitHub (raw fetch, no token)."""

from __future__ import annotations

import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

from studio import platform_paths
from studio.catalog import CatalogService
from studio.install_cache import get_install_index
from studio.safety import sanitize_for_log


def sync_catalog(*, force: bool = False, max_workers: int = 12) -> dict[str, Any]:
    import scrape_cursor_github as scraper

    catalog = CatalogService()
    run_id = catalog.start_sync_run()
    client = scraper.GitHubClient(None, use_api_metadata=False)
    errors: list[str] = []
    updated = 0

    rows = [r for r in catalog.all_asset_rows() if force or not r.get("content")]
    if not rows:
        catalog.finish_sync_run(run_id, updated=0, errors=[], status="ok")
        return {"updated": 0, "errors": [], "status": "ok", "run_id": run_id, "skipped": True}

    def _sync_one(row: dict[str, Any]) -> tuple[str, bool, str | None]:
        aid = row["id"]
        try:
            text, branch = client.fetch_raw_file(
                row["owner"],
                row["repo"],
                row["path"],
                row.get("branch") or None,
            )
            stars = int(row.get("stars") or 0)
            raw_url = scraper.raw_url(row["owner"], row["repo"], branch, row["path"])
            catalog.update_content(
                aid,
                content=text,
                raw_url=raw_url,
                branch=branch,
                stars=stars,
                repo_pushed_at=row.get("repo_pushed_at") or "",
            )
            return aid, True, None
        except Exception as e:
            return aid, False, str(e)

    workers = min(max_workers, max(1, len(rows)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(_sync_one, row) for row in rows]
        for fut in as_completed(futures):
            aid, ok, err = fut.result()
            if ok:
                updated += 1
            elif err:
                errors.append(f"{aid}: {sanitize_for_log(err)}")

    status = "ok" if not errors else "partial"
    catalog.finish_sync_run(run_id, updated=updated, errors=errors, status=status)
    return {
        "updated": updated,
        "errors": errors,
        "status": status,
        "run_id": run_id,
        "pending": len(rows),
    }


def enrich_install_status(
    assets: list[dict[str, Any]],
    project_dir: Path,
    platform_id: str,
) -> list[dict[str, Any]]:
    """Fast path: add install_status only (no re-classify, no full content)."""
    from studio import config
    from studio.installed import match_asset_install

    plat = platform_id or config.get_default_platform()
    user = platform_paths.user_root(plat)
    proj = platform_paths.project_root(project_dir, plat)
    index = get_install_index(user, proj)

    out: list[dict[str, Any]] = []
    for d in assets:
        row = dict(d)
        preview = row.get("content_preview") or ""
        sha = row.get("content_sha256") or ""
        if not sha and preview:
            sha = hashlib.sha256(preview.encode("utf-8")).hexdigest()[:16]
        inst = match_asset_install(
            content_sha256=sha,
            install_name=row.get("install_name", ""),
            asset_type=row.get("asset_type", "skill"),
            index=index,
        )
        row["install_status"] = inst
        out.append(row)
    return out


def enrich_catalog_assets(
    assets: list[dict[str, Any]],
    project_dir: Path,
    platform_id: str | None = None,
    *,
    full: bool = False,
) -> list[dict[str, Any]]:
    from studio import config

    plat = platform_id or config.get_default_platform()
    if not full:
        return enrich_install_status(assets, project_dir, plat)

    from studio import scraper_bridge

    scraper_assets = [scraper_bridge.dict_to_asset(d) for d in assets]
    return scraper_bridge.enrich_assets(scraper_assets, project_dir, platform_id=plat)
