"""Re-run taxonomy v2 classification on all registry assets."""

from __future__ import annotations

from typing import Any

from studio import taxonomy
from studio.catalog import CatalogService
from studio.database import get_connection


def reclassify_registry() -> dict[str, Any]:
    from studio.safety import purge_unsafe_assets

    safety = purge_unsafe_assets()
    catalog = CatalogService()
    updated = 0
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, path, content_preview, content, category FROM assets"
        ).fetchall()

    for row in rows:
        aid = row["id"]
        path = row["path"] or ""
        text = (row["content"] or row["content_preview"] or "")[:8000]
        manifest = row["category"] or None
        result = taxonomy.classify_asset(text, path, manifest)
        tech = taxonomy.classify_tech_tags(text, path)
        catalog.upsert_classification(
            aid,
            result.primary_domain,
            result.secondary_domains,
            tech,
        )
        updated += 1

    return {
        "updated": updated,
        "domains": len(taxonomy.DOMAIN_CATEGORIES),
        "safety_removed": safety.get("removed", 0),
    }
