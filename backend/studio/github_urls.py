"""GitHub web URLs for UI (distinct from raw.githubusercontent.com fetch URLs)."""

from __future__ import annotations

import urllib.parse


def repo_url(source_repo: str) -> str:
    return f"https://github.com/{source_repo.strip('/')}"


def blob_url(source_repo: str, branch: str, path: str) -> str:
    owner, _, repo = source_repo.partition("/")
    if not owner or not repo:
        return repo_url(source_repo)
    branch = branch or "main"
    clean = path.lstrip("/")
    encoded = urllib.parse.quote(clean, safe="/")
    return f"https://github.com/{owner}/{repo}/blob/{branch}/{encoded}"
