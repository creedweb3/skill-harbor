"""Infer which agent platforms an asset supports from path, type, and manifest hints."""

from __future__ import annotations

import re
from typing import Iterable

from studio.platforms import PLATFORMS, PlatformSpec, get_platform, list_platforms

_PATH_MARKERS: list[tuple[str, re.Pattern[str]]] = [
    ("cursor", re.compile(r"(^|/)\.cursor/|\.cursorrules", re.I)),
    ("claude", re.compile(r"(^|/)\.claude/", re.I)),
    ("codex", re.compile(r"(^|/)\.codex/", re.I)),
    ("gemini", re.compile(r"(^|/)\.gemini/", re.I)),
    ("antigravity", re.compile(r"(^|/)\.agent/", re.I)),
    ("windsurf", re.compile(r"(^|/)\.(?:windsurf|codeium)/", re.I)),
    ("cline", re.compile(r"(^|/)\.cline/", re.I)),
    ("copilot", re.compile(r"(^|/)\.github/copilot", re.I)),
    ("continue", re.compile(r"(^|/)\.continue/", re.I)),
    ("aider", re.compile(r"(^|/)\.aider/", re.I)),
]

_UNIVERSAL_SKILL_MARKERS = (
    "/skills/",
    "/agent-skills/",
    "/capabilities/",
    "skill.md",
    "agents.md",
)


def _installable_platforms() -> list[PlatformSpec]:
    return [p for p in list_platforms(include_planned=False) if p.status in ("stable", "beta")]


def platform_supports_asset(spec: PlatformSpec, asset_type: str) -> bool:
    if asset_type == "agents_md":
        return "agents_md" in spec.supported_assets or "rule" in spec.supported_assets
    return asset_type in spec.supported_assets


def detect_platforms(
    path: str,
    asset_type: str = "skill",
    manifest_platforms: Iterable[str] | None = None,
) -> list[str]:
    """Return platform ids that can install this asset."""
    if manifest_platforms:
        out = []
        for raw in manifest_platforms:
            spec = get_platform(str(raw))
            if platform_supports_asset(spec, asset_type) and spec.status != "planned":
                out.append(spec.id)
        if out:
            return sorted(set(out))

    norm = path.replace("\\", "/").lower()
    matched: list[str] = []
    for pid, pattern in _PATH_MARKERS:
        if pattern.search(norm):
            spec = get_platform(pid)
            if platform_supports_asset(spec, asset_type) and spec.status != "planned":
                matched.append(pid)
    if matched:
        return sorted(set(matched))

    universal = any(m in norm for m in _UNIVERSAL_SKILL_MARKERS)
    if universal or asset_type in ("skill", "agents_md", "rule", "command", "agent"):
        compatible = [
            p.id
            for p in _installable_platforms()
            if platform_supports_asset(p, asset_type)
        ]
        if compatible:
            return sorted(set(compatible))

    # Legacy catalog entries — Cursor-first
    cursor = get_platform("cursor")
    if platform_supports_asset(cursor, asset_type):
        return ["cursor"]
    return []


def asset_compatible_with(platform_id: str, platforms: list[str]) -> bool:
    if not platforms:
        return True
    spec = get_platform(platform_id)
    return spec.id in platforms or any(get_platform(p).id == spec.id for p in platforms)


def backfill_asset_platforms(conn) -> int:
    """Populate asset_platforms for all catalog rows. Returns rows updated."""
    rows = conn.execute("SELECT id, path, asset_type FROM assets").fetchall()
    updated = 0
    for row in rows:
        aid = row["id"]
        path = row["path"] or ""
        asset_type = row["asset_type"] or "skill"
        platforms = detect_platforms(path, asset_type)
        conn.execute("DELETE FROM asset_platforms WHERE asset_id = ?", (aid,))
        for pid in platforms:
            conn.execute(
                "INSERT OR IGNORE INTO asset_platforms (asset_id, platform) VALUES (?, ?)",
                (aid, pid),
            )
        updated += 1
    conn.commit()
    return updated
