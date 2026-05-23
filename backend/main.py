"""
Skill Harbor — marketplace API for Cursor skills, rules, commands, and subagents.

Run: uvicorn main:app --reload --port 8765
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from studio import config, cursor_paths, export_import, leaderboards, scraper_bridge
from studio.catalog import CatalogService
from studio.database import DB_PATH
from studio import sync as harbor_sync

app = FastAPI(
    title="Skill Harbor",
    description="By Devs, For Devs — marketplace API for Cursor skills, rules, commands, and subagents",
    version="0.3.0",
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


@app.on_event("startup")
def on_startup() -> None:
    catalog.ensure_seeded()


class SettingsUpdate(BaseModel):
    project_dir: str | None = None
    github_token: str | None = None


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
def health() -> dict[str, str]:
    return {"status": "ok", "app": "skill-harbor"}


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    token = config.get_github_token()
    project = config.get_project_dir()
    stats = catalog.stats()
    last = stats.get("last_sync") or {}
    return {
        "project_dir": str(project),
        "github_token_set": False,
        "config_path": str(config.CONFIG_PATH),
        "db_path": str(DB_PATH),
        "asset_count": stats.get("total_assets", 0),
        "synced_content_count": stats.get("synced_content", 0),
        "last_synced_at": last.get("finished_at") or last.get("started_at"),
        "last_sync_status": last.get("status"),
    }


@app.patch("/api/settings")
def patch_settings(body: SettingsUpdate) -> dict[str, Any]:
    if body.project_dir is not None:
        config.set_project_dir(Path(body.project_dir))
    if body.github_token is not None:
        config.set_github_token(body.github_token or None)
    return get_settings()


@app.get("/api/connection")
def connection() -> dict[str, Any]:
    project = config.get_project_dir()
    info = cursor_paths.cursor_connection_info(project)
    info["note"] = (
        "Cursor reads skills from ~/.cursor/skills/ (global) and "
        "<project>/.cursor/skills/ (project). Restart Cursor or open a new "
        "Agent chat after installing."
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


@app.get("/api/catalog")
def get_catalog(
    domain: str | None = None,
    asset_type: str | None = None,
    q: str | None = None,
    period: str = "all",
    limit: int = 200,
    offset: int = 0,
) -> dict[str, Any]:
    assets, total = catalog.list_assets(
        domain=domain,
        asset_type=asset_type,
        q=q,
        period=period,
        limit=min(limit, 500),
        offset=offset,
    )
    project = config.get_project_dir()
    enriched = harbor_sync.enrich_catalog_assets(assets, project)
    return {
        "assets": enriched,
        "total": total,
        "stats": catalog.stats(),
    }


@app.get("/api/asset")
def get_asset_detail(id: str) -> dict[str, Any]:
    row = catalog.get_asset(id)
    if not row:
        raise HTTPException(404, f"Asset not found: {id}")
    project = config.get_project_dir()
    enriched = harbor_sync.enrich_catalog_assets([row], project)
    asset = enriched[0] if enriched else row
    asset["content"] = row.get("content", "")
    return asset


@app.get("/api/assets/{asset_id:path}")
def get_asset_detail_path(asset_id: str) -> dict[str, Any]:
    return get_asset_detail(asset_id)


@app.post("/api/registry/expand")
def registry_expand() -> dict[str, Any]:
    from studio.registry_expand import expand_registry

    try:
        return expand_registry(max_files_per_repo=150)
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/sync")
def sync_registry(body: SyncRequest | None = None) -> dict[str, Any]:
    force = body.force if body else False
    try:
        result = harbor_sync.sync_catalog(force=force)
        return {**result, "stats": catalog.stats()}
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/api/sync/status")
def sync_status() -> dict[str, Any]:
    stats = catalog.stats()
    return {"last_sync": stats.get("last_sync"), "stats": stats}


@app.post("/api/preview")
def preview(body: PreviewRequest) -> dict[str, Any]:
    """Backward compat — returns catalog from DB."""
    assets, total = catalog.list_assets(limit=500)
    project = config.get_project_dir()
    enriched = harbor_sync.enrich_catalog_assets(assets, project)
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
        return scraper_bridge.install_assets(
            body.assets,
            install_user=body.install_user,
            install_project=body.install_project,
            project_dir=config.get_project_dir(),
            force=body.force,
            token=config.get_github_token(),
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/api/export")
def export_cursor_backup(
    include_user: bool = True,
    include_project: bool = True,
) -> dict[str, Any]:
    return export_import.export_bundle(
        user=include_user,
        project_dir=config.get_project_dir(),
    )


@app.post("/api/import")
def import_cursor_backup(body: ImportRequest) -> dict[str, Any]:
    try:
        return export_import.import_bundle(
            body.bundle,
            import_user=body.import_user,
            import_project=body.import_project,
            project_dir=config.get_project_dir(),
            force=body.force,
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.delete("/api/assets/{asset_type}/{name}")
def remove_asset(
    asset_type: str,
    name: str,
    scope: str = "user",
) -> dict[str, Any]:
    if scope == "user":
        root = cursor_paths.user_cursor_root()
    else:
        root = cursor_paths.project_cursor_root(config.get_project_dir())
    ok = cursor_paths.remove_asset(root, name, asset_type)
    if not ok:
        raise HTTPException(404, f"Not found: {asset_type}/{name}")
    return {"removed": name, "scope": scope, "asset_type": asset_type}


@app.delete("/api/skills/{name}")
def remove_skill(name: str, scope: str = "user") -> dict[str, Any]:
    return remove_asset("skill", name, scope)
