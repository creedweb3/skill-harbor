"""Unique install names and titles derived from repo paths."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path


def slugify(text: str, max_len: int = 80) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return (text[:max_len] or "item").strip("-")


def install_name_for(asset_type: str, repo: str, path: str) -> str:
    """Stable, unique install folder/file name for a source path."""
    p = Path(path.replace("\\", "/"))
    slug_repo = slugify(repo.split("/")[-1], 24)

    if asset_type == "skill":
        if p.name.lower() in ("skill.md", "skills.md"):
            base = p.parent.name
        else:
            base = p.stem
        if base.lower() in ("skill", "skills", ""):
            parts = p.parts
            base = parts[-2] if len(parts) >= 2 else base
        return slugify(base, 64)

    if asset_type == "rule":
        ext = ".mdc"
        parent = p.parent.name
        stem = p.stem
        core = slugify(f"{parent}-{stem}", 56)
        return f"{slug_repo}--{core}{ext}"

    slug_path = slugify(str(p.with_suffix("")), 64)
    if asset_type == "command":
        return f"{slug_repo}--{slug_path}.md"
    return f"{slug_repo}--{slug_path}.md"


def title_for(install_name: str, path: str) -> str:
    """Human-readable title; prefer leaf folder over generic category."""
    p = Path(path.replace("\\", "/"))
    if p.name.lower() == "skill.md" and p.parent.name:
        label = p.parent.name
    else:
        label = install_name
    label = label.replace(".mdc", "").replace("--", " / ")
    label = re.sub(r"[-_]+", " ", label)
    return label.strip().title()[:120]


def path_hash(path: str) -> str:
    return hashlib.sha256(path.encode("utf-8")).hexdigest()[:16]
