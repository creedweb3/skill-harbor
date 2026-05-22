from __future__ import annotations

from pathlib import Path
from typing import Any

SKILL_FILE = "SKILL.md"


def user_cursor_root() -> Path:
    return Path.home() / ".cursor"


def project_cursor_root(project_dir: Path) -> Path:
    return project_dir / ".cursor"


def cursor_connection_info(project_dir: Path) -> dict[str, Any]:
    user_root = user_cursor_root()
    proj_root = project_cursor_root(project_dir)
    return {
        "user_cursor_dir": str(user_root),
        "user_exists": user_root.is_dir(),
        "project_dir": str(project_dir),
        "project_cursor_dir": str(proj_root),
        "project_cursor_exists": proj_root.is_dir(),
        "scopes": {
            "user": describe_scope(user_root),
            "project": describe_scope(proj_root),
        },
    }


def describe_scope(root: Path) -> dict[str, Any]:
    if not root.is_dir():
        return {"exists": False, "skills": [], "rules": [], "commands": [], "agents": []}
    return {
        "exists": True,
        "skills": list_installed_skills(root / "skills"),
        "rules": [{"name": n, "asset_type": "rule"} for n in list_files(root / "rules", {".mdc", ".md"})],
        "commands": [{"name": n, "asset_type": "command"} for n in list_files(root / "commands", {".md"})],
        "agents": [{"name": n, "asset_type": "agent"} for n in list_files(root / "agents", {".md"})],
    }


def list_installed_skills(skills_dir: Path) -> list[dict[str, str]]:
    if not skills_dir.is_dir():
        return []
    out: list[dict[str, str]] = []
    for folder in sorted(skills_dir.iterdir()):
        if not folder.is_dir():
            continue
        skill_md = folder / SKILL_FILE
        if skill_md.is_file():
            out.append({"name": folder.name, "path": str(skill_md)})
    return out


def list_files(directory: Path, extensions: set[str]) -> list[str]:
    if not directory.is_dir():
        return []
    return sorted(
        f.name for f in directory.iterdir() if f.is_file() and f.suffix.lower() in extensions
    )


def remove_skill(scope_root: Path, name: str) -> bool:
    return remove_asset(scope_root, name, "skill")


def remove_asset(scope_root: Path, name: str, asset_type: str) -> bool:
    import shutil

    if asset_type == "skill":
        target = scope_root / "skills" / name
        if target.is_dir():
            shutil.rmtree(target)
            return True
        return False
    if asset_type == "rule":
        target = scope_root / "rules" / name
    elif asset_type == "command":
        target = scope_root / "commands" / name
    elif asset_type == "agent":
        target = scope_root / "agents" / name
    else:
        return False
    if target.is_file():
        target.unlink()
        return True
    return False
