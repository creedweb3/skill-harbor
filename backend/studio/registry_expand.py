"""Expand harbor registry from GitHub seed repos (no token for file content)."""

from __future__ import annotations

from typing import Any

from studio import taxonomy
from studio.catalog import CatalogService, _asset_id, _preview
from studio.naming import title_for
from studio.policy import SOURCE_CUSTOM, SOURCE_DISCOVERED
from studio.app_settings import get_min_repo_stars
from studio.safety import assess_content_safety

# Star hints for seeding — repos below MIN_REPO_STARS (5000) are skipped on expand
REGISTRY_SEED_REPOS: list[tuple[str, str, int]] = [
    ("anthropics", "skills", 140_000),
    ("mattpocock", "skills", 102_000),
    ("VoltAgent", "awesome-openclaw-skills", 49_000),
    ("PatrickJS", "awesome-cursorrules", 22_000),
    ("openai", "skills", 20_000),
    ("vercel-labs", "skills", 20_000),
    ("vercel-labs", "agent-skills", 27_000),
    ("MiniMax-AI", "skills", 12_000),
    ("obra", "superpowers", 12_000),
    ("jeffallan", "claude-skills", 9_000),
]


def expand_registry(
    *,
    max_files_per_repo: int = 150,
    force: bool = False,
    job: Any | None = None,
) -> dict[str, Any]:
    import scrape_cursor_github as scraper

    from studio import config

    catalog = CatalogService()
    token = config.get_admin_github_token()
    client = scraper.GitHubClient(token, use_api_metadata=bool(token))
    report = scraper.ScrapeReport(
        generated_at="",
        project_dir="",
        user_cursor_dir="",
        categories_filter=[],
    )
    added = 0
    updated = 0

    from studio.stars_cache import get_stars, hydrate_stars, set_stars

    repo_full_names = [f"{o}/{r}" for o, r, _ in REGISTRY_SEED_REPOS]
    hydrate_stars(client, repo_full_names, max_fetches=50)

    from studio.registry_crawl import mark_crawled, should_skip_crawl

    for owner, repo, stars_hint in REGISTRY_SEED_REPOS:
        if job:
            job.check_cancel()
        if stars_hint < get_min_repo_stars():
            continue
        full_name = f"{owner}/{repo}"
        skip, reason = should_skip_crawl(owner, repo, force=force)
        if skip:
            if job:
                job.log(f"Seed skip {full_name} — {reason}")
            continue
        live_stars = get_stars(full_name)
        if live_stars is None and getattr(client, "use_api_metadata", False):
            try:
                meta = client.repo_meta(owner, repo)
                live_stars = int(meta.get("stargazers_count") or stars_hint)
                set_stars(full_name, live_stars)
            except Exception:
                live_stars = stars_hint
        repo_stars = int(live_stars if live_stars is not None else stars_hint)
        if job:
            job.log(f"Seed crawl {full_name} ({repo_stars:,}★)…")
        try:
            assets = scraper.extract_assets_from_repo(
                client,
                owner,
                repo,
                repo_stars,
                [],
                report,
                max_files_per_repo,
            )
        except Exception as e:
            report.errors.append(f"{owner}/{repo}: {e}")
            continue

        repo_added = 0
        repo_updated = 0
        for asset in assets:
            content = getattr(asset, "_content", "") or ""
            preview = asset.content_preview or ""
            safety = assess_content_safety(content or preview, asset.source_path)
            if not safety.safe:
                continue

            aid = _asset_id(owner, repo, asset.source_path)
            cat = asset.categories[0] if asset.categories else "fullstack"
            classified = taxonomy.classify_asset(
                content or preview,
                asset.source_path,
                cat,
            )
            tech = taxonomy.classify_tech_tags(
                content or preview,
                asset.source_path,
            )

            if not content:
                try:
                    content, branch = client.fetch_raw_file(owner, repo, asset.source_path)
                    asset.raw_url = scraper.raw_url(owner, repo, branch, asset.source_path)
                except Exception:
                    branch = "main"
            else:
                branch = "main"

            row = {
                "id": aid,
                "owner": owner,
                "repo": repo,
                "path": asset.source_path,
                "source_repo": f"{owner}/{repo}",
                "title": title_for(asset.install_name, asset.source_path),
                "install_name": asset.install_name,
                "asset_type": asset.asset_type,
                "category": cat,
                "rank": 99,
                "stars": max(asset.stars, repo_stars),
                "score": asset.score,
                "content_sha256": asset.content_sha256,
                "content": content,
                "content_preview": _preview(content) if content else asset.content_preview,
                "raw_url": asset.raw_url,
                "branch": branch,
                "repo_pushed_at": asset.repo_pushed_at or "",
                "synced_at": "",
                "notes": "",
                "source_type": SOURCE_DISCOVERED,
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

        mark_crawled(owner, repo, stars=repo_stars, assets_found=repo_added + repo_updated)
        if job:
            job.log(f"  ✓ {full_name}: +{repo_added} new, {repo_updated} updated")

    from studio.registry_refresh import prune_low_star_assets
    from studio.dedupe import dedupe_registry

    prune = prune_low_star_assets()
    dedupe = dedupe_registry()
    return {
        "added": added,
        "updated": updated,
        "pruned": prune.get("removed", 0),
        "dedupe": dedupe,
        "errors": report.errors[:20],
        "stats": catalog.stats(),
    }


def import_custom_repo(repo_url: str) -> dict[str, Any]:
    """Import a repo by GitHub URL — exempt from 5k★ minimum (custom source)."""
    import re

    import scrape_cursor_github as scraper

    url = repo_url.strip()
    m = re.search(r"github\.com[/:]([^/]+)/([^/?.#]+)", url, re.I)
    if not m:
        raise ValueError("Expected GitHub URL like https://github.com/owner/repo")
    owner, repo = m.group(1), m.group(2).removesuffix(".git")

    catalog = CatalogService()
    client = scraper.GitHubClient(None, use_api_metadata=False)
    report = scraper.ScrapeReport("", "", "", [])
    stars_hint = 0
    token = __import__("studio.config", fromlist=["config"]).get_admin_github_token()
    if token:
        try:
            meta = scraper.GitHubClient(token, use_api_metadata=True).repo_meta(owner, repo)
            stars_hint = int(meta.get("stargazers_count") or 0)
        except Exception:
            pass

    assets = scraper.extract_assets_from_repo(
        client, owner, repo, stars_hint, [], report, 200
    )
    added = 0
    for asset in assets:
        aid = _asset_id(owner, repo, asset.source_path)
        content = getattr(asset, "_content", "") or ""
        row = {
            "id": aid,
            "owner": owner,
            "repo": repo,
            "path": asset.source_path,
            "source_repo": f"{owner}/{repo}",
            "title": title_for(asset.install_name, asset.source_path),
            "install_name": asset.install_name,
            "asset_type": asset.asset_type,
            "category": asset.categories[0] if asset.categories else "fullstack",
            "rank": 99,
            "stars": max(stars_hint, asset.stars),
            "score": asset.score,
            "content_sha256": asset.content_sha256,
            "content": content,
            "content_preview": _preview(content) if content else asset.content_preview,
            "raw_url": asset.raw_url,
            "branch": "main",
            "repo_pushed_at": "",
            "synced_at": "",
            "notes": "custom import",
            "source_type": SOURCE_CUSTOM,
        }
        classified = taxonomy.classify_asset(
            content or asset.content_preview, asset.source_path, row["category"]
        )
        tech = taxonomy.classify_tech_tags(content or asset.content_preview, asset.source_path)
        catalog.upsert_asset(
            row,
            primary_domain=classified.primary_domain,
            secondary_domains=classified.secondary_domains,
            tech_tags=tech,
        )
        added += 1

    from studio.registry_crawl import mark_crawled

    mark_crawled(owner, repo, stars=max(stars_hint, 0), assets_found=added, status="custom")
    return {"owner": owner, "repo": repo, "added": added, "errors": report.errors[:5], "stats": catalog.stats()}
