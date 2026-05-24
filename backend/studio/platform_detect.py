"""Detect which agent platforms are present on the local machine."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from studio import platform_paths
from studio.platforms import list_platforms


def _scope_score(root: Path, spec) -> int:
    if not root.is_dir():
        return 0
    score = 5
    for sub in (spec.skill_subdir, spec.rules_subdir, spec.commands_subdir, spec.agents_subdir):
        d = root / sub
        if d.is_dir():
            try:
                count = sum(1 for _ in d.iterdir())
                score += min(count * 2, 30)
            except OSError:
                pass
    return score


def detect_installed_platforms(project_dir: Path) -> dict[str, Any]:
    """Scan global + project agent folders; recommend best-matching platform."""
    candidates: list[dict[str, Any]] = []

    for spec in list_platforms(include_planned=False):
        if spec.status == "planned":
            continue
        user_root = platform_paths.user_root(spec.id)
        proj_root = platform_paths.project_root(project_dir, spec.id)
        user_score = _scope_score(user_root, spec)
        proj_score = _scope_score(proj_root, spec)
        total = user_score + proj_score
        if total <= 0:
            continue
        candidates.append(
            {
                "id": spec.id,
                "label": spec.label,
                "status": spec.status,
                "score": total,
                "global_root": str(user_root),
                "global_exists": user_root.is_dir(),
                "project_root": str(proj_root),
                "project_exists": proj_root.is_dir(),
            }
        )

    candidates.sort(key=lambda c: c["score"], reverse=True)
    recommended = candidates[0]["id"] if candidates else "cursor"

    return {
        "detected": candidates,
        "recommended_platform": recommended,
        "count": len(candidates),
    }
