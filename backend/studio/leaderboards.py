"""Leaderboards from harbor DB."""

from __future__ import annotations

from typing import Any

from studio.catalog import CatalogService
from studio import taxonomy

# Legacy manifest category ids → taxonomy v2 primary domain
CURATED_CATEGORY_TO_DOMAIN: dict[str, str] = {
    "frontend": "web-frameworks",
    "backend": "backend-apis",
    "fullstack": "web-frameworks",
    "seo": "growth-seo",
    "geo-aeo": "growth-seo",
    "gsc": "growth-seo",
    "database": "backend-apis",
    "claude": "agent-ai",
    "cursor": "agent-ai",
    "orchestrator": "agent-ai",
    "ui": "design-ux",
    "ux": "design-ux",
    "mobile-responsive": "web-frameworks",
    "devops": "devops-infra",
    "security": "testing-security",
    "testing": "testing-security",
    "writing": "docs-workflow",
    "ecommerce": "growth-seo",
    "data": "data-ml",
    "crypto": "backend-apis",
    "intelligence": "agent-ai",
    "design": "design-ux",
    "performance": "web-frameworks",
}


def build_leaderboards() -> dict[str, Any]:
    catalog = CatalogService()
    stats = catalog.stats()
    top_assets = catalog.trending("all", limit=24)
    trending = [catalog._to_leaderboard_entry(a) for a in top_assets[:20]]
    top = [catalog._to_leaderboard_entry(a) for a in top_assets[:24]]
    by_domain = catalog.by_domain(5)

    return {
        "top_picks": top,
        "trending": trending,
        "by_domain": by_domain,
        "total_curated": stats.get("total_assets", 0),
    }
