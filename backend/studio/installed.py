"""
Detect installed Cursor assets and content overlaps (same skill, different folder name).
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

SKILL_FILE = "SKILL.md"


def content_hash(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text.strip())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def read_file(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def _add_index(
    by_hash: dict[str, list[dict[str, str]]],
    by_name: dict[str, dict[str, str]],
    *,
    name: str,
    scope: str,
    path: str,
    asset_type: str,
    text: str,
) -> None:
    h = content_hash(text)
    entry = {
        "name": name,
        "scope": scope,
        "path": path,
        "asset_type": asset_type,
        "hash": h,
    }
    by_hash.setdefault(h, []).append(entry)
    key = f"{asset_type}:{name}"
    by_name[key] = entry


def index_scope(scope_root: Path, scope: str) -> dict[str, Any]:
    by_hash: dict[str, list[dict[str, str]]] = {}
    by_name: dict[str, dict[str, str]] = {}

    skills_dir = scope_root / "skills"
    if skills_dir.is_dir():
        for folder in skills_dir.iterdir():
            if not folder.is_dir():
                continue
            skill_md = folder / SKILL_FILE
            if not skill_md.is_file():
                continue
            text = read_file(skill_md)
            if text:
                _add_index(
                    by_hash,
                    by_name,
                    name=folder.name,
                    scope=scope,
                    path=str(skill_md),
                    asset_type="skill",
                    text=text,
                )

    rules_dir = scope_root / "rules"
    if rules_dir.is_dir():
        for f in rules_dir.iterdir():
            if f.is_file() and f.suffix.lower() in {".mdc", ".md"}:
                text = read_file(f)
                if text:
                    _add_index(
                        by_hash,
                        by_name,
                        name=f.name,
                        scope=scope,
                        path=str(f),
                        asset_type="rule",
                        text=text,
                    )

    commands_dir = scope_root / "commands"
    if commands_dir.is_dir():
        for f in commands_dir.iterdir():
            if f.is_file() and f.suffix.lower() == ".md":
                text = read_file(f)
                if text:
                    _add_index(
                        by_hash,
                        by_name,
                        name=f.name,
                        scope=scope,
                        path=str(f),
                        asset_type="command",
                        text=text,
                    )

    agents_dir = scope_root / "agents"
    if agents_dir.is_dir():
        for f in agents_dir.iterdir():
            if f.is_file() and f.suffix.lower() == ".md":
                text = read_file(f)
                if text:
                    _add_index(
                        by_hash,
                        by_name,
                        name=f.name,
                        scope=scope,
                        path=str(f),
                        asset_type="agent",
                        text=text,
                    )

    return {"by_hash": by_hash, "by_name": by_name}


def build_install_index(user_root: Path, project_root: Path) -> dict[str, Any]:
    user = index_scope(user_root, "user")
    project = index_scope(project_root, "project")
    return {"user": user, "project": project}


def match_asset_install(
    *,
    content_sha256: str,
    install_name: str,
    asset_type: str,
    index: dict[str, Any],
) -> dict[str, Any]:
    user_h = index["user"]["by_hash"]
    proj_h = index["project"]["by_hash"]
    user_n = index["user"]["by_name"]
    proj_n = index["project"]["by_name"]

    global_matches = list(user_h.get(content_sha256, []))
    project_matches = list(proj_h.get(content_sha256, []))

    name_key = f"{asset_type}:{install_name}"
    name_collision = False
    for by_name in (user_n, proj_n):
        existing = by_name.get(name_key)
        if existing and existing["hash"] != content_sha256:
            name_collision = True

    status = "none"
    if global_matches and project_matches:
        status = "both"
    elif global_matches:
        status = "global"
    elif project_matches:
        status = "project"

    installed_as: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for m in global_matches + project_matches:
        key = (m["name"], m["scope"])
        if key not in seen:
            seen.add(key)
            installed_as.append({**m, "match": "content"})

    overlap_names = [
        f'{i["name"]} ({i["scope"]}, {i.get("asset_type", "skill")})'
        for i in installed_as
        if i["name"] != install_name
    ]

    return {
        "status": status,
        "installed": installed_as,
        "overlap_warning": bool(overlap_names),
        "overlap_names": overlap_names[:5],
        "name_collision": name_collision,
        "safe_to_install": status == "none" and not name_collision,
    }
