#!/usr/bin/env python3
"""Admin CLI: build or refresh the harbor registry (requires admin token for star refresh)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from studio.catalog import CatalogService  # noqa: E402
from studio.registry_refresh import admin_refresh_registry, prune_low_star_assets  # noqa: E402
from studio.dedupe import dedupe_registry  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Build Skill Harbor registry")
    p.add_argument("--expand", action="store_true", help="Crawl seed repos (1k+ stars)")
    p.add_argument("--sync", action="store_true", help="Sync file content")
    p.add_argument("--dedupe-only", action="store_true", help="Fix names and remove duplicate rows")
    p.add_argument(
        "--reclassify-only",
        action="store_true",
        help="Re-run taxonomy v2 domains and tech stack tags on all assets",
    )
    p.add_argument("--full", action="store_true", help="expand + star refresh + prune + sync")
    p.add_argument(
        "--evolve-only",
        action="store_true",
        help="Full evolution: discover repos, expand, safety, reclassify, sync",
    )
    args = p.parse_args()

    catalog = CatalogService()
    catalog.ensure_seeded()

    if args.dedupe_only:
        print(dedupe_registry())
        print(catalog.stats())
        return 0

    if args.reclassify_only:
        from studio.reclassify import reclassify_registry

        print(reclassify_registry())
        print(catalog.stats())
        return 0

    if args.prune_only:
        print(prune_low_star_assets())
        return 0

    if args.evolve_only:
        from studio.registry_evolve import evolve_registry

        print(evolve_registry(sync=True, discover=True))
        print(catalog.stats())
        return 0

    if args.full or args.expand or args.sync:
        result = admin_refresh_registry(
            expand=args.full or args.expand,
            sync=args.full or args.sync,
        )
        print(result)
        return 0

    print(catalog.stats())
    print("Use --full for initial upload, or --prune-only to enforce 1k star rule.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
