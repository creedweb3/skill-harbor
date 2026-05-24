"""Platform-aware asset writes to agent filesystem roots."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import TYPE_CHECKING, Any

from studio.platforms import PlatformSpec, get_platform
from studio.safety import assert_path_under_root, validate_install_name

if TYPE_CHECKING:
    import scrape_cursor_github as scraper

SKILL_FILENAME = "SKILL.md"
_PREVIEW_CHARS = 400


def _prepare_body(
    asset: scraper.Asset,
    text: str,
    spec: PlatformSpec,
) -> str:
    import scrape_cursor_github as scraper_mod

    asset_type = asset.asset_type
    if asset_type == "rule":
        ext = spec.rule_extension
        body = text
        if asset.source_path.endswith(".cursorrules") or not text.lstrip().startswith("---"):
            desc = f"Imported from {asset.source_repo} ({asset.source_path})"
            if ext == ".mdc":
                body = scraper_mod.wrap_cursorrules_as_mdc(text, desc)
            else:
                body = f"# {asset.install_name}\n\n{desc}\n\n{text}"
        return body
    return text


def resolve_install_destination(
    asset: scraper.Asset,
    base: Path,
    platform_id: str,
) -> Path | None:
    """Compute validated destination path; None if asset type unsupported on platform."""
    validate_install_name(asset.install_name)
    spec = get_platform(platform_id)
    asset_type = asset.asset_type
    root = base.resolve()

    if asset_type not in spec.supported_assets and not (
        asset_type == "agents_md" and "agents_md" in spec.supported_assets
    ):
        return None

    if asset_type == "rule":
        dest = root / spec.rules_subdir / asset.install_name
        ext = spec.rule_extension
        if dest.suffix.lower() not in {ext, ".md", ".mdc"}:
            dest = dest.with_suffix(ext)
    elif asset_type == "skill":
        dest = root / spec.skill_subdir / asset.install_name / spec.skill_filename
    elif asset_type == "command":
        dest = root / spec.commands_subdir / asset.install_name
    elif asset_type in ("agent", "agents_md"):
        dest = root / spec.agents_subdir / asset.install_name
    else:
        return None

    return assert_path_under_root(dest, root)


def plan_install_write(
    asset: scraper.Asset,
    text: str,
    base: Path,
    force: bool,
    platform_id: str,
) -> dict[str, Any] | None:
    """
    Plan a single install write without touching disk.
    Returns None when the asset type is unsupported on this platform.
    """
    spec = get_platform(platform_id)
    dest = resolve_install_destination(asset, base, platform_id)
    if dest is None:
        return None

    body = _prepare_body(asset, text, spec)
    new_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    exists = dest.is_file()
    existing_hash = ""
    existing_preview = ""
    if exists:
        try:
            existing_text = dest.read_text(encoding="utf-8")
            existing_hash = hashlib.sha256(existing_text.encode("utf-8")).hexdigest()
            existing_preview = existing_text[:_PREVIEW_CHARS]
        except OSError:
            existing_preview = ""

    unchanged = exists and existing_hash == new_hash
    if not exists:
        action = "create"
    elif unchanged:
        action = "unchanged"
    elif force:
        action = "overwrite"
    else:
        action = "skip_exists"

    return {
        "destination": str(dest),
        "allowed_root": str(base.resolve()),
        "install_name": asset.install_name,
        "asset_type": asset.asset_type,
        "platform_id": platform_id,
        "action": action,
        "exists": exists,
        "unchanged": unchanged,
        "would_write": action in ("create", "overwrite"),
        "new_content_sha256": new_hash,
        "existing_content_sha256": existing_hash or None,
        "content_preview": body[:_PREVIEW_CHARS],
        "existing_preview": existing_preview,
    }


def write_asset_for_platform(
    asset: scraper.Asset,
    text: str,
    base: Path,
    force: bool,
    platform_id: str,
) -> Path | None:
    """Write asset using platform-specific layout (rule extension, subdirs)."""
    plan = plan_install_write(asset, text, base, force, platform_id)
    if plan is None or not plan["would_write"]:
        return None

    dest = Path(plan["destination"])
    spec = get_platform(platform_id)
    body = _prepare_body(asset, text, spec)
    dest.parent.mkdir(parents=True, exist_ok=True)
    assert_path_under_root(dest, base.resolve())
    dest.write_text(body, encoding="utf-8", newline="\n")
    return dest
