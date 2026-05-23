"""Sync harbor catalog content from GitHub (raw fetch, no token)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from studio import scraper_bridge, taxonomy
from studio.catalog import CatalogService


def sync_catalog(*, force: bool = False) -> dict[str, Any]:
    import scrape_cursor_github as scraper

    catalog = CatalogService()
    run_id = catalog.start_sync_run()
    client = scraper.GitHubClient(None, use_api_metadata=False)
    errors: list[str] = []
    updated = 0

    for row in catalog.all_asset_rows():
        aid = row["id"]
        if row.get("content") and not force:
            continue
        owner = row["owner"]
        repo = row["repo"]
        path = row["path"]
        branch_hint = row.get("branch") or None
        try:
            text, branch = client.fetch_raw_file(owner, repo, path, branch_hint)
            stars = int(row.get("stars") or 0)
            raw_url = scraper.raw_url(owner, repo, branch, path)
            catalog.update_content(
                aid,
                content=text,
                raw_url=raw_url,
                branch=branch,
                stars=stars,
                repo_pushed_at=row.get("repo_pushed_at") or "",
            )
            domains = taxonomy.classify_domains(text, path, row.get("category"))
            catalog.upsert_asset({**row, "stars": stars}, domains)
            updated += 1
        except Exception as e:
            errors.append(f"{aid}: {e}")

    status = "ok" if not errors else "partial"
    catalog.finish_sync_run(run_id, updated=updated, errors=errors, status=status)
    return {"updated": updated, "errors": errors, "status": status, "run_id": run_id}


def enrich_catalog_assets(
    assets: list[dict[str, Any]], project_dir: Path
) -> list[dict[str, Any]]:
    import scrape_cursor_github as scraper

    scraper_assets: list[scraper.Asset] = []
    for d in assets:
        asset = scraper.Asset(
            source_repo=d.get("source_repo", ""),
            source_path=d.get("source_path", ""),
            asset_type=d.get("asset_type", "skill"),
            categories=d.get("categories") or d.get("domains") or [],
            score=float(d.get("score") or 0),
            stars=int(d.get("stars") or 0),
            content_sha256=d.get("content_sha256", ""),
            content_preview=d.get("content_preview", ""),
            install_name=d.get("install_name", ""),
            raw_url=d.get("raw_url", ""),
            curated=bool(d.get("curated", True)),
            curated_rank=int(d.get("curated_rank") or 99),
            curated_title=d.get("curated_title") or d.get("title", ""),
            repo_pushed_at=d.get("repo_pushed_at", ""),
        )
        content = d.get("content", "")
        if content:
            setattr(asset, "_content", content)
            if not asset.content_sha256:
                import hashlib

                asset.content_sha256 = hashlib.sha256(content.encode("utf-8")).hexdigest()
        scraper_assets.append(asset)
    return scraper_bridge.enrich_assets(scraper_assets, project_dir)
