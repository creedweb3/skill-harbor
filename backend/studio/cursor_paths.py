"""Backward-compatible Cursor paths — delegates to platform_paths (default: cursor)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from studio import platform_paths
from studio.platforms import DEFAULT_PLATFORM_ID

SKILL_FILE = platform_paths.SKILL_FILE


def user_cursor_root() -> Path:
    return platform_paths.user_root(DEFAULT_PLATFORM_ID)


def project_cursor_root(project_dir: Path) -> Path:
    return platform_paths.project_root(project_dir, DEFAULT_PLATFORM_ID)


def cursor_connection_info(project_dir: Path) -> dict[str, Any]:
    return platform_paths.connection_info(project_dir, DEFAULT_PLATFORM_ID)


def describe_scope(root: Path) -> dict[str, Any]:
    return platform_paths.describe_scope(root)


def list_installed_skills(skills_dir: Path) -> list[dict[str, str]]:
    return platform_paths.list_installed_skills(skills_dir)


def list_files(directory: Path, extensions: set[str]) -> list[str]:
    return platform_paths.list_files(directory, extensions)


def remove_skill(scope_root: Path, name: str) -> bool:
    return remove_asset(scope_root, name, "skill")


def remove_asset(scope_root: Path, name: str, asset_type: str) -> bool:
    return platform_paths.remove_asset(
        scope_root, name, asset_type, DEFAULT_PLATFORM_ID
    )
