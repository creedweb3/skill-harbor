"""Detect the active workspace / project directory for agent installs."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def detect_project_dir(start: Path | None = None) -> dict[str, Any]:
    """Pick a project root from cwd: prefer git root, then agent folder, else cwd."""
    cwd = (start or Path.cwd()).resolve()
    for candidate in [cwd, *cwd.parents]:
        if (candidate / ".git").is_dir():
            return {
                "project_dir": str(candidate),
                "method": "git",
                "cwd": str(cwd),
            }
        for marker in (".cursor", ".claude", ".codex"):
            if (candidate / marker).is_dir():
                return {
                    "project_dir": str(candidate),
                    "method": marker,
                    "cwd": str(cwd),
                }
    return {
        "project_dir": str(cwd),
        "method": "cwd",
        "cwd": str(cwd),
    }
