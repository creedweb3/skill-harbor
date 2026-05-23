"""Expand harbor registry from GitHub seed repos (no token for file content)."""

from __future__ import annotations

from typing import Any

from studio import taxonomy
from studio.catalog import CatalogService, _asset_id, _preview
from studio.leaderboards import CURATED_CATEGORY_TO_DOMAIN

REGISTRY_SEED_REPOS: list[tuple[str, str, int]] = [
    ("PatrickJS", "awesome-cursorrules", 22000),
    ("spencerpauly", "awesome-cursor-skills", 500),
    ("sanjeed5", "awesome-cursor-rules-mdc", 800),
    ("anthropics", "skills", 15000),
    ("vercel-labs", "agent-skills", 3000),
    ("vercel-labs", "next-skills", 800),
    ("obra", "superpowers", 4000),
    ("jeffallan", "claude-skills", 600),
    ("supabase", "agent-skills", 1200),
    ("davila7", "claude-code-templates", 1500),
    ("coreyhaines31", "marketingskills", 900),
    ("mblode", "agent-skills", 400),
    ("mcollina", "skills", 300),
    ("pbakaus", "impeccable", 200),
    ("wshobson", "agents", 500),
    ("trailofbits", "skills", 300),
    ("agentsmd", "agents.md", 200),
]


def expand_registry(*, max_files_per_repo: int = 150) -> dict[str, Any]:
    import scrape_cursor_github as scraper

    catalog = CatalogService()
    client = scraper.GitHubClient(None, use_api_metadata=False)
    report = scraper.ScrapeReport(
        generated_at="",
        project_dir="",
        user_cursor_dir="",
        categories_filter=[],
    )
    added = 0
    updated = 0

    for owner, repo, stars_hint in REGISTRY_SEED_REPOS:
        try:
            assets = scraper.extract_assets_from_repo(
                client,
                owner,
                repo,
                stars_hint,
                [],
                report,
                max_files_per_repo,
            )
        except Exception as e:
            report.errors.append(f"{owner}/{repo}: {e}")
            continue

        for asset in assets:
            aid = _asset_id(owner, repo, asset.source_path)
            cat = asset.categories[0] if asset.categories else "fullstack"
            domains = taxonomy.classify_domains(
                asset.content_preview,
                asset.source_path,
                cat,
            )
            for d in asset.categories:
                mapped = CURATED_CATEGORY_TO_DOMAIN.get(d, d)
                if mapped not in domains:
                    domains.append(mapped)

            content = getattr(asset, "_content", "") or ""
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
                "title": asset.install_name.replace("-", " ").title(),
                "install_name": asset.install_name,
                "asset_type": asset.asset_type,
                "category": cat,
                "rank": 99,
                "stars": max(asset.stars, stars_hint),
                "score": asset.score,
                "content_sha256": asset.content_sha256,
                "content": content,
                "content_preview": _preview(content) if content else asset.content_preview,
                "raw_url": asset.raw_url,
                "branch": branch,
                "repo_pushed_at": asset.repo_pushed_at or "",
                "synced_at": "",
                "notes": "",
            }
            existed = catalog.get_asset(aid) is not None
            catalog.upsert_asset(row, domains or [CURATED_CATEGORY_TO_DOMAIN.get(cat, cat)])
            if existed:
                updated += 1
            else:
                added += 1

    return {
        "added": added,
        "updated": updated,
        "errors": report.errors[:20],
        "stats": catalog.stats(),
    }
