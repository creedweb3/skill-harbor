"""Admin-tunable Discovery panel layout and limits (stored in app_settings.discovery_ui)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from studio import app_settings, taxonomy

DEFAULT_DISCOVERY_UI: dict[str, Any] = {
    "version": 1,
    "layout": {"columns": 3, "rows": 2},
    "limits": {
        "profession_domain_count": 6,
        "items_per_domain": 6,
        "trending_limit": 9,
        "for_you_limit": 9,
    },
    "profession_domains": [
        "agent-ai",
        "backend-apis",
        "web-frameworks",
        "testing-security",
        "devops-infra",
        "growth-seo",
    ],
    "rotate_domains": False,
    "rotation_week_offset": 0,
}


def _merge_defaults(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not raw:
        return dict(DEFAULT_DISCOVERY_UI)
    out: dict[str, Any] = {
        "version": raw.get("version", DEFAULT_DISCOVERY_UI["version"]),
        "layout": {**DEFAULT_DISCOVERY_UI["layout"], **(raw.get("layout") or {})},
        "limits": {**DEFAULT_DISCOVERY_UI["limits"], **(raw.get("limits") or {})},
        "profession_domains": raw.get("profession_domains")
        or list(DEFAULT_DISCOVERY_UI["profession_domains"]),
        "rotate_domains": bool(raw.get("rotate_domains", False)),
        "rotation_week_offset": int(raw.get("rotation_week_offset", 0)),
    }
    return out


def get_discovery_ui() -> dict[str, Any]:
    raw = app_settings.get("discovery_ui")
    if isinstance(raw, str):
        import json

        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = None
    return _merge_defaults(raw if isinstance(raw, dict) else None)


def resolve_profession_domains(cfg: dict[str, Any] | None = None) -> list[dict[str, str]]:
    """Domains shown in Discovery 'By profession' (count + optional weekly rotation)."""
    c = cfg or get_discovery_ui()
    pool = [
        taxonomy.normalize_domain(d)
        for d in c.get("profession_domains", [])
        if taxonomy.normalize_domain(d) in taxonomy.DOMAIN_LABELS
    ]
    if not pool:
        pool = [p["domain"] for p in taxonomy.DISCOVERY_PROFESSIONS]

    count = int(c.get("limits", {}).get("profession_domain_count", 6))
    count = max(1, min(count, len(pool)))

    if c.get("rotate_domains") and len(pool) > count:
        week = datetime.now(timezone.utc).isocalendar()[1]
        offset = int(c.get("rotation_week_offset", 0))
        start = (week + offset) % len(pool)
        picked = [pool[(start + i) % len(pool)] for i in range(count)]
    else:
        picked = pool[:count]

    labels = taxonomy.DOMAIN_LABELS
    return [{"domain": d, "label": labels.get(d, d)} for d in picked]


def discovery_professions_for_api() -> list[dict[str, str]]:
    """Full profession list for filters; Discovery panel uses resolve_profession_domains()."""
    return list(taxonomy.DISCOVERY_PROFESSIONS)
