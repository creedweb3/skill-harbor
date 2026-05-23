"""Leaderboards from harbor DB."""

from __future__ import annotations

from typing import Any

from studio.catalog import CatalogService
from studio import taxonomy

CURATED_CATEGORY_TO_DOMAIN: dict[str, str] = {
    "frontend": "web-development",
    "backend": "backend-apis",
    "fullstack": "full-stack",
    "seo": "marketing-seo",
    "geo-aeo": "marketing-seo",
    "gsc": "marketing-seo",
    "database": "database",
    "claude": "agent-ai",
    "cursor": "agent-ai",
    "orchestrator": "agent-ai",
    "ui": "product-design",
    "ux": "product-design",
    "mobile-responsive": "mobile-apps",
    "devops": "devops-infra",
    "security": "devops-infra",
    "testing": "web-development",
    "writing": "writing-docs",
    "ecommerce": "ecommerce",
    "data": "data-ml",
    "crypto": "crypto-web3",
}


def build_leaderboards() -> dict[str, Any]:
    catalog = CatalogService()
    catalog.ensure_seeded()
    stats = catalog.stats()
    trending_raw = catalog.trending("all", limit=20)
    top_picks = catalog.trending("all", limit=24)

    trending = [catalog._to_leaderboard_entry(a) for a in trending_raw[:20]]
    top = [catalog._to_leaderboard_entry(a) for a in top_picks[:24]]
    by_domain = catalog.by_domain(5)

    return {
        "top_picks": top,
        "trending": trending,
        "by_domain": by_domain,
        "total_curated": stats.get("total_assets", 0),
    }
