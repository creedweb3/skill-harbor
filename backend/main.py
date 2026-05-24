"""
Skill Harbor — multi-platform agent skills marketplace API.

Run: uvicorn main:app --reload --port 8765
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from studio import config, export_import, leaderboards, platform_paths, platforms, scraper_bridge
from studio.admin_activity import list_activity, log_activity
from studio.admin_analytics import get_dashboard
from studio.admin_auth import (
    SESSION_COOKIE,
    create_session_for_user,
    destroy_session,
    require_admin,
    session_info,
)
from studio.catalog import CatalogService
from studio.app_settings import get_min_repo_stars
from studio.bootstrap import bootstrap_harbor
from studio.database import get_connection, get_db_path
from studio.db_config import database_info
from studio import sync as harbor_sync

app = FastAPI(
    title="Skill Harbor",
    description=(
        "By Devs, For Devs — agent skills marketplace for Cursor, Claude, Codex, "
        "Gemini, Antigravity, and more"
    ),
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

catalog = CatalogService()


def _discovery_bootstrap_payload() -> dict[str, Any]:
    from studio.discovery_config import get_discovery_ui, resolve_profession_domains

    cfg = get_discovery_ui()
    return {"config": cfg, "profession_domains": resolve_profession_domains(cfg)}


@app.on_event("startup")
def on_startup() -> None:
    catalog.ensure_seeded()
    bootstrap_harbor()
    _maybe_refresh_stars_background()

    def _deferred_maint() -> None:
        import threading

        def _run() -> None:
            try:
                with get_connection() as conn:
                    platform_rows = conn.execute(
                        "SELECT COUNT(*) FROM asset_platforms"
                    ).fetchone()[0]
                if platform_rows == 0:
                    catalog.backfill_platforms()
            except Exception:
                pass

        threading.Thread(target=_run, daemon=True).start()

    _deferred_maint()


def _maybe_refresh_stars_background() -> None:
    import threading

    def _run() -> None:
        import time

        if not config.get_admin_github_token():
            return
        last = config.get_last_stars_refresh()
        if last and time.time() - last < 86400:
            return
        try:
            from studio.registry_refresh import refresh_repo_stars

            refresh_repo_stars()
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True).start()


class SettingsUpdate(BaseModel):
    project_dir: str | None = None
    default_platform: str | None = None
    platform_mode: str | None = Field(default=None, pattern="^(auto|manual)$")
    extra_install_platforms: list[str] | None = None


class AdminLoginBody(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class AdminGithubTokenBody(BaseModel):
    admin_github_token: str | None = None


class RegistrySettingsBody(BaseModel):
    min_repo_stars: int | None = Field(default=None, ge=100, le=500_000)
    max_files_per_repo_expand: int | None = Field(default=None, ge=10, le=500)
    discover_max_per_skills_query: int | None = Field(default=None, ge=1, le=100)
    discover_max_per_domain_query: int | None = Field(default=None, ge=1, le=100)


class DiscoveryUiBody(BaseModel):
    discovery_ui: dict[str, Any]


class CreateAdminBody(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=3, max_length=256)
    role: str = "admin"


class VoteRequest(BaseModel):
    direction: str = Field(pattern="^(up|down)$")
    voter_id: str = Field(min_length=8, max_length=128)


class CustomRepoRequest(BaseModel):
    repo_url: str = Field(min_length=3)


class PreviewRequest(BaseModel):
    categories: list[str] = Field(default_factory=list)
    top_per_category: int = 5
    curated_only: bool = True
    include_discovery: bool = False


class SyncRequest(BaseModel):
    force: bool = False


class InstallRequest(BaseModel):
    assets: list[dict[str, Any]]
    install_user: bool = True
    install_project: bool = False
    force: bool = False
    platform: str | None = None
    platforms: list[str] | None = None


class RemoveAssetRequest(BaseModel):
    name: str
    scope: str = Field(pattern="^(user|project)$")
    asset_type: str = "skill"


class ExportRequest(BaseModel):
    include_user: bool = True
    include_project: bool = True


class ImportRequest(BaseModel):
    bundle: dict[str, Any]
    import_user: bool = True
    import_project: bool = False
    force: bool = False


@app.get("/api/health")
def health() -> dict[str, Any]:
    try:
        with get_connection() as conn:
            assets = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        return {
            "status": "ok",
            "app": "skill-harbor",
            "db_path": str(get_db_path()),
            "assets": int(assets),
        }
    except Exception as e:
        raise HTTPException(503, f"Database unavailable: {e}") from e


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    token = config.get_github_token()
    project = config.get_project_dir()
    stats = catalog.stats()
    last = stats.get("last_sync") or {}
    return {
        "project_dir": str(project),
        "min_repo_stars": get_min_repo_stars(),
        "config_path": str(config.CONFIG_PATH),
        "db_path": str(get_db_path()),
        "database": database_info(),
        "asset_count": stats.get("total_assets", 0),
        "synced_content_count": stats.get("synced_content", 0),
        "last_synced_at": last.get("finished_at") or last.get("started_at"),
        "last_sync_status": last.get("status"),
        "stars_last_refreshed_at": config.get_last_stars_refresh_iso(),
        "stars_live": bool(config.get_last_stars_refresh() and config.get_admin_github_token()),
        "min_repo_stars": get_min_repo_stars(),
        "default_platform": config.get_default_platform(),
        "platform_mode": config.get_platform_mode(),
        "extra_install_platforms": config.get_extra_install_platforms(),
        "active_platform": config.resolve_active_platform(project),
        "platform_auto_detect": config.get_platform_mode() == "auto",
    }


@app.patch("/api/settings")
def patch_settings(body: SettingsUpdate) -> dict[str, Any]:
    if body.project_dir is not None:
        config.set_project_dir(Path(body.project_dir))
    if body.default_platform is not None:
        config.set_default_platform(body.default_platform)
    if body.platform_mode is not None:
        config.set_platform_mode(body.platform_mode)
    if body.extra_install_platforms is not None:
        config.set_extra_install_platforms(body.extra_install_platforms)
    return get_settings()


@app.get("/api/discovery/config")
def get_discovery_config() -> dict[str, Any]:
    from studio.discovery_config import get_discovery_ui, resolve_profession_domains

    cfg = get_discovery_ui()
    return {
        "config": cfg,
        "profession_domains": resolve_profession_domains(cfg),
    }


@app.get("/api/registry/meta")
def registry_meta() -> dict[str, Any]:
    token = config.get_admin_github_token()
    last = config.get_last_stars_refresh_iso()
    return {
        "database": "SQLite",
        "database_path": str(get_db_path()),
        "database_info": database_info(),
        "min_repo_stars": get_min_repo_stars(),
        "config_path": str(config.CONFIG_PATH),
        "stars_last_refreshed_at": last,
        "stars_live": bool(last and token),
        "stars_note": (
            "Star counts come from GitHub when an admin GitHub token is set and "
            "'Refresh star counts' is run on the admin dashboard. Otherwise seeds/cache are used."
        ),
    }


@app.post("/api/admin/auth/login")
def admin_login(body: AdminLoginBody, response: Response, request: Request) -> dict[str, Any]:
    token = create_session_for_user(body.username, body.password)
    if not token:
        raise HTTPException(401, "Invalid username or password")
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=86400,
        path="/",
    )
    log_activity("admin.login", body.username)
    return {"ok": True, **session_info(request)}


@app.post("/api/admin/auth/logout")
def admin_logout(request: Request, response: Response) -> dict[str, str]:
    from studio.admin_auth import token_from_request

    destroy_session(token_from_request(request))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/admin/auth/session")
def admin_session(request: Request) -> dict[str, Any]:
    return session_info(request)


@app.patch("/api/admin/settings")
def patch_admin_settings(body: AdminGithubTokenBody, request: Request) -> dict[str, Any]:
    require_admin(request)
    if body.admin_github_token is not None:
        config.set_admin_github_token(body.admin_github_token or None)
    return {
        "github_token_set": bool(config.get_admin_github_token()),
        "stars_last_refreshed_at": config.get_last_stars_refresh_iso(),
    }


@app.get("/api/admin/settings/registry")
def get_registry_settings(request: Request) -> dict[str, Any]:
    from studio import app_settings

    require_admin(request)
    return {"settings": app_settings.list_settings()}


@app.get("/api/admin/settings/discovery")
def get_admin_discovery_settings(request: Request) -> dict[str, Any]:
    from studio.discovery_config import get_discovery_ui, resolve_profession_domains

    require_admin(request)
    cfg = get_discovery_ui()
    return {"discovery_ui": cfg, "profession_domains": resolve_profession_domains(cfg)}


@app.patch("/api/admin/settings/discovery")
def patch_discovery_settings(body: DiscoveryUiBody, request: Request) -> dict[str, Any]:
    from studio import app_settings
    from studio.discovery_config import get_discovery_ui, resolve_profession_domains

    user = require_admin(request)
    app_settings.set_setting("discovery_ui", body.discovery_ui, updated_by=user["username"])
    cfg = get_discovery_ui()
    log_activity("settings.discovery", "discovery_ui", status="ok")
    return {"discovery_ui": cfg, "profession_domains": resolve_profession_domains(cfg)}


@app.patch("/api/admin/settings/registry")
def patch_registry_settings(body: RegistrySettingsBody, request: Request) -> dict[str, Any]:
    from studio import app_settings

    user = require_admin(request)
    updated: list[str] = []
    if body.min_repo_stars is not None:
        app_settings.set_setting("min_repo_stars", body.min_repo_stars, updated_by=user["username"])
        updated.append("min_repo_stars")
    if body.max_files_per_repo_expand is not None:
        app_settings.set_setting(
            "max_files_per_repo_expand", body.max_files_per_repo_expand, updated_by=user["username"]
        )
        updated.append("max_files_per_repo_expand")
    if body.discover_max_per_skills_query is not None:
        app_settings.set_setting(
            "discover_max_per_skills_query",
            body.discover_max_per_skills_query,
            updated_by=user["username"],
        )
        updated.append("discover_max_per_skills_query")
    if body.discover_max_per_domain_query is not None:
        app_settings.set_setting(
            "discover_max_per_domain_query",
            body.discover_max_per_domain_query,
            updated_by=user["username"],
        )
        updated.append("discover_max_per_domain_query")
    log_activity("settings.registry", ",".join(updated) or "noop")
    return {"updated": updated, "settings": app_settings.list_settings()}


@app.get("/api/admin/users")
def list_admin_users(request: Request) -> dict[str, Any]:
    from studio import admin_store

    require_admin(request)
    return {"users": admin_store.list_admins()}


@app.post("/api/admin/users")
def create_admin_user(body: CreateAdminBody, request: Request) -> dict[str, Any]:
    from studio import admin_store

    require_admin(request)
    try:
        user = admin_store.create_admin(body.username, body.password, role=body.role)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    log_activity("admin.user_create", body.username)
    return {"user": user}


@app.post("/api/admin/registry/refresh-stars")
def admin_refresh_stars(request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.registry_refresh import refresh_repo_stars

    def _run(job):
        job.step("Refresh stars", message="Fetching live star counts from GitHub…")
        result = refresh_repo_stars()
        if result.get("skipped"):
            raise RuntimeError(result.get("reason", "Star refresh skipped"))
        job.log(f"Updated stars for {result.get('repos', 0)} repos.")
        return result

    return run_registry_job(
        "registry.stars",
        "Refreshing GitHub star counts",
        _run,
        total_steps=2,
        finish_message=lambda r: f"Stars refreshed for {r.get('repos', 0)} repos",
    )


@app.get("/api/installed/updates")
def installed_updates(platform: str | None = None) -> dict[str, Any]:
    from studio.installed_updates import check_installed_updates

    platform_id = platform or config.get_default_platform()
    items = check_installed_updates(config.get_project_dir(), platform_id)
    return {"updates": items, "count": len(items), "platform": platform_id}


@app.get("/api/platforms")
def list_platforms(include_planned: bool = True) -> dict[str, Any]:
    specs = platforms.list_platforms(include_planned=include_planned)
    project = config.get_project_dir()
    return {
        "platforms": [platforms.platform_to_dict(s) for s in specs],
        "default_platform": config.get_default_platform(),
        "platform_mode": config.get_platform_mode(),
        "active_platform": config.resolve_active_platform(project),
    }


@app.get("/api/platforms/detect")
def detect_platforms_endpoint() -> dict[str, Any]:
    from studio.platform_detect import detect_installed_platforms

    project = config.get_project_dir()
    detection = detect_installed_platforms(project)
    detection["platform_mode"] = config.get_platform_mode()
    detection["manual_platform"] = config.get_default_platform()
    return detection


@app.post("/api/platforms/auto-detect")
def apply_auto_detect_platform() -> dict[str, Any]:
    from studio.platform_detect import detect_installed_platforms

    project = config.get_project_dir()
    detection = detect_installed_platforms(project)
    recommended = detection.get("recommended_platform") or "cursor"
    config.set_platform_mode("auto")
    config.set_default_platform(recommended)
    return {
        **detection,
        "platform_mode": "auto",
        "active_platform": config.resolve_active_platform(project),
    }


@app.get("/api/safety/verify")
def verify_registry_safety() -> dict[str, Any]:
    from studio.safety import purge_unsafe_assets

    return {"purge": purge_unsafe_assets()}


@app.get("/api/connection")
def connection(platform: str | None = None) -> dict[str, Any]:
    platform_id = platform or config.resolve_active_platform(config.get_project_dir())
    project = config.get_project_dir()
    info = platform_paths.connection_info(project, platform_id)
    spec = platforms.get_platform(platform_id)
    info["note"] = (
        f"{spec.label} reads skills from "
        f"~/{spec.global_root}/{spec.skill_subdir}/ (global) and "
        f"<project>/{spec.project_root}/{spec.skill_subdir}/ (project). "
        f"{spec.restart_hint}"
    )
    return info


@app.get("/api/categories")
def categories() -> dict[str, Any]:
    meta = scraper_bridge.list_category_meta()
    meta["curated_help"] = (
        "Harbor registry — community assets stored locally in harbor.db. "
        "Sync registry to refresh content from GitHub."
    )
    return meta


@app.get("/api/leaderboards")
def get_leaderboards() -> dict[str, Any]:
    return leaderboards.build_leaderboards()


@app.get("/api/bootstrap")
def api_bootstrap(platform: str | None = None) -> dict[str, Any]:
    """One round-trip for initial UI load (settings, meta, leaderboards, catalog slice)."""
    project = config.get_project_dir()
    active = platform or config.resolve_active_platform(project)
    stats = catalog.stats()
    assets, total = catalog.list_assets(
        platform=active,
        limit=250,
        offset=0,
    )
    enriched = harbor_sync.enrich_catalog_assets(assets, project, platform_id=active)
    return {
        "settings": {
            "project_dir": str(project),
            "default_platform": config.get_default_platform(),
            "platform_mode": config.get_platform_mode(),
            "extra_install_platforms": config.get_extra_install_platforms(),
            "active_platform": active,
            "asset_count": stats.get("total_assets", 0),
            "synced_content_count": stats.get("synced_content", 0),
            "last_synced_at": (stats.get("last_sync") or {}).get("finished_at"),
            "stars_last_refreshed_at": config.get_last_stars_refresh_iso(),
            "stars_live": bool(config.get_last_stars_refresh() and config.get_admin_github_token()),
        },
        "connection": platform_paths.connection_info(project, active),
        "categories": scraper_bridge.list_category_meta(),
        "discovery": _discovery_bootstrap_payload(),
        "leaderboards": leaderboards.build_leaderboards(),
        "platforms": {
            "platforms": [
                platforms.platform_to_dict(s)
                for s in platforms.list_platforms(include_planned=True)
            ],
            "default_platform": config.get_default_platform(),
            "platform_mode": config.get_platform_mode(),
            "active_platform": active,
        },
        "catalog": {"assets": enriched, "total": total},
    }


@app.get("/api/catalog")
def get_catalog(
    domain: str | None = None,
    tech: str | None = None,
    asset_type: str | None = None,
    platform: str | None = None,
    q: str | None = None,
    period: str = "all",
    limit: int = 200,
    offset: int = 0,
    include_stats: bool = False,
) -> dict[str, Any]:
    # Local registry can be 3k+ rows; allow large pages for Browse (client paginates).
    cap = min(max(limit, 1), 5000)
    assets, total = catalog.list_assets(
        domain=domain,
        tech_tag=tech,
        asset_type=asset_type,
        platform=platform,
        q=q,
        period=period,
        limit=cap,
        offset=offset,
    )
    project = config.get_project_dir()
    active_platform = platform or config.resolve_active_platform(project)
    enriched = harbor_sync.enrich_catalog_assets(assets, project, platform_id=active_platform)
    out: dict[str, Any] = {"assets": enriched, "total": total}
    if include_stats:
        out["stats"] = catalog.stats()
    return out


class VoteBody(VoteRequest):
    asset_id: str


@app.get("/api/asset")
def get_asset_detail(id: str, voter_id: str | None = None) -> dict[str, Any]:
    row = catalog.get_asset(id)
    if not row:
        raise HTTPException(404, f"Asset not found: {id}")
    project = config.get_project_dir()
    enriched = harbor_sync.enrich_catalog_assets(
        [row], project, platform_id=config.get_default_platform()
    )
    asset = enriched[0] if enriched else row
    asset["content"] = row.get("content", "")
    if voter_id:
        from studio import votes as harbor_votes

        asset["user_vote"] = harbor_votes.get_user_vote(id, voter_id)
    return asset


@app.post("/api/vote")
def cast_vote(body: VoteBody) -> dict[str, Any]:
    from studio import votes as harbor_votes

    try:
        return harbor_votes.cast_vote(body.asset_id, body.voter_id, body.direction)
    except LookupError:
        raise HTTPException(404, "Asset not found") from None
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/admin/dashboard")
def admin_dashboard(request: Request) -> dict[str, Any]:
    require_admin(request)
    try:
        return get_dashboard()
    except Exception as e:
        log_activity("admin.dashboard", str(e)[:500], status="error")
        raise HTTPException(500, f"Dashboard failed: {e}") from e


@app.get("/api/admin/activity/running")
def admin_activity_running(request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_jobs import get_running_activity

    job = get_running_activity()
    return {"running": job is not None, "job": job}


class AdminActivityCancelBody(BaseModel):
    activity_id: int | None = None
    reason: str = "Stopped by admin"


@app.post("/api/admin/activity/cancel")
def admin_activity_cancel(
    request: Request, body: AdminActivityCancelBody | None = None
) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_jobs import cancel_activity

    payload = body or AdminActivityCancelBody()
    return cancel_activity(
        payload.activity_id,
        reason=(payload.reason or "Stopped by admin")[:500],
    )


@app.get("/api/admin/activity/{activity_id}")
def admin_activity_detail(activity_id: int, request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_jobs import get_activity

    row = get_activity(activity_id)
    if not row:
        raise HTTPException(404, "Activity not found")
    return row


@app.get("/api/admin/activity")
def admin_activity(request: Request, limit: int = 50) -> dict[str, Any]:
    require_admin(request)
    try:
        return {"items": list_activity(limit=limit)}
    except Exception as e:
        log_activity("admin.activity", str(e)[:500], status="error")
        raise HTTPException(500, f"Activity log failed: {e}") from e


@app.post("/api/admin/registry/refresh")
def admin_registry_refresh(request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.registry_refresh import admin_refresh_registry

    def _run(job):
        job.step("Full refresh", message="Expand → stars → prune → dedupe → reclassify → sync…")
        result = admin_refresh_registry(expand=True, sync=True)
        stats = result.get("stats") or {}
        job.log(
            f"Registry now has {stats.get('total_assets', '?')} assets "
            f"({stats.get('synced_content', '?')} with content)."
        )
        return result

    return run_registry_job(
        "registry.refresh",
        "Full registry refresh",
        _run,
        total_steps=6,
        finish_message=lambda r: (
            f"Refresh complete — {(r.get('stats') or {}).get('total_assets', '?')} assets"
        ),
    )


@app.post("/api/admin/registry/expand")
def admin_registry_expand(request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.registry_expand import expand_registry

    def _run(job):
        job.step("Expand", message="Crawling seed repos for skills and rules…")
        return expand_registry(max_files_per_repo=150, job=job)

    return run_registry_job(
        "registry.expand",
        "Expanding registry from seed repos",
        _run,
        total_steps=3,
        finish_message=lambda r: f"Expand done — +{r.get('added', 0)} new, {r.get('updated', 0)} updated",
    )


@app.post("/api/admin/registry/evolve")
def admin_registry_evolve(request: Request, force: bool = False) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.registry_evolve import evolve_registry

    def _run(job):
        return evolve_registry(
            sync=False,
            discover=True,
            force=force,
            maintenance=False,
            job=job,
        )

    return run_registry_job(
        "registry.evolve",
        "Evolve registry — discover + crawl batch",
        _run,
        total_steps=3,
        finish_message=lambda r: (
            f"Evolve — {(r.get('stats') or {}).get('unique_repos', '?')} repos, "
            f"{(r.get('stats') or {}).get('total_assets', '?')} assets, "
            f"{(r.get('queue') or {}).get('pending', 0)} queued"
        ),
    )


@app.post("/api/admin/registry/discover")
def admin_registry_discover(request: Request, force: bool = False) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.registry_evolve import discover_registry

    def _run(job):
        job.step("Discover", message="Searching GitHub for skill repos…")
        return discover_registry(force=force, job=job)

    return run_registry_job(
        "registry.discover",
        "Discover repos (enqueue only)",
        _run,
        total_steps=2,
        finish_message=lambda r: (
            f"Discover — +{r.get('enqueued', 0)} queued ({r.get('queue_pending', 0)} pending)"
        ),
    )


@app.post("/api/admin/registry/crawl-batch")
def admin_registry_crawl_batch(request: Request, force: bool = False) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.registry_evolve import crawl_queue_batch

    def _run(job):
        job.step("Crawl", message="Crawling repos from discovery queue…")
        return crawl_queue_batch(force=force, job=job)

    return run_registry_job(
        "registry.crawl",
        "Crawl discovery queue batch",
        _run,
        total_steps=2,
        finish_message=lambda r: (
            f"Crawl — +{r.get('added', 0)} new across {r.get('repos_processed', 0)} repos "
            f"({r.get('queue_pending', 0)} still queued)"
        ),
    )


@app.get("/api/admin/registry/queue")
def admin_registry_queue(request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.discovery_queue import queue_stats

    return {"queue": queue_stats()}


@app.post("/api/admin/registry/reclassify")
def admin_registry_reclassify(request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.reclassify import reclassify_registry

    def _run(job):
        job.step("Reclassify", message="Re-running domain and tag classification…")
        result = reclassify_registry()
        job.log(f"Updated {result.get('updated', 0)} assets across {result.get('domains', 0)} domains.")
        return result

    return run_registry_job(
        "registry.reclassify",
        "Reclassifying registry domains",
        _run,
        total_steps=2,
        finish_message=lambda r: f"Reclassified {r.get('updated', 0)} assets",
    )


@app.post("/api/admin/registry/dedupe")
def admin_registry_dedupe(request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.dedupe import dedupe_registry

    def _run(job):
        job.step("Dedupe", message="Removing duplicate names and templates…")
        result = dedupe_registry()
        job.log(f"Dedupe finished: {result}")
        return result

    return run_registry_job(
        "registry.dedupe",
        "Deduping registry",
        _run,
        total_steps=2,
        finish_message=lambda _: "Dedupe finished — see log for counts",
    )


@app.post("/api/admin/registry/prune")
def admin_registry_prune(request: Request) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job
    from studio.registry_refresh import prune_low_star_assets

    def _run(job):
        job.step("Prune", message="Removing repos below minimum star threshold…")
        result = prune_low_star_assets()
        job.log(f"Removed {result.get('removed', 0)} assets below {result.get('min_stars', '?')}★.")
        return result

    return run_registry_job(
        "registry.prune",
        "Pruning low-star assets",
        _run,
        total_steps=2,
        finish_message=lambda r: f"Pruned {r.get('removed', 0)} assets",
    )


@app.post("/api/admin/registry/sync")
def admin_registry_sync(request: Request, body: SyncRequest | None = None) -> dict[str, Any]:
    require_admin(request)
    from studio.admin_registry_runner import run_registry_job

    force = body.force if body else False

    def _run(job):
        job.step("Sync", message="Pulling file content from GitHub into harbor.db…")
        result = harbor_sync.sync_catalog(force=force)
        job.log(f"Synced {result.get('assets_updated', result.get('updated', 0))} assets.")
        return {**result, "stats": catalog.stats()}

    return run_registry_job(
        "registry.sync",
        "Syncing registry content",
        _run,
        total_steps=2,
        finish_message=lambda r: f"Sync done — {r.get('assets_updated', r.get('updated', 0))} updated",
    )


@app.post("/api/admin/registry/custom")
def admin_import_custom_repo(request: Request, body: CustomRepoRequest) -> dict[str, Any]:
    require_admin(request)
    from studio.registry_expand import import_custom_repo

    try:
        result = import_custom_repo(body.repo_url)
        log_activity(
            "registry.custom",
            f"{result.get('owner')}/{result.get('repo')} +{result.get('added', 0)}",
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        log_activity("registry.custom", str(e), status="error")
        raise HTTPException(500, str(e)) from e


@app.post("/api/sync")
def sync_registry(body: SyncRequest | None = None) -> dict[str, Any]:
    """Public: refresh skill/rule file content from GitHub into harbor.db."""
    force = body.force if body else False
    try:
        return harbor_sync.sync_catalog(force=force)
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/api/assets/{asset_id:path}")
def get_asset_detail_path(asset_id: str) -> dict[str, Any]:
    return get_asset_detail(asset_id)


@app.get("/api/sync/status")
def sync_status() -> dict[str, Any]:
    stats = catalog.stats()
    return {"last_sync": stats.get("last_sync"), "stats": stats}


@app.post("/api/preview")
def preview(body: PreviewRequest) -> dict[str, Any]:
    """Backward compat — returns catalog from DB."""
    assets, total = catalog.list_assets(limit=500)
    project = config.get_project_dir()
    enriched = harbor_sync.enrich_catalog_assets(
        assets, project, platform_id=config.get_default_platform()
    )
    if body.categories:
        cat_set = set(body.categories)
        enriched = [
            a
            for a in enriched
            if any(c in cat_set for c in (a.get("domains") or []) + (a.get("categories") or []))
        ]
    return {
        "assets": enriched,
        "errors": [],
        "repos_scanned": sorted({a.get("source_repo", "") for a in enriched}),
        "generated_at": catalog.stats().get("last_sync", {}).get("finished_at"),
        "category_meta": scraper_bridge.list_category_meta(),
    }


@app.post("/api/install")
def install(body: InstallRequest) -> dict[str, Any]:
    if not body.assets:
        raise HTTPException(400, "No assets selected")
    if not body.install_user and not body.install_project:
        raise HTTPException(400, "Select at least one install target")
    try:
        primary = body.platform or config.resolve_active_platform(config.get_project_dir())
        target_platforms = body.platforms if body.platforms else [primary]
        if primary not in target_platforms:
            target_platforms = [primary, *target_platforms]
        return scraper_bridge.install_assets(
            body.assets,
            install_user=body.install_user,
            install_project=body.install_project,
            project_dir=config.get_project_dir(),
            force=body.force,
            token=config.get_github_token(),
            platform_id=primary,
            platforms=target_platforms,
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/api/export")
def export_cursor_backup(
    include_user: bool = True,
    include_project: bool = True,
    platform: str | None = None,
) -> dict[str, Any]:
    return export_import.export_bundle(
        user=include_user,
        project_dir=config.get_project_dir(),
        platform_id=platform or config.get_default_platform(),
    )


@app.post("/api/import")
def import_cursor_backup(body: ImportRequest, platform: str | None = None) -> dict[str, Any]:
    try:
        return export_import.import_bundle(
            body.bundle,
            import_user=body.import_user,
            import_project=body.import_project,
            project_dir=config.get_project_dir(),
            force=body.force,
            platform_id=platform or config.get_default_platform(),
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.delete("/api/assets/{asset_type}/{name}")
def remove_asset(
    asset_type: str,
    name: str,
    scope: str = "user",
    platform: str | None = None,
) -> dict[str, Any]:
    platform_id = platform or config.get_default_platform()
    if scope == "user":
        root = platform_paths.user_root(platform_id)
    else:
        root = platform_paths.project_root(config.get_project_dir(), platform_id)
    ok = platform_paths.remove_asset(root, name, asset_type, platform_id)
    if not ok:
        raise HTTPException(404, f"Not found: {asset_type}/{name}")
    return {"removed": name, "scope": scope, "asset_type": asset_type}


@app.delete("/api/skills/{name}")
def remove_skill(name: str, scope: str = "user") -> dict[str, Any]:
    return remove_asset("skill", name, scope)
