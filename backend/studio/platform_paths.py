"""
Filesystem paths per agent platform — Skill Harbor v2.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from studio.platforms import DEFAULT_PLATFORM_ID, PlatformSpec, get_platform

SKILL_FILE = "SKILL.md"


def user_root(platform_id: str | None = None) -> Path:
    spec = get_platform(platform_id)
    return Path.home() / spec.global_root.lstrip("/\\")


def project_root(project_dir: Path, platform_id: str | None = None) -> Path:
    spec = get_platform(platform_id)
    return project_dir / spec.project_root.lstrip("/\\")


def get_install_bases(
    *,
    platform_id: str,
    install_user: bool,
    install_project: bool,
    project_dir: Path,
) -> list[tuple[str, Path]]:
    spec = get_platform(platform_id)
    if spec.status == "planned":
        raise ValueError(f"Platform '{spec.label}' is not installable yet (status: planned)")
    bases: list[tuple[str, Path]] = []
    if install_user:
        bases.append(("user", user_root(platform_id)))
    if install_project:
        bases.append(("project", project_root(project_dir, platform_id)))
    return bases


def connection_info(project_dir: Path, platform_id: str | None = None) -> dict[str, Any]:
    spec = get_platform(platform_id)
    user = user_root(platform_id)
    proj = project_root(project_dir, platform_id)
    global_skills = user / spec.skill_subdir
    proj_skills = proj / spec.skill_subdir
    return {
        "platform": spec.id,
        "platform_label": spec.label,
        "platform_status": spec.status,
        "vendor": spec.vendor,
        "global_root": str(user),
        "global_exists": user.is_dir(),
        "project_dir": str(project_dir),
        "project_root": str(proj),
        "project_exists": proj.is_dir(),
        "supported_assets": list(spec.supported_assets),
        "installable": spec.status in ("stable", "beta"),
        "docs_url": spec.docs_url,
        "restart_hint": spec.restart_hint,
        "scopes": {
            "user": describe_scope(user, spec),
            "project": describe_scope(proj, spec),
        },
        # Backward compat for Cursor-focused UI
        "user_cursor_dir": str(user),
        "user_exists": user.is_dir(),
        "project_cursor_dir": str(proj),
        "project_cursor_exists": proj.is_dir(),
    }


def describe_scope(root: Path, spec: PlatformSpec | None = None) -> dict[str, Any]:
    if spec is None:
        spec = get_platform(DEFAULT_PLATFORM_ID)
    if not root.is_dir():
        return {"exists": False, "skills": [], "rules": [], "commands": [], "agents": []}
    rules_ext = {spec.rule_extension, ".md", ".mdc"}
    return {
        "exists": True,
        "skills": list_installed_skills(root / spec.skill_subdir, spec.skill_filename),
        "rules": [
            {"name": n, "asset_type": "rule"}
            for n in list_files(root / spec.rules_subdir, rules_ext)
        ],
        "commands": [
            {"name": n, "asset_type": "command"}
            for n in list_files(root / spec.commands_subdir, {".md"})
        ],
        "agents": [
            {"name": n, "asset_type": "agent"}
            for n in list_files(root / spec.agents_subdir, {".md"})
        ],
    }


def list_installed_skills(skills_dir: Path, skill_filename: str = SKILL_FILE) -> list[dict[str, str]]:
    if not skills_dir.is_dir():
        return []
    out: list[dict[str, str]] = []
    for folder in sorted(skills_dir.iterdir()):
        if not folder.is_dir():
            continue
        skill_md = folder / skill_filename
        if skill_md.is_file():
            out.append({"name": folder.name, "path": str(skill_md)})
    return out


def list_files(directory: Path, extensions: set[str]) -> list[str]:
    if not directory.is_dir():
        return []
    return sorted(
        f.name for f in directory.iterdir() if f.is_file() and f.suffix.lower() in extensions
    )


def remove_asset(
    scope_root: Path,
    name: str,
    asset_type: str,
    platform_id: str | None = None,
) -> bool:
    import shutil

    spec = get_platform(platform_id)
    if asset_type == "skill":
        target = scope_root / spec.skill_subdir / name
        if target.is_dir():
            shutil.rmtree(target)
            return True
        return False
    if asset_type == "rule":
        target = scope_root / spec.rules_subdir / name
    elif asset_type == "command":
        target = scope_root / spec.commands_subdir / name
    elif asset_type == "agent":
        target = scope_root / spec.agents_subdir / name
    else:
        return False
    if target.is_file():
        target.unlink()
        return True
    return False
