from __future__ import annotations

import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STUDIO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPTS = STUDIO_ROOT / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import scrape_cursor_github as scraper  # noqa: E402

from studio import cursor_paths, installed, stars_cache, taxonomy  # noqa: E402

CURATED_PATH = _SCRIPTS / "cursor-curated-skills.json"
CURATED_RULES_PATH = _SCRIPTS / "cursor-curated-rules.json"


def load_all_curated_entries() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for path in (CURATED_PATH, CURATED_RULES_PATH):
        if path.is_file():
            entries.extend(scraper.load_curated_entries(path))
    return entries


def asset_id(asset: scraper.Asset) -> str:
    return f"{asset.source_repo}::{asset.source_path}"


def asset_to_dict(asset: scraper.Asset) -> dict[str, Any]:
    d = asdict(asset)
    d["id"] = asset_id(asset)
    if hasattr(asset, "_domains"):
        d["domains"] = getattr(asset, "_domains")
    if hasattr(asset, "_install_status"):
        d["install_status"] = getattr(asset, "_install_status")
    if hasattr(asset, "_asset_type_label"):
        d["asset_type_label"] = getattr(asset, "_asset_type_label")
    return d


def dict_to_asset(data: dict[str, Any]) -> scraper.Asset:
    fields = {k: v for k, v in data.items() if k not in ("id", "domains", "install_status", "asset_type_label")}
    asset = scraper.Asset(**fields)
    if "_content" in data:
        setattr(asset, "_content", data["_content"])
    return asset


def list_categories() -> list[str]:
    domains = taxonomy.all_domain_categories()
    legacy = list(scraper.CATEGORIES.keys())
    merged = list(dict.fromkeys(domains + legacy))
    return merged


def list_category_meta() -> dict[str, Any]:
    from studio.catalog import CatalogService

    owners = CatalogService().list_repo_owners()
    return {
        "groups": taxonomy.CATEGORY_GROUPS,
        "categories": list_categories(),
        "discovery_professions": taxonomy.DISCOVERY_PROFESSIONS,
        "domain_labels": taxonomy.DOMAIN_LABELS,
        "tech_stack_labels": taxonomy.TECH_STACK_LABELS,
        "repo_owners": owners,
        "curated_help": (
            "Curated = hand-picked from the community manifest (cursor-curated-skills.json), "
            "vetted for quality — not random GitHub search results."
        ),
    }


def enrich_assets(assets: list[scraper.Asset], project_dir: Path) -> list[dict[str, Any]]:
    index = installed.build_install_index(
        cursor_paths.user_cursor_root(),
        cursor_paths.project_cursor_root(project_dir),
    )
    out: list[dict[str, Any]] = []
    for asset in assets:
        text = getattr(asset, "_content", None) or asset.content_preview
        classified = taxonomy.classify_asset(
            text,
            asset.source_path,
            asset.categories[0] if asset.categories else None,
        )
        domains = [classified.primary_domain, *classified.secondary_domains]
        tech = taxonomy.classify_tech_tags(text, asset.source_path)
        setattr(asset, "_domains", domains)
        setattr(asset, "_primary_domain", classified.primary_domain)
        setattr(asset, "_tech_tags", tech)
        asset_type = taxonomy.detect_asset_type(asset.source_path)
        if asset.asset_type != asset_type:
            asset.asset_type = asset_type
        setattr(asset, "_asset_type_label", taxonomy.ASSET_TYPE_LABELS.get(asset_type, asset_type))

        inst = installed.match_asset_install(
            content_sha256=asset.content_sha256,
            install_name=asset.install_name,
            asset_type=asset.asset_type,
            index=index,
        )
        setattr(asset, "_install_status", inst)
        d = asset_to_dict(asset)
        d["domains"] = domains
        d["primary_domain"] = classified.primary_domain
        d["secondary_domains"] = classified.secondary_domains
        d["tech_tags"] = tech
        d["install_status"] = inst
        d["asset_type_label"] = taxonomy.ASSET_TYPE_LABELS.get(asset_type, asset_type)
        out.append(d)
    return out


def run_curated_preview(
    *,
    categories: list[str],
    top_per_category: int = 5,
    token: str | None = None,
    curated_only: bool = True,
    max_per_category: int = 12,
    max_repos_per_query: int = 5,
    max_files_per_repo: int = 20,
    project_dir: Path | None = None,
) -> dict[str, Any]:
    client = scraper.GitHubClient(token, use_api_metadata=bool(token))
    project = project_dir or Path.cwd()
    report = scraper.ScrapeReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        project_dir=str(project),
        user_cursor_dir=str(scraper.user_cursor_dir()),
        categories_filter=categories,
    )

    all_assets: list[scraper.Asset] = []
    filter_set = set(categories) if categories else None

    curated_raw = load_all_curated_entries()
    if curated_raw:
        manifest_cats = taxonomy.expand_category_filter(categories) if categories else []
        picked = scraper.select_curated_entries(curated_raw, manifest_cats, top_per_category)
        all_assets.extend(scraper.fetch_curated_assets(client, picked, report))

    if not curated_only:
        repos = scraper.discover_repos(client, categories, max_repos_per_query, report)
        for owner, repo, stars in repos:
            all_assets.extend(
                scraper.extract_assets_from_repo(
                    client,
                    owner,
                    repo,
                    stars,
                    categories,
                    report,
                    max_files_per_repo,
                )
            )
        merged = scraper.merge_and_dedupe_assets(all_assets)
        assets = scraper.rank_and_cap(merged, max_per_category)
    else:
        assets = scraper.merge_and_dedupe_assets(all_assets)

    unique_repos = sorted({a.source_repo for a in assets})
    stars_cache.hydrate_stars(client, unique_repos)
    for asset in assets:
        cached = stars_cache.get_stars(asset.source_repo)
        if cached is not None:
            asset.stars = cached

    asset_dicts = enrich_assets(assets, project)

    if filter_set:
        asset_dicts = [
            d
            for d in asset_dicts
            if any(x in filter_set for x in d.get("domains", []) + d.get("categories", []))
        ]

    errors = list(report.errors)
    rate_limited = client.rate_limited or any("rate limit" in e.lower() for e in errors)
    if any("abuse detection" in e.lower() for e in errors):
        errors.insert(
            0,
            "GitHub abuse throttle — wait 5–10 minutes. Curated fetch uses raw GitHub, not the API.",
        )
    elif rate_limited and not token:
        errors.insert(
            0,
            "API limit hit. Add a token for star counts & discovery search. Curated files still load without it.",
        )

    return {
        "assets": asset_dicts,
        "repos_scanned": report.repos_scanned,
        "errors": errors,
        "rate_limited": rate_limited,
        "generated_at": report.generated_at,
        "category_meta": list_category_meta(),
    }


def install_assets(
    assets_data: list[dict[str, Any]],
    *,
    install_user: bool,
    install_project: bool,
    project_dir: Path,
    force: bool,
    token: str | None,
) -> dict[str, Any]:
    client = scraper.GitHubClient(token, use_api_metadata=bool(token))
    report = scraper.ScrapeReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        project_dir=str(project_dir),
        user_cursor_dir=str(scraper.user_cursor_dir()),
        categories_filter=[],
    )
    assets = [dict_to_asset(d) for d in assets_data]
    installed = scraper.install_assets(
        assets,
        client,
        install_user=install_user,
        install_project=project_dir if install_project else None,
        force=force,
        report=report,
    )
    return {"installed": installed, "errors": report.errors}
