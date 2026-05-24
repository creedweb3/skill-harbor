"""Platform-aware asset writes to agent filesystem roots."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from studio.platforms import PlatformSpec, get_platform

if TYPE_CHECKING:
    import scrape_cursor_github as scraper

SKILL_FILENAME = "SKILL.md"


def write_asset_for_platform(
    asset: scraper.Asset,
    text: str,
    base: Path,
    force: bool,
    platform_id: str,
) -> Path | None:
    """Write asset using platform-specific layout (rule extension, subdirs)."""
    import scrape_cursor_github as scraper_mod

    spec = get_platform(platform_id)
    base.mkdir(parents=True, exist_ok=True)
    asset_type = asset.asset_type

    if asset_type not in spec.supported_assets and not (
        asset_type == "agents_md" and "agents_md" in spec.supported_assets
    ):
        return None

    if asset_type == "rule":
        rules_dir = base / spec.rules_subdir
        rules_dir.mkdir(exist_ok=True)
        dest = rules_dir / asset.install_name
        ext = spec.rule_extension
        if dest.suffix.lower() not in {ext, ".md", ".mdc"}:
            dest = dest.with_suffix(ext)
        body = text
        if asset.source_path.endswith(".cursorrules") or not text.lstrip().startswith("---"):
            desc = f"Imported from {asset.source_repo} ({asset.source_path})"
            if ext == ".mdc":
                body = scraper_mod.wrap_cursorrules_as_mdc(text, desc)
            else:
                body = f"# {asset.install_name}\n\n{desc}\n\n{text}"
    elif asset_type == "skill":
        skill_dir = base / spec.skill_subdir / asset.install_name
        skill_dir.mkdir(parents=True, exist_ok=True)
        dest = skill_dir / spec.skill_filename
        body = text
    elif asset_type == "command":
        cmd_dir = base / spec.commands_subdir
        cmd_dir.mkdir(exist_ok=True)
        dest = cmd_dir / asset.install_name
        body = text
    elif asset_type in ("agent", "agents_md"):
        agents_dir = base / spec.agents_subdir
        agents_dir.mkdir(exist_ok=True)
        dest = agents_dir / asset.install_name
        body = text
    else:
        return None

    if dest.exists() and not force:
        return None
    dest.write_text(body, encoding="utf-8", newline="\n")
    return dest
