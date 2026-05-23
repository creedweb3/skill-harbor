"""Continuous registry evolution: discover repos, expand, verify, classify, sync."""

from __future__ import annotations

from typing import Any

from studio import taxonomy
from studio.admin_jobs import JobLogger
from studio.app_settings import get_int, get_min_repo_stars
from studio.catalog import CatalogService
from studio.dedupe import dedupe_registry
from studio.discovery_queue import (
    dequeue_pending,
    queue_stats,
    requeue_recrawlable_skipped,
    reset_stale_crawling,
    set_queue_status,
)
from studio.registry_crawl import mark_crawled, should_skip_crawl
from studio.registry_discover import discover_and_enqueue
from studio.registry_refresh import prune_low_star_assets, refresh_repo_stars
from studio import sync as harbor_sync
from studio.safety import purge_unsafe_assets
from studio.database import get_connection
from studio.reclassify import reclassify_registry


def crawl_queue_batch(
    *,
    batch_size: int | None = None,
    force: bool = False,
    job: JobLogger | None = None,
) -> dict[str, Any]:
    """Crawl up to N repos from the discovery queue."""
    reset_stale_crawling()
    requeued = requeue_recrawlable_skipped()
    if job and requeued:
        job.log(f"Re-queued {requeued} previously skipped repos for recrawl.")
    size = batch_size or get_int("crawl_batch_size", get_int("max_repos_per_evolve", 30))
    repos = dequeue_pending(size)
    if not repos:
        if job:
            stats = queue_stats()
            job.log(
                f"No pending repos in queue ({stats.get('pending', 0)} pending). Run Discover first.",
                level="warn",
            )
        return {"repos_processed": 0, "added": 0, "updated": 0, "queue_pending": queue_stats().get("pending", 0)}

    if job:
        job.log(f"Crawling {len(repos)} repos from discovery queue…")

    result = expand_discovered_repos(
        repos,
        max_files_per_repo=get_int("max_files_per_repo_expand", 200),
        force=force,
        job=job,
    )
    result["queue_pending"] = queue_stats().get("pending", 0)
    return result


def expand_discovered_repos(
    repos: list[tuple[str, str, int]],
    *,
    max_files_per_repo: int = 120,
    force: bool = False,
    job: JobLogger | None = None,
) -> dict[str, Any]:
    """Expand each discovered repo into the registry (with safety checks)."""
    import scrape_cursor_github as scraper

    from studio import config
    from studio.catalog import CatalogService, _asset_id, _preview
    from studio.naming import title_for
    from studio.policy import SOURCE_DISCOVERED
    from studio.safety import assess_content_safety

    catalog = CatalogService()
    token = config.get_admin_github_token()
    client = scraper.GitHubClient(token, use_api_metadata=bool(token))
    report = scraper.ScrapeReport("", "", "", [])
    added = 0
    updated = 0
    skipped_unsafe = 0
    skipped_repos = 0
    crawled = 0
    junk_repos = 0

    for owner, repo, stars_hint in repos:
        if job:
            job.check_cancel()
        full = f"{owner}/{repo}"
        skip, reason = should_skip_crawl(owner, repo, force=force)
        if skip:
            skipped_repos += 1
            set_queue_status(owner, repo, "skipped", last_error=reason)
            if job:
                job.log(f"Skipped {full} — {reason}")
            continue

        if job:
            job.log(f"Crawling {full} ({stars_hint:,}★)…")

        try:
            repo_errors_before = len(report.errors)
            assets = scraper.extract_assets_from_repo(
                client,
                owner,
                repo,
                stars_hint,
                [],
                report,
                max_files_per_repo,
            )
            if job and len(assets) == 0:
                new_errs = report.errors[repo_errors_before:]
                if new_errs:
                    job.log(f"  ↷ {full}: crawl issue — {new_errs[-1][:160]}", level="warn")
                else:
                    job.log(
                        f"  ↷ {full}: 0 skill files matched (tree ok — may be link-only awesome list)",
                        level="warn",
                    )
        except Exception as e:
            report.errors.append(f"{owner}/{repo}: {e}")
            set_queue_status(owner, repo, "failed", last_error=str(e))
            if job:
                job.log(f"Failed {full}: {e}", level="error")
            continue

        repo_added = 0
        repo_updated = 0
        for asset in assets:
            content = getattr(asset, "_content", "") or ""
            preview = asset.content_preview or ""
            check = assess_content_safety(content or preview, asset.source_path)
            if not check.safe:
                skipped_unsafe += 1
                continue

            classified = taxonomy.classify_asset(content or preview, asset.source_path)
            tech = taxonomy.classify_tech_tags(content or preview, asset.source_path)
            aid = _asset_id(owner, repo, asset.source_path)
            row = {
                "id": aid,
                "owner": owner,
                "repo": repo,
                "path": asset.source_path,
                "source_repo": full,
                "title": title_for(asset.install_name, asset.source_path),
                "install_name": asset.install_name,
                "asset_type": asset.asset_type,
                "category": classified.primary_domain,
                "rank": 99,
                "stars": max(asset.stars, stars_hint),
                "score": asset.score,
                "content_sha256": asset.content_sha256,
                "content": content,
                "content_preview": _preview(content) if content else preview,
                "raw_url": asset.raw_url,
                "branch": "main",
                "repo_pushed_at": asset.repo_pushed_at or "",
                "synced_at": "",
                "notes": "",
                "source_type": SOURCE_DISCOVERED,
                "primary_domain": classified.primary_domain,
            }
            existed = catalog.get_asset(aid) is not None
            catalog.upsert_asset(
                row,
                primary_domain=classified.primary_domain,
                secondary_domains=classified.secondary_domains,
                tech_tags=tech,
            )
            if existed:
                updated += 1
                repo_updated += 1
            else:
                added += 1
                repo_added += 1

        assets_found = repo_added + repo_updated
        if assets_found == 0:
            junk_repos += 1
            err = "No skill/rule assets ingested"
            if not token:
                err = "No GitHub token — enable tree API for crawls"
            set_queue_status(owner, repo, "skipped", assets_found=0, last_error=err)
        else:
            mark_crawled(owner, repo, stars=stars_hint, assets_found=assets_found)
            set_queue_status(owner, repo, "done", assets_found=assets_found)
            crawled += 1
            if job:
                job.log(f"  ✓ {full}: +{repo_added} new, {repo_updated} updated")

    return {
        "added": added,
        "updated": updated,
        "skipped_unsafe": skipped_unsafe,
        "repos_processed": crawled,
        "repos_skipped": skipped_repos,
        "junk_repos": junk_repos,
        "errors": report.errors[:15],
    }


def evolve_registry(
    *,
    sync: bool = False,
    discover: bool = True,
    force: bool = False,
    maintenance: bool = False,
    job: JobLogger | None = None,
) -> dict[str, Any]:
    """
    Grow the registry: discover → enqueue → crawl queue batch.
    Maintenance steps (stars/prune/dedupe/reclassify/sync) are optional — off by default for speed.
    """
    out: dict[str, Any] = {"steps": []}
    batch = get_int("crawl_batch_size", get_int("max_repos_per_evolve", 30))
    stats_before = queue_stats()

    if job:
        job.log(
            f"Evolve — discover new repos, crawl up to {batch} from queue "
            f"({stats_before.get('pending', 0)} pending). Seeds: use Expand button."
        )

    if discover:
        if job:
            job.step("Discover", message="Searching GitHub (path-focused, paginated)…")
        out["discover"] = discover_and_enqueue(job=job, force=force)
        out["steps"].append("discover")

    if job:
        job.step("Crawl queue", message=f"Crawling up to {batch} queued repos…")
    out["crawl"] = crawl_queue_batch(batch_size=batch, force=force, job=job)
    out["steps"].append("crawl")

    if maintenance:
        if job:
            job.step("Refresh stars", message="Updating star counts…")
        out["stars"] = refresh_repo_stars()
        if job:
            job.log(f"Stars refreshed for {out['stars'].get('repos', 0)} repos.")

        if job:
            job.step("Prune", message="Removing repos below star minimum…")
        out["prune"] = prune_low_star_assets()
        if job:
            job.log(f"Pruned {out['prune'].get('removed', 0)} assets below {get_min_repo_stars():,}★.")

        if job:
            job.step("Safety & dedupe", message="Safety purge and dedupe…")
        out["safety"] = purge_unsafe_assets()
        out["dedupe"] = dedupe_registry()

        if job:
            job.step("Reclassify", message="Reclassifying domains and tags…")
        out["reclassify"] = reclassify_registry()
        out["steps"].append("reclassify")

        if sync:
            if job:
                job.step("Sync content", message="Syncing file content for registry assets…")
            out["sync"] = harbor_sync.sync_catalog(force=False)
            if job:
                job.log(f"Sync done — {out['sync'].get('assets_updated', 0)} assets updated.")
            out["steps"].append("sync")

    out["queue"] = queue_stats()
    out["stats"] = CatalogService().stats()
    with get_connection() as conn:
        unique_repos = conn.execute("SELECT COUNT(DISTINCT source_repo) FROM assets").fetchone()[0]
    out["stats"]["unique_repos"] = int(unique_repos or 0)
    if job:
        s = out["stats"]
        q = out["queue"]
        job.log(
            f"Evolve complete — {s.get('total_assets', '?')} assets, "
            f"{s.get('unique_repos', '?')} repos, {q.get('pending', 0)} still queued."
        )
    return out


def discover_registry(*, force: bool = False, job: JobLogger | None = None) -> dict[str, Any]:
    """Discover-only job — fill the queue without crawling."""
    return discover_and_enqueue(job=job, force=force)
