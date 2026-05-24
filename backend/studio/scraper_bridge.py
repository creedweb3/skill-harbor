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

from studio import installed, platform_paths, stars_cache, taxonomy  # noqa: E402
from studio.install_cache import get_install_index  # noqa: E402
from studio.platforms import DEFAULT_PLATFORM_ID, get_platform  # noqa: E402
from studio.platform_write import write_asset_for_platform

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


_ASSET_FIELDS = frozenset(
    {
        "source_repo",
        "source_path",
        "asset_type",
        "categories",
        "score",
        "stars",
        "content_sha256",
        "content_preview",
        "install_name",
        "raw_url",
        "curated",
        "curated_rank",
        "curated_title",
        "repo_pushed_at",
    }
)


def _resolve_content_sha256(data: dict[str, Any], fields: dict[str, Any]) -> str:
    sha = (fields.get("content_sha256") or data.get("content_sha256") or "").strip()
    if sha:
        return sha
    content = data.get("content") or data.get("_content") or ""
    if content:
        return scraper.content_hash(content)
    preview = fields.get("content_preview") or data.get("content_preview") or ""
    if preview:
        return scraper.content_hash(preview)
    return ""


def dict_to_asset(data: dict[str, Any]) -> scraper.Asset:
    fields = {k: v for k, v in data.items() if k in _ASSET_FIELDS}
    if "categories" not in fields:
        fields["categories"] = list(data.get("domains") or data.get("categories") or [])
    fields["content_sha256"] = _resolve_content_sha256(data, fields)
    defaults: dict[str, Any] = {
        "source_repo": "",
        "source_path": "",
        "asset_type": "skill",
        "categories": [],
        "score": 0.0,
        "stars": 0,
        "content_preview": "",
        "install_name": "",
        "raw_url": "",
        "curated": False,
        "curated_rank": 99,
        "curated_title": "",
        "repo_pushed_at": "",
    }
    for key, default in defaults.items():
        fields.setdefault(key, default)
    asset = scraper.Asset(**fields)
    content = data.get("content") or data.get("_content")
    if content:
        setattr(asset, "_content", content)
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


def enrich_assets(
    assets: list[scraper.Asset],
    project_dir: Path,
    platform_id: str = DEFAULT_PLATFORM_ID,
) -> list[dict[str, Any]]:
    index = get_install_index(
        platform_paths.user_root(platform_id),
        platform_paths.project_root(project_dir, platform_id),
    )
    out: list[dict[str, Any]] = []
    for asset in assets:
        text = getattr(asset, "_content", None) or asset.content_preview
        classified = taxonomy.classify_asset(
            text,
            asset.source_path,
            asset.categories[0] if asset.categories else None,
        )
        domains = [classified.primary_domain]
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


def _install_to_platform(
    assets: list[scraper.Asset],
    *,
    client: scraper.GitHubClient,
    install_user: bool,
    install_project: bool,
    project_dir: Path,
    force: bool,
    platform_id: str,
    report: scraper.ScrapeReport,
) -> dict[str, list[str]]:
    from studio.platform_compat import detect_platforms
    from studio.safety import require_safe_for_install

    spec = get_platform(platform_id)
    if spec.status == "planned":
        raise ValueError(f"{spec.label} is not installable yet.")

    bases = platform_paths.get_install_bases(
        platform_id=platform_id,
        install_user=install_user,
        install_project=install_project,
        project_dir=project_dir,
    )
    installed: dict[str, list[str]] = {"user": [], "project": []}

    for asset in assets:
        compatible = detect_platforms(asset.source_path, asset.asset_type)
        if platform_id not in compatible:
            report.errors.append(
                f"skip {asset.install_name} on {spec.label}: not compatible with this asset path"
            )
            continue
        if asset.asset_type not in spec.supported_assets and not (
            asset.asset_type == "agents_md" and "agents_md" in spec.supported_assets
        ):
            report.errors.append(
                f"skip {asset.install_name}: {asset.asset_type} not supported on {spec.label}"
            )
            continue
        text = getattr(asset, "_content", None)
        if text is None:
            try:
                text = client.request_text(asset.raw_url)
            except Exception as e:
                report.errors.append(f"install fetch {asset.raw_url}: {e}")
                continue
        try:
            require_safe_for_install(text, asset.source_path, asset.install_name)
        except ValueError as e:
            report.errors.append(str(e))
            continue
        for scope, base in bases:
            try:
                dest = write_asset_for_platform(asset, text, base, force, platform_id)
                if dest:
                    installed[scope].append(str(dest))
            except Exception as e:
                report.errors.append(f"install {scope} {asset.install_name} ({spec.id}): {e}")

    return installed


def install_assets(
    assets_data: list[dict[str, Any]],
    *,
    install_user: bool,
    install_project: bool,
    project_dir: Path,
    force: bool,
    token: str | None,
    platform_id: str = DEFAULT_PLATFORM_ID,
    platforms: list[str] | None = None,
) -> dict[str, Any]:
    target_platforms = platforms if platforms else [platform_id]
    seen: list[str] = []
    for pid in target_platforms:
        spec = get_platform(pid)
        if spec.id not in seen and spec.status in ("stable", "beta"):
            seen.append(spec.id)

    if not seen:
        raise ValueError("No installable platforms selected")

    client = scraper.GitHubClient(token, use_api_metadata=bool(token))
    report = scraper.ScrapeReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        project_dir=str(project_dir),
        user_cursor_dir=str(platform_paths.user_root(seen[0])),
        categories_filter=[],
    )
    assets = [dict_to_asset(d) for d in assets_data]
    merged: dict[str, list[str]] = {"user": [], "project": []}
    per_platform: dict[str, dict[str, list[str]]] = {}

    for pid in seen:
        try:
            inst = _install_to_platform(
                assets,
                client=client,
                install_user=install_user,
                install_project=install_project,
                project_dir=project_dir,
                force=force,
                platform_id=pid,
                report=report,
            )
            per_platform[pid] = inst
            merged["user"].extend(inst["user"])
            merged["project"].extend(inst["project"])
        except ValueError as e:
            report.errors.append(str(e))

    from studio.install_cache import invalidate_install_index

    invalidate_install_index()
    return {
        "installed": merged,
        "installed_by_platform": per_platform,
        "errors": report.errors,
        "platform": seen[0],
        "platforms": seen,
    }
