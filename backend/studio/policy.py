"""Harbor registry policy constants."""

from __future__ import annotations

from studio.app_settings import get_min_repo_stars

# Backward-compatible name
def min_repo_stars() -> int:
    return get_min_repo_stars()

# custom = user/admin added; manifest = curated json seed; discovered = crawl expand
SOURCE_CUSTOM = "custom"
SOURCE_MANIFEST = "manifest"
SOURCE_DISCOVERED = "discovered"
