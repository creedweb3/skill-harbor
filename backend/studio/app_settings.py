"""Live registry / app settings stored in harbor.db (not hardcoded)."""

from __future__ import annotations

import json
import time
from typing import Any

from studio.database import get_connection
from studio.discovery_config import DEFAULT_DISCOVERY_UI

# Defaults used when key missing (seeded on bootstrap)
DEFAULTS: dict[str, tuple[Any, str, str]] = {
    "min_repo_stars": (5000, "int", "Minimum GitHub stars to list a repo in the registry"),
    "max_files_per_repo_expand": (200, "int", "Max skill/rule files ingested per repo on expand"),
    "discover_max_per_skills_query": (30, "int", "GitHub search results per page per query"),
    "discover_max_per_domain_query": (15, "int", "GitHub search results per domain query (legacy)"),
    "discover_search_pages": (5, "int", "Pages of search results to fetch per query per run"),
    "discover_enqueue_cap": (200, "int", "Max new repos to enqueue per discover run"),
    "discover_queries_per_run": (12, "int", "Number of search queries to rotate through per discover run"),
    "discover_query_offset": (0, "int", "Rotation cursor for search query list"),
    "discover_path_queries_per_run": (4, "int", "Path/name queries per discover run (rotates)"),
    "discover_path_query_offset": (0, "int", "Rotation cursor for path search query list"),
    "discover_code_verify_budget": (8, "int", "Max code-search verifications per discover run"),
    "max_repos_per_evolve": (30, "int", "Max repos to crawl per evolve/crawl batch"),
    "crawl_batch_size": (30, "int", "Repos to crawl from discovery queue per batch"),
    "crawl_cooldown_hours": (168, "int", "Hours before re-crawling the same repo (7 days)"),
    "discovery_ui": (
        DEFAULT_DISCOVERY_UI,
        "json",
        "Discovery panel layout, limits, and profession domain order (JSON)",
    ),
}

_cache: dict[str, Any] = {}
_cache_ts: float = 0
_CACHE_TTL = 5.0


def _coerce(value: str, value_type: str) -> Any:
    if value_type == "int":
        return int(value)
    if value_type == "float":
        return float(value)
    if value_type == "bool":
        return value.lower() in ("1", "true", "yes", "on")
    if value_type == "json":
        return json.loads(value)
    return value


def _serialize(value: Any, value_type: str) -> str:
    if value_type == "json":
        return json.dumps(value)
    return str(value)


def invalidate_cache() -> None:
    global _cache_ts
    _cache.clear()
    _cache_ts = 0


def _load_all(force: bool = False) -> dict[str, Any]:
    global _cache_ts
    now = time.time()
    if not force and _cache and now - _cache_ts < _CACHE_TTL:
        return _cache

    out: dict[str, Any] = {}
    with get_connection() as conn:
        rows = conn.execute("SELECT key, value, value_type FROM app_settings").fetchall()
        for row in rows:
            out[row["key"]] = _coerce(row["value"], row["value_type"])

    for key, (default, vtype, _) in DEFAULTS.items():
        out.setdefault(key, default)

    _cache.clear()
    _cache.update(out)
    _cache_ts = now
    return out


def get(key: str, default: Any = None) -> Any:
    return _load_all().get(key, default)


def get_int(key: str, default: int = 0) -> int:
    val = get(key, default)
    return int(val)


def get_min_repo_stars() -> int:
    return get_int("min_repo_stars", 5000)


def list_settings() -> list[dict[str, Any]]:
    meta = {k: v for k, v in DEFAULTS.items()}
    loaded = _load_all(force=True)
    result: list[dict[str, Any]] = []
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT key, value, value_type, description, updated_at, updated_by FROM app_settings"
        ).fetchall()
        db_keys = {row["key"] for row in rows}
        for row in rows:
            result.append(
                {
                    "key": row["key"],
                    "value": _coerce(row["value"], row["value_type"]),
                    "value_type": row["value_type"],
                    "description": row["description"] or meta.get(row["key"], ("", "", ""))[2],
                    "updated_at": row["updated_at"],
                    "updated_by": row["updated_by"],
                }
            )
        for key, (default, vtype, desc) in DEFAULTS.items():
            if key not in db_keys:
                result.append(
                    {
                        "key": key,
                        "value": loaded.get(key, default),
                        "value_type": vtype,
                        "description": desc,
                        "updated_at": None,
                        "updated_by": "",
                    }
                )
    result.sort(key=lambda x: x["key"])
    return result


def set_setting(key: str, value: Any, *, updated_by: str = "admin") -> None:
    if key not in DEFAULTS:
        raise ValueError(f"Unknown setting: {key}")
    default, vtype, desc = DEFAULTS[key]
    serialized = _serialize(value, vtype)
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO app_settings (key, value, value_type, description, updated_at, updated_by)
            VALUES (?, ?, ?, ?, datetime('now'), ?)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = datetime('now'),
              updated_by = excluded.updated_by
            """,
            (key, serialized, vtype, desc, updated_by),
        )
        conn.commit()
    invalidate_cache()


def seed_defaults() -> None:
    with get_connection() as conn:
        for key, (default, vtype, desc) in DEFAULTS.items():
            exists = conn.execute(
                "SELECT 1 FROM app_settings WHERE key = ?", (key,)
            ).fetchone()
            if exists:
                continue
            conn.execute(
                """
                INSERT INTO app_settings (key, value, value_type, description)
                VALUES (?, ?, ?, ?)
                """,
                (key, _serialize(default, vtype), vtype, desc),
            )
        conn.commit()
    invalidate_cache()
