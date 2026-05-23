"""Remove duplicate registry rows and fix colliding display names."""

from __future__ import annotations

from typing import Any

from studio.database import get_connection
from studio.naming import install_name_for, slugify, title_for

SOURCE_PRIORITY = {"manifest": 0, "custom": 1, "discovered": 2}

SKIP_PATH_FRAGMENTS = ("/_template.", "/_template/", "rules/_template")


def _should_skip_path(path: str) -> bool:
    lower = path.replace("\\", "/").lower()
    return any(f in lower for f in SKIP_PATH_FRAGMENTS)


def dedupe_registry(*, fix_names: bool = True) -> dict[str, Any]:
    """Drop junk paths, identical content, and refresh install/title from paths."""
    removed_templates = _remove_template_paths()
    removed_content = _dedupe_by_content_hash()
    renamed = _fix_display_names() if fix_names else 0
    removed_install = _dedupe_by_install_name()
    return {
        "removed_templates": removed_templates,
        "removed_content_dupes": removed_content,
        "renamed": renamed,
        "removed_install_collisions": removed_install,
    }


def _remove_template_paths() -> int:
    with get_connection() as conn:
        before = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        rows = conn.execute("SELECT id, path FROM assets").fetchall()
        for row in rows:
            if _should_skip_path(row["path"]):
                conn.execute("DELETE FROM assets WHERE id = ?", (row["id"],))
        conn.commit()
        after = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
    return before - after


def _pick_keep_id(rows: list) -> str:
    best_id = rows[0]["id"]
    best_key = None
    for row in rows:
        st = row["source_type"] or "discovered"
        key = (
            SOURCE_PRIORITY.get(st, 9),
            -(row["stars"] or 0),
            len(row["path"] or ""),
            row["id"],
        )
        if best_key is None or key < best_key:
            best_key = key
            best_id = row["id"]
    return best_id


def _dedupe_by_content_hash() -> int:
    removed = 0
    with get_connection() as conn:
        shas = conn.execute(
            """
            SELECT content_sha256 FROM assets
            WHERE content_sha256 IS NOT NULL AND content_sha256 != ''
            GROUP BY content_sha256 HAVING COUNT(*) > 1
            """
        ).fetchall()
        for (sha,) in shas:
            rows = conn.execute(
                "SELECT id, path, stars, source_type FROM assets WHERE content_sha256 = ?",
                (sha,),
            ).fetchall()
            keep_id = _pick_keep_id(rows)
            for row in rows:
                if row["id"] != keep_id:
                    conn.execute("DELETE FROM assets WHERE id = ?", (row["id"],))
                    removed += 1
        conn.commit()
    return removed


def _dedupe_by_install_name() -> int:
    """Same repo + install_name: keep best row, delete the rest."""
    removed = 0
    with get_connection() as conn:
        groups = conn.execute(
            """
            SELECT source_repo, install_name FROM assets
            GROUP BY source_repo, install_name HAVING COUNT(*) > 1
            """
        ).fetchall()
        for source_repo, install_name in groups:
            rows = conn.execute(
                """
                SELECT id, path, stars, source_type FROM assets
                WHERE source_repo = ? AND install_name = ?
                """,
                (source_repo, install_name),
            ).fetchall()
            keep_id = _pick_keep_id(rows)
            for row in rows:
                if row["id"] != keep_id:
                    conn.execute("DELETE FROM assets WHERE id = ?", (row["id"],))
                    removed += 1
        conn.commit()
    return removed


def _fix_display_names() -> int:
    updated = 0
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, repo, path, asset_type, install_name, title, source_repo FROM assets"
        ).fetchall()
        used: dict[tuple[str, str], str] = {}
        for row in rows:
            asset_type = row["asset_type"] or "skill"
            inst = install_name_for(asset_type, row["repo"], row["path"])
            key = (row["source_repo"], inst)
            if key in used:
                leaf = row["path"].replace("\\", "/").rstrip("/").split("/")[-2]
                inst = (
                    slugify(f"{inst}-{leaf}", 60)
                    if asset_type == "skill"
                    else slugify(f"{inst}-{leaf}", 64)
                )
            used[key] = row["id"]
            title = title_for(inst, row["path"])
            if inst != row["install_name"] or title != row["title"]:
                conn.execute(
                    "UPDATE assets SET install_name = ?, title = ? WHERE id = ?",
                    (inst, title, row["id"]),
                )
                updated += 1
        conn.commit()
    return updated
