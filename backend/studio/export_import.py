"""Export / import agent skill folders as JSON backups (platform-aware)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio import installed, platform_paths
from studio.platforms import DEFAULT_PLATFORM_ID, get_platform

BUNDLE_VERSION = 2


def _collect_scope(scope_root: Path, spec) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {
        "skills": [],
        "rules": [],
        "commands": [],
        "agents": [],
    }
    if not scope_root.is_dir():
        return out

    skills_dir = scope_root / spec.skill_subdir
    if skills_dir.is_dir():
        for folder in sorted(skills_dir.iterdir()):
            if not folder.is_dir():
                continue
            md = folder / spec.skill_filename
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

    rules_dir = scope_root / spec.rules_subdir
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

    for key, sub in (("commands", spec.commands_subdir), ("agents", spec.agents_subdir)):
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


def export_bundle(
    *,
    user: bool,
    project_dir: Path,
    platform_id: str = DEFAULT_PLATFORM_ID,
) -> dict[str, Any]:
    spec = get_platform(platform_id)
    scopes: dict[str, Any] = {}
    if user:
        scopes["user"] = _collect_scope(platform_paths.user_root(platform_id), spec)
    scopes["project"] = _collect_scope(
        platform_paths.project_root(project_dir, platform_id), spec
    )
    return {
        "version": BUNDLE_VERSION,
        "platform": spec.id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "scopes": scopes,
    }


def _write_items(
    base: Path,
    folder: str,
    items: list[dict[str, Any]],
    *,
    force: bool,
) -> list[str]:
    written: list[str] = []
    target = base / folder
    target.mkdir(parents=True, exist_ok=True)
    for item in items:
        dest = target / item["name"]
        if dest.exists() and not force:
            continue
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
    platform_id: str | None = None,
) -> dict[str, Any]:
    spec = get_platform(platform_id or bundle.get("platform") or DEFAULT_PLATFORM_ID)
    scopes = bundle.get("scopes") or {}
    result: dict[str, list[str]] = {"user": [], "project": []}

    def _import_scope(data: dict[str, Any], base: Path, scope_key: str) -> None:
        base.mkdir(parents=True, exist_ok=True)
        for skill in data.get("skills", []):
            d = base / spec.skill_subdir / skill["name"] / spec.skill_filename
            d.parent.mkdir(parents=True, exist_ok=True)
            if d.exists() and not force:
                continue
            d.write_text(skill["content"], encoding="utf-8", newline="\n")
            result[scope_key].append(str(d))
        result[scope_key].extend(
            _write_items(base, spec.rules_subdir, data.get("rules", []), force=force)
        )
        result[scope_key].extend(
            _write_items(base, spec.commands_subdir, data.get("commands", []), force=force)
        )
        result[scope_key].extend(
            _write_items(base, spec.agents_subdir, data.get("agents", []), force=force)
        )

    if import_user and "user" in scopes:
        _import_scope(scopes["user"], platform_paths.user_root(spec.id), "user")
    if import_project and "project" in scopes:
        _import_scope(
            scopes["project"],
            platform_paths.project_root(project_dir, spec.id),
            "project",
        )

    return {"imported": result, "platform": spec.id}
