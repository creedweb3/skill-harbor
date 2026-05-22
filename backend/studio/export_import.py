"""Export / import Cursor .cursor folders as JSON backups."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio import cursor_paths, installed

BUNDLE_VERSION = 1


def _collect_scope(scope_root: Path, scope: str) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {
        "skills": [],
        "rules": [],
        "commands": [],
        "agents": [],
    }
    if not scope_root.is_dir():
        return out

    skills_dir = scope_root / "skills"
    if skills_dir.is_dir():
        for folder in sorted(skills_dir.iterdir()):
            if not folder.is_dir():
                continue
            md = folder / "SKILL.md"
            if not md.is_file():
                continue
            text = installed.read_file(md)
            if text:
                out["skills"].append(
                    {
                        "name": folder.name,
                        "content": text,
                        "content_sha256": installed.content_hash(text),
                    }
                )

    rules_dir = scope_root / "rules"
    if rules_dir.is_dir():
        for f in sorted(rules_dir.iterdir()):
            if f.is_file() and f.suffix.lower() in {".mdc", ".md"}:
                text = installed.read_file(f)
                if text:
                    out["rules"].append(
                        {
                            "name": f.name,
                            "content": text,
                            "content_sha256": installed.content_hash(text),
                        }
                    )

    for key, sub in (("commands", "commands"), ("agents", "agents")):
        d = scope_root / sub
        if d.is_dir():
            for f in sorted(d.iterdir()):
                if f.is_file() and f.suffix.lower() == ".md":
                    text = installed.read_file(f)
                    if text:
                        out[key].append(
                            {
                                "name": f.name,
                                "content": text,
                                "content_sha256": installed.content_hash(text),
                            }
                        )
    return out


def export_bundle(*, user: bool, project_dir: Path) -> dict[str, Any]:
    scopes: dict[str, Any] = {}
    if user:
        scopes["user"] = _collect_scope(cursor_paths.user_cursor_root(), "user")
    scopes["project"] = _collect_scope(cursor_paths.project_cursor_root(project_dir), "project")
    return {
        "version": BUNDLE_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "scopes": scopes,
    }


def _write_items(
    base: Path,
    folder: str,
    items: list[dict[str, Any]],
    *,
    force: bool,
    name_key: str = "name",
) -> list[str]:
    written: list[str] = []
    target = base / folder
    target.mkdir(parents=True, exist_ok=True)
    for item in items:
        name = item[name_key]
        dest = target / name
        if dest.is_dir():
            dest = dest / "SKILL.md"
        if dest.exists() and not force:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(item["content"], encoding="utf-8", newline="\n")
        written.append(str(dest))
    return written


def import_bundle(
    bundle: dict[str, Any],
    *,
    import_user: bool,
    import_project: bool,
    project_dir: Path,
    force: bool,
) -> dict[str, Any]:
    scopes = bundle.get("scopes") or {}
    result: dict[str, list[str]] = {"user": [], "project": []}

    if import_user and "user" in scopes:
        data = scopes["user"]
        base = cursor_paths.user_cursor_root()
        for skill in data.get("skills", []):
            d = base / "skills" / skill["name"] / "SKILL.md"
            d.parent.mkdir(parents=True, exist_ok=True)
            if d.exists() and not force:
                continue
            d.write_text(skill["content"], encoding="utf-8", newline="\n")
            result["user"].append(str(d))
        result["user"].extend(_write_items(base, "rules", data.get("rules", []), force=force))
        result["user"].extend(_write_items(base, "commands", data.get("commands", []), force=force))
        result["user"].extend(_write_items(base, "agents", data.get("agents", []), force=force))

    if import_project and "project" in scopes:
        data = scopes["project"]
        base = cursor_paths.project_cursor_root(project_dir)
        base.mkdir(parents=True, exist_ok=True)
        for skill in data.get("skills", []):
            d = base / "skills" / skill["name"] / "SKILL.md"
            d.parent.mkdir(parents=True, exist_ok=True)
            if d.exists() and not force:
                continue
            d.write_text(skill["content"], encoding="utf-8", newline="\n")
            result["project"].append(str(d))
        result["project"].extend(_write_items(base, "rules", data.get("rules", []), force=force))
        result["project"].extend(_write_items(base, "commands", data.get("commands", []), force=force))
        result["project"].extend(_write_items(base, "agents", data.get("agents", []), force=force))

    return {"imported": result}
