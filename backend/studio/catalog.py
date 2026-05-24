"""Harbor catalog service — DB-first asset registry."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio import scraper_bridge, taxonomy
from studio.platform_compat import detect_platforms
from studio.safety import assess_content_safety

# List reads omit `content` — full body is loaded via GET /api/asset only.
_LIST_SELECT = """
    a.id, a.owner, a.repo, a.path, a.source_repo, a.title, a.install_name, a.asset_type,
    a.category, a.rank, a.stars, a.score, a.content_sha256, a.content_preview,
    a.raw_url, a.branch, a.repo_pushed_at, a.synced_at, a.notes, a.source_type,
    a.upvotes, a.downvotes, a.primary_domain
"""
from studio.app_settings import get_min_repo_stars
from studio.database import fts_match_query, get_connection, row_to_dict
from studio.github_urls import blob_url, repo_url
from studio.policy import SOURCE_CUSTOM, SOURCE_DISCOVERED, SOURCE_MANIFEST

PERIOD_MS = {
    "day": 86400000,
    "week": 7 * 86400000,
    "month": 30 * 86400000,
    "year": 365 * 86400000,
    "all": None,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _asset_id(owner: str, repo: str, path: str) -> str:
    return f"{owner}/{repo}::{path.lstrip('/')}"


def _preview(text: str, limit: int = 280) -> str:
    flat = " ".join(text.split())
    return flat[:limit] + ("…" if len(flat) > limit else "")


class CatalogService:
    def ensure_seeded(self) -> int:
        with get_connection() as conn:
            count = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        if count == 0:
            self.seed_from_manifests()
        with get_connection() as conn:
            count = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        if count < 100:
            from studio.registry_expand import expand_registry

            expand_registry(max_files_per_repo=150)
            with get_connection() as conn:
                count = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        self.backfill_platforms()
        return count

    def backfill_platforms(self) -> int:
        from studio.platform_compat import backfill_asset_platforms

        with get_connection() as conn:
            return backfill_asset_platforms(conn)

    def seed_from_manifests(self) -> int:
        entries = scraper_bridge.load_all_curated_entries()
        n = 0
        for entry in entries:
            owner = entry.get("owner", "")
            repo = entry.get("repo", "")
            path = entry.get("path", "")
            if not owner or not repo or not path:
                continue
            aid = _asset_id(owner, repo, path)
            install = entry.get("install_folder") or entry.get("title", "")
            title = entry.get("title") or install
            category = entry.get("category", "")
            rank = int(entry.get("rank") or 99)
            asset_type = entry.get("asset_type") or taxonomy.detect_asset_type(path)
            manifest_platforms = entry.get("platforms")
            platform_ids = detect_platforms(path, asset_type, manifest_platforms)
            domain = category
            classified = taxonomy.classify_asset("", path, category)
            tech = taxonomy.classify_tech_tags("", path)

            row = {
                "id": aid,
                "owner": owner,
                "repo": repo,
                "path": path,
                "source_repo": f"{owner}/{repo}",
                "title": title,
                "install_name": install,
                "asset_type": asset_type,
                "category": category,
                "rank": rank,
                "stars": int(entry.get("stars") or 0),
                "score": float(rank),
                "content_sha256": "",
                "content": "",
                "content_preview": title,
                "raw_url": "",
                "branch": entry.get("branch") or "main",
                "repo_pushed_at": "",
                "synced_at": "",
                "notes": entry.get("notes") or "",
                "source_type": SOURCE_MANIFEST,
                "primary_domain": classified.primary_domain,
            }
            self.upsert_asset(
                row,
                primary_domain=classified.primary_domain,
                secondary_domains=classified.secondary_domains,
                tech_tags=tech,
                platforms=platform_ids,
            )
            n += 1
        return n

    def upsert_asset(
        self,
        row: dict[str, Any],
        domains: list[str] | None = None,
        *,
        primary_domain: str | None = None,
        secondary_domains: list[str] | None = None,
        tech_tags: list[str] | None = None,
        platforms: list[str] | None = None,
    ) -> None:
        row.setdefault("source_type", SOURCE_DISCOVERED)
        if primary_domain is None and domains:
            primary_domain = taxonomy.normalize_domain(domains[0])
            secondary_domains = []
        elif primary_domain is None:
            text = row.get("content_preview") or row.get("content") or ""
            path = row.get("path", "")
            cat = row.get("category") or None
            classified = taxonomy.classify_asset(text, path, cat)
            primary_domain = classified.primary_domain
            secondary_domains = []
            if tech_tags is None:
                tech_tags = taxonomy.classify_tech_tags(text, path)

        row["primary_domain"] = primary_domain or "docs-workflow"
        secondary_domains = secondary_domains or []

        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO assets (
                    id, owner, repo, path, source_repo, title, install_name, asset_type,
                    category, rank, stars, score, content_sha256, content, content_preview,
                    raw_url, branch, repo_pushed_at, synced_at, notes, source_type,
                    primary_domain
                ) VALUES (
                    :id, :owner, :repo, :path, :source_repo, :title, :install_name, :asset_type,
                    :category, :rank, :stars, :score, :content_sha256, :content, :content_preview,
                    :raw_url, :branch, :repo_pushed_at, :synced_at, :notes, :source_type,
                    :primary_domain
                )
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    install_name=excluded.install_name,
                    asset_type=excluded.asset_type,
                    category=excluded.category,
                    rank=excluded.rank,
                    stars=excluded.stars,
                    score=excluded.score,
                    content_sha256=excluded.content_sha256,
                    content=excluded.content,
                    content_preview=excluded.content_preview,
                    raw_url=excluded.raw_url,
                    branch=excluded.branch,
                    repo_pushed_at=excluded.repo_pushed_at,
                    synced_at=excluded.synced_at,
                    notes=excluded.notes,
                    primary_domain=excluded.primary_domain,
                    source_type=CASE
                        WHEN assets.source_type = 'custom' THEN assets.source_type
                        ELSE excluded.source_type
                    END
                """,
                row,
            )
            aid = row["id"]
            conn.execute("DELETE FROM asset_domains WHERE asset_id = ?", (aid,))
            for d in secondary_domains:
                conn.execute(
                    "INSERT OR IGNORE INTO asset_domains (asset_id, domain) VALUES (?, ?)",
                    (aid, d),
                )
            if tech_tags is not None:
                conn.execute("DELETE FROM asset_tech_tags WHERE asset_id = ?", (aid,))
                for tag in tech_tags:
                    conn.execute(
                        "INSERT OR IGNORE INTO asset_tech_tags (asset_id, tag) VALUES (?, ?)",
                        (aid, tag),
                    )
            path = row.get("path", "")
            asset_type = row.get("asset_type", "skill")
            manifest_hint = row.pop("_platforms", None) or platforms
            platform_ids = detect_platforms(path, asset_type, manifest_hint)
            conn.execute("DELETE FROM asset_platforms WHERE asset_id = ?", (aid,))
            for pid in platform_ids:
                conn.execute(
                    "INSERT OR IGNORE INTO asset_platforms (asset_id, platform) VALUES (?, ?)",
                    (aid, pid),
                )
            conn.commit()

    def upsert_classification(
        self,
        asset_id: str,
        primary_domain: str,
        secondary_domains: list[str],
        tech_tags: list[str],
    ) -> None:
        with get_connection() as conn:
            conn.execute(
                "UPDATE assets SET primary_domain = ? WHERE id = ?",
                (primary_domain, asset_id),
            )
            conn.execute("DELETE FROM asset_domains WHERE asset_id = ?", (asset_id,))
            for d in secondary_domains:
                conn.execute(
                    "INSERT OR IGNORE INTO asset_domains (asset_id, domain) VALUES (?, ?)",
                    (asset_id, d),
                )
            conn.execute("DELETE FROM asset_tech_tags WHERE asset_id = ?", (asset_id,))
            for tag in tech_tags:
                conn.execute(
                    "INSERT OR IGNORE INTO asset_tech_tags (asset_id, tag) VALUES (?, ?)",
                    (asset_id, tag),
                )
            conn.commit()

    def list_assets(
        self,
        *,
        domain: str | None = None,
        tech_tag: str | None = None,
        asset_type: str | None = None,
        q: str | None = None,
        period: str = "all",
        platform: str | None = None,
        limit: int = 60,
        offset: int = 0,
        include_all: bool = False,
    ) -> tuple[list[dict[str, Any]], int]:
        clauses: list[str] = []
        params: list[Any] = []

        if not include_all:
            clauses.append(f"(a.stars >= ? OR a.source_type = ?)")
            params.extend([get_min_repo_stars(), SOURCE_CUSTOM])

        if domain:
            dom = taxonomy.normalize_domain(domain)
            clauses.append(
                "(a.primary_domain = ? OR EXISTS ("
                "SELECT 1 FROM asset_domains d WHERE d.asset_id = a.id AND d.domain = ?))"
            )
            params.extend([dom, dom])

        if tech_tag:
            clauses.append(
                "EXISTS (SELECT 1 FROM asset_tech_tags t WHERE t.asset_id = a.id AND t.tag = ?)"
            )
            params.append(tech_tag)

        if asset_type and asset_type != "all":
            clauses.append("a.asset_type = ?")
            params.append(asset_type)

        if platform and platform != "all":
            clauses.append(
                "EXISTS (SELECT 1 FROM asset_platforms p WHERE p.asset_id = a.id AND p.platform = ?)"
            )
            params.append(platform)

        if q:
            q_norm = q.strip()
            fts_q = fts_match_query(q_norm)
            fts_parts: list[str] = []
            if fts_q:
                fts_parts.append(
                    "EXISTS (SELECT 1 FROM assets_fts "
                    "WHERE assets_fts.asset_id = a.id AND assets_fts MATCH ?)"
                )
                params.append(fts_q)
            if "github.com/" in q_norm.lower():
                tail = q_norm.lower().split("github.com/")[-1].strip("/")
                gh_parts = tail.split("/")
                if len(gh_parts) >= 2:
                    repo_like = f"%{gh_parts[0]}/{gh_parts[1].split('.')[0]}%"
                    fts_parts.append("a.source_repo LIKE ?")
                    params.append(repo_like)
            if not fts_parts:
                like = f"%{q_norm}%"
                fts_parts.append(
                    "(a.title LIKE ? OR a.install_name LIKE ? OR a.source_repo LIKE ? "
                    "OR a.path LIKE ? OR a.content_preview LIKE ? OR a.raw_url LIKE ? OR a.id LIKE ?)"
                )
                params.extend([like, like, like, like, like, like, like])
            clauses.append(f"({' OR '.join(fts_parts)})")

        if period != "all" and PERIOD_MS.get(period):
            # filter by repo_pushed_at ISO string — approximate via datetime
            clauses.append("a.repo_pushed_at != ''")

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = (
            f"SELECT {_LIST_SELECT} FROM assets a {where} "
            "ORDER BY (a.upvotes - a.downvotes) DESC, a.stars DESC, a.title COLLATE NOCASE"
        )

        with get_connection() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM assets a {where}", params
            ).fetchone()[0]
            rows = conn.execute(f"{sql} LIMIT ? OFFSET ?", [*params, limit, offset]).fetchall()

        assets = self._rows_to_api_list(rows)

        if period != "all" and PERIOD_MS.get(period):
            assets = [a for a in assets if self._in_period(a.get("repo_pushed_at", ""), period)]
            total = len(assets)

        return assets, total

    def get_asset(self, asset_id: str) -> dict[str, Any] | None:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
            if not row:
                return None
        api = self._row_to_api(row)
        return api

    def trending(self, period: str = "week", limit: int = 20) -> list[dict[str, Any]]:
        assets, _ = self.list_assets(period=period, limit=limit)
        return assets

    def leaderboard_by_domains(
        self, domains: list[str], *, limit_per: int = 5
    ) -> list[dict[str, Any]]:
        """Top assets per domain in one query (avoids N× list_assets round-trips)."""
        if not domains:
            return []
        doms = [taxonomy.normalize_domain(d) for d in domains]
        placeholders = ",".join("?" * len(doms))
        min_stars = get_min_repo_stars()
        sql = f"""
            WITH ranked AS (
                SELECT a.id,
                       COALESCE(NULLIF(TRIM(a.primary_domain), ''), 'docs-workflow') AS dom,
                       ROW_NUMBER() OVER (
                           PARTITION BY COALESCE(NULLIF(TRIM(a.primary_domain), ''), 'docs-workflow')
                           ORDER BY a.stars DESC, a.title COLLATE NOCASE
                       ) AS rn
                FROM assets a
                WHERE (a.stars >= ? OR a.source_type = ?)
            )
            SELECT {_LIST_SELECT}
            FROM assets a
            INNER JOIN ranked r ON r.id = a.id AND r.rn <= ?
            WHERE r.dom IN ({placeholders})
            ORDER BY r.dom COLLATE NOCASE, r.rn
        """
        params: list[Any] = [min_stars, SOURCE_CUSTOM, limit_per, *doms]
        with get_connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        assets = self._rows_to_api_list(rows)
        by_dom: dict[str, list[dict[str, Any]]] = {d: [] for d in doms}
        for a in assets:
            dom = taxonomy.normalize_domain(a.get("primary_domain") or "docs-workflow")
            if dom in by_dom and len(by_dom[dom]) < limit_per:
                by_dom[dom].append(a)
        labels = taxonomy.DOMAIN_LABELS
        prof_order = {p["domain"]: p["label"] for p in taxonomy.DISCOVERY_PROFESSIONS}
        out: list[dict[str, Any]] = []
        for domain in doms:
            items = by_dom.get(domain, [])
            if not items:
                continue
            out.append(
                {
                    "domain": domain,
                    "label": labels.get(domain, prof_order.get(domain, domain)),
                    "items": [
                        self._to_leaderboard_entry(a, rank=i + 1) for i, a in enumerate(items)
                    ],
                }
            )
        return out

    def by_domain(self, limit_per: int = 5) -> list[dict[str, Any]]:
        domains = [p["domain"] for p in taxonomy.DISCOVERY_PROFESSIONS]
        return self.leaderboard_by_domains(domains, limit_per=limit_per)

    def list_repo_owners(self, *, include_all: bool = False) -> list[dict[str, Any]]:
        """Distinct GitHub owners in the registry (for Browse author filter)."""
        clauses: list[str] = []
        params: list[Any] = []
        if not include_all:
            clauses.append("(stars >= ? OR source_type = ?)")
            params.extend([get_min_repo_stars(), SOURCE_CUSTOM])
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
            SELECT
              CASE
                WHEN instr(source_repo, '/') > 0
                THEN substr(source_repo, 1, instr(source_repo, '/') - 1)
                ELSE source_repo
              END AS owner,
              COUNT(*) AS asset_count,
              COUNT(DISTINCT source_repo) AS repo_count
            FROM assets
            {where}
            GROUP BY owner
            HAVING owner != ''
            ORDER BY owner COLLATE NOCASE
        """
        with get_connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            {
                "owner": r["owner"],
                "asset_count": int(r["asset_count"]),
                "repo_count": int(r["repo_count"]),
            }
            for r in rows
        ]

    def stats(self) -> dict[str, Any]:
        with get_connection() as conn:
            total = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
            synced = conn.execute(
                "SELECT COUNT(*) FROM assets WHERE content != ''"
            ).fetchone()[0]
            last = conn.execute(
                "SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return {
            "total_assets": total,
            "synced_content": synced,
            "last_sync": row_to_dict(last),
        }

    def _load_related_maps(
        self, conn, asset_ids: list[str]
    ) -> tuple[dict[str, list[str]], dict[str, list[str]], dict[str, list[str]]]:
        if not asset_ids:
            return {}, {}, {}
        placeholders = ",".join("?" * len(asset_ids))
        domains: dict[str, list[str]] = {}
        for aid, dom in conn.execute(
            f"SELECT asset_id, domain FROM asset_domains WHERE asset_id IN ({placeholders})",
            asset_ids,
        ):
            domains.setdefault(aid, []).append(dom)
        tech: dict[str, list[str]] = {}
        for aid, tag in conn.execute(
            f"SELECT asset_id, tag FROM asset_tech_tags WHERE asset_id IN ({placeholders}) ORDER BY tag",
            asset_ids,
        ):
            tech.setdefault(aid, []).append(tag)
        platforms: dict[str, list[str]] = {}
        for aid, plat in conn.execute(
            f"SELECT asset_id, platform FROM asset_platforms WHERE asset_id IN ({placeholders}) ORDER BY platform",
            asset_ids,
        ):
            platforms.setdefault(aid, []).append(plat)
        return domains, tech, platforms

    def _rows_to_api_list(self, rows: list[Any]) -> list[dict[str, Any]]:
        if not rows:
            return []
        dicts = [row_to_dict(r) or {} for r in rows]
        ids = [d["id"] for d in dicts if d.get("id")]
        with get_connection() as conn:
            sec_map, tech_map, plat_map = self._load_related_maps(conn, ids)
        return [
            self._row_to_api_dict(
                d,
                secondary_domains=sec_map.get(d.get("id", ""), []),
                tech_tags=tech_map.get(d.get("id", ""), []),
                platform_ids=plat_map.get(d.get("id", ""), []),
                include_content=False,
            )
            for d in dicts
        ]

    def _row_to_api(self, row: Any) -> dict[str, Any]:
        d = row_to_dict(row) or {}
        aid = d.get("id", "")
        with get_connection() as conn:
            sec_map, tech_map, plat_map = self._load_related_maps(conn, [aid] if aid else [])
        return self._row_to_api_dict(
            d,
            secondary_domains=sec_map.get(aid, []),
            tech_tags=tech_map.get(aid, []),
            platform_ids=plat_map.get(aid, []),
            include_content=True,
        )

    def _row_to_api_dict(
        self,
        d: dict[str, Any],
        *,
        secondary_domains: list[str],
        tech_tags: list[str],
        platform_ids: list[str],
        include_content: bool,
    ) -> dict[str, Any]:
        aid = d.get("id", "")
        source_repo = d.get("source_repo", "")
        path = d.get("path", "")
        branch = d.get("branch") or "main"
        primary = taxonomy.normalize_domain(
            d.get("primary_domain") or d.get("category") or "docs-workflow"
        )
        if not platform_ids:
            platform_ids = detect_platforms(path, d.get("asset_type", "skill"))
        domains = [primary]
        gh_blob = blob_url(source_repo, branch, path) if source_repo and path else ""
        gh_repo = repo_url(source_repo) if source_repo else ""
        preview = d.get("content_preview", "")
        return {
            "id": aid,
            "source_repo": source_repo,
            "source_path": path,
            "asset_type": d.get("asset_type", "skill"),
            "asset_type_label": taxonomy.ASSET_TYPE_LABELS.get(
                d.get("asset_type", "skill"), d.get("asset_type", "skill")
            ),
            "primary_domain": primary,
            "secondary_domains": secondary_domains,
            "categories": domains,
            "domains": domains,
            "tech_tags": tech_tags,
            "platforms": platform_ids,
            "score": d.get("score", 0),
            "stars": d.get("stars", 0),
            "content_preview": preview,
            "content_sha256": d.get("content_sha256", ""),
            "content": d.get("content", "") if include_content else "",
            "install_name": d.get("install_name", ""),
            "raw_url": d.get("raw_url", ""),
            "branch": branch,
            "github_blob_url": gh_blob,
            "github_repo_url": gh_repo,
            "curated": True,
            "curated_rank": d.get("rank", 99),
            "curated_title": d.get("title", ""),
            "repo_pushed_at": d.get("repo_pushed_at", ""),
            "synced_at": d.get("synced_at", ""),
            "notes": d.get("notes", ""),
            "source_type": d.get("source_type", SOURCE_DISCOVERED),
            "upvotes": d.get("upvotes", 0),
            "downvotes": d.get("downvotes", 0),
            "vote_score": int(d.get("upvotes", 0)) - int(d.get("downvotes", 0)),
            "safety": assess_content_safety(preview, path).to_dict(),
        }

    def _to_leaderboard_entry(self, a: dict[str, Any], rank: int | None = None) -> dict[str, Any]:
        parts = a["id"].split("::", 1)
        repo_part = parts[0] if parts else ""
        path = parts[1] if len(parts) > 1 else ""
        owner, _, repo = repo_part.partition("/")
        return {
            "id": a["id"],
            "title": a.get("curated_title") or a.get("install_name", ""),
            "install_folder": a.get("install_name", ""),
            "category": a.get("categories", [""])[0] if a.get("categories") else "",
            "domain": a.get("primary_domain") or (a.get("domains", [""])[0] if a.get("domains") else ""),
            "rank": rank if rank is not None else a.get("curated_rank", 99),
            "owner": owner,
            "repo": repo,
            "path": path,
            "source_repo": a.get("source_repo", ""),
        }

    def _in_period(self, pushed_at: str, period: str) -> bool:
        if not pushed_at or period == "all":
            return period == "all"
        try:
            from datetime import datetime

            ts = datetime.fromisoformat(pushed_at.replace("Z", "+00:00")).timestamp() * 1000
            now = datetime.now(timezone.utc).timestamp() * 1000
            ms = PERIOD_MS.get(period)
            return ms is not None and (now - ts) <= ms
        except Exception:
            return True

    def start_sync_run(self) -> int:
        with get_connection() as conn:
            cur = conn.execute(
                "INSERT INTO sync_runs (started_at, status) VALUES (?, 'running')",
                (_now_iso(),),
            )
            conn.commit()
            return int(cur.lastrowid)

    def finish_sync_run(
        self, run_id: int, *, updated: int, errors: list[str], status: str = "ok"
    ) -> None:
        with get_connection() as conn:
            conn.execute(
                """
                UPDATE sync_runs SET
                    finished_at = ?, status = ?, assets_updated = ?,
                    error_count = ?, message = ?
                WHERE id = ?
                """,
                (
                    _now_iso(),
                    status,
                    updated,
                    len(errors),
                    json.dumps(errors[:20]),
                    run_id,
                ),
            )
            conn.commit()

    def all_asset_rows(self) -> list[dict[str, Any]]:
        with get_connection() as conn:
            rows = conn.execute("SELECT * FROM assets ORDER BY rank, title").fetchall()
        return [dict(r) for r in rows]

    def update_content(
        self,
        asset_id: str,
        *,
        content: str,
        raw_url: str,
        branch: str,
        stars: int,
        repo_pushed_at: str,
    ) -> None:
        sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
        preview = _preview(content) if content else ""
        with get_connection() as conn:
            conn.execute(
                """
                UPDATE assets SET
                    content = ?, content_sha256 = ?, content_preview = ?,
                    raw_url = ?, branch = ?, stars = ?, repo_pushed_at = ?,
                    synced_at = ?
                WHERE id = ?
                """,
                (
                    content,
                    sha,
                    preview,
                    raw_url,
                    branch,
                    stars,
                    repo_pushed_at,
                    _now_iso(),
                    asset_id,
                ),
            )
            conn.commit()
