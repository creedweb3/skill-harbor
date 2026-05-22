"""
SkillHarbor — local API for browsing and installing Cursor agent assets.

Run: uvicorn main:app --reload --port 8765
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from studio import config, cursor_paths, export_import, leaderboards, scraper_bridge

app = FastAPI(
    title="SkillHarbor",
    description="Marketplace API for Cursor skills, rules, commands, and subagents",
    version="0.2.0",
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


class SettingsUpdate(BaseModel):
    project_dir: str | None = None
    github_token: str | None = None


class PreviewRequest(BaseModel):
    categories: list[str] = Field(default_factory=list)
    top_per_category: int = 5
    curated_only: bool = True
    include_discovery: bool = False


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
    return {
        "project_dir": str(project),
        "github_token_set": bool(token),
        "config_path": str(config.CONFIG_PATH),
        "curated_manifest": str(scraper_bridge.CURATED_PATH),
        "curated_exists": scraper_bridge.CURATED_PATH.is_file(),
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
    """Cursor filesystem locations (how the app 'connects' to Cursor)."""
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
    return meta


@app.get("/api/leaderboards")
def get_leaderboards() -> dict[str, Any]:
    return leaderboards.build_leaderboards()


@app.post("/api/preview")
def preview(body: PreviewRequest) -> dict[str, Any]:
    cats = body.categories or []
    try:
        return scraper_bridge.run_curated_preview(
            categories=cats,
            top_per_category=body.top_per_category,
            token=config.get_github_token(),
            curated_only=not body.include_discovery,
            project_dir=config.get_project_dir(),
        )
    except Exception as e:
        msg = str(e) or "Preview failed"
        if "rate limit" in msg.lower():
            raise HTTPException(
                429,
                "GitHub rate limit exceeded. Add a token in Settings and retry in a few minutes.",
            ) from e
        raise HTTPException(500, msg) from e


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
