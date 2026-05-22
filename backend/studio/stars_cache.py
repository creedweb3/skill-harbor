"""Persistent cache for GitHub repo star counts."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from studio import config

CACHE_PATH = config.CONFIG_DIR / "stars-cache.json"
TTL_SECONDS = 7 * 24 * 3600

# Approximate stars when API unavailable (updated periodically)
FALLBACK_STARS: dict[str, int] = {
    "anthropics/skills": 139_000,
    "vercel-labs/agent-skills": 27_000,
    "vercel-labs/next-skills": 8_000,
    "vercel-labs/skills": 5_000,
    "jeffallan/claude-skills": 9_000,
    "obra/superpowers": 12_000,
    "supabase/agent-skills": 4_000,
    "mcollina/skills": 3_000,
    "davila7/claude-code-templates": 6_000,
    "sanity-io/agent-toolkit": 2_000,
    "Bhanunamikaze/Agentic-SEO-Skill": 1_500,
    "PatrickJS/awesome-cursorrules": 22_000,
    "pbakaus/impeccable": 3_000,
    "mblode/agent-skills": 2_500,
}


def load_cache() -> dict[str, Any]:
    if not CACHE_PATH.is_file():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_cache(data: dict[str, Any]) -> None:
    config.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_stars(repo_full_name: str) -> int | None:
    entry = load_cache().get(repo_full_name)
    if entry and time.time() - entry.get("ts", 0) <= TTL_SECONDS:
        return int(entry.get("stars", 0))
    if repo_full_name in FALLBACK_STARS:
        return FALLBACK_STARS[repo_full_name]
    return None


def set_stars(repo_full_name: str, stars: int) -> None:
    data = load_cache()
    data[repo_full_name] = {"stars": stars, "ts": time.time()}
    save_cache(data)


def hydrate_stars(client: Any, repos: list[str], *, max_fetches: int = 25) -> None:
    """Fetch stars for repos missing from cache (requires API token)."""
    if not getattr(client, "use_api_metadata", False):
        return
    fetched = 0
    for full_name in repos:
        if fetched >= max_fetches:
            break
        if get_stars(full_name) is not None:
            continue
        owner, _, repo = full_name.partition("/")
        if not repo:
            continue
        try:
            meta = client.repo_meta(owner, repo)
            set_stars(full_name, int(meta.get("stargazers_count") or 0))
            fetched += 1
        except Exception:
            continue
