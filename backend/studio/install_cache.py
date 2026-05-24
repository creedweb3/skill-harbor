"""TTL cache for filesystem install index (expensive to rebuild per request)."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_TTL_SEC = 45.0


def cache_key(user_root: Path, project_root: Path) -> str:
    return f"{user_root.resolve()}|{project_root.resolve()}"


def get_install_index(user_root: Path, project_root: Path) -> dict[str, Any]:
    from studio.installed import build_install_index

    key = cache_key(user_root, project_root)
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < _TTL_SEC:
        return hit[1]
    index = build_install_index(user_root, project_root)
    _CACHE[key] = (now, index)
    return index


def invalidate_install_index() -> None:
    _CACHE.clear()
