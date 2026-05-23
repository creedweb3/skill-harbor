"""Harbor catalog service — DB-first asset registry."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from studio import scraper_bridge, taxonomy
from studio.database import get_connection, row_to_dict

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
        return count

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
            domain = category
            from studio.leaderboards import CURATED_CATEGORY_TO_DOMAIN

            domain = CURATED_CATEGORY_TO_DOMAIN.get(category, category)
            domains = taxonomy.classify_domains("", path, category)

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
            }
            self.upsert_asset(row, domains)
            n += 1
        return n

    def upsert_asset(self, row: dict[str, Any], domains: list[str] | None = None) -> None:
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO assets (
                    id, owner, repo, path, source_repo, title, install_name, asset_type,
                    category, rank, stars, score, content_sha256, content, content_preview,
                    raw_url, branch, repo_pushed_at, synced_at, notes
                ) VALUES (
                    :id, :owner, :repo, :path, :source_repo, :title, :install_name, :asset_type,
                    :category, :rank, :stars, :score, :content_sha256, :content, :content_preview,
                    :raw_url, :branch, :repo_pushed_at, :synced_at, :notes
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
                    notes=excluded.notes
                """,
                row,
            )
            if domains:
                conn.execute("DELETE FROM asset_domains WHERE asset_id = ?", (row["id"],))
                for d in domains:
                    conn.execute(
                        "INSERT OR IGNORE INTO asset_domains (asset_id, domain) VALUES (?, ?)",
                        (row["id"], d),
                    )
            conn.commit()

    def list_assets(
        self,
        *,
        domain: str | None = None,
        asset_type: str | None = None,
        q: str | None = None,
        period: str = "all",
        limit: int = 200,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        clauses: list[str] = []
        params: list[Any] = []

        if domain:
            clauses.append(
                "EXISTS (SELECT 1 FROM asset_domains d WHERE d.asset_id = a.id AND d.domain = ?)"
            )
            params.append(domain)

        if asset_type and asset_type != "all":
            clauses.append("a.asset_type = ?")
            params.append(asset_type)

        if q:
            clauses.append(
                "(a.title LIKE ? OR a.install_name LIKE ? OR a.source_repo LIKE ? OR a.content_preview LIKE ?)"
            )
            like = f"%{q}%"
            params.extend([like, like, like, like])

        if period != "all" and PERIOD_MS.get(period):
            # filter by repo_pushed_at ISO string — approximate via datetime
            clauses.append("a.repo_pushed_at != ''")

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"SELECT a.* FROM assets a {where} ORDER BY a.stars DESC, a.title COLLATE NOCASE"

        with get_connection() as conn:
            total = conn.execute(
                f"SELECT COUNT(*) FROM assets a {where}", params
            ).fetchone()[0]
            rows = conn.execute(f"{sql} LIMIT ? OFFSET ?", [*params, limit, offset]).fetchall()

        assets = [self._row_to_api(r) for r in rows]

        if period != "all" and PERIOD_MS.get(period):
            assets = [a for a in assets if self._in_period(a.get("repo_pushed_at", ""), period)]
            total = len(assets)

        return assets, total

    def get_asset(self, asset_id: str) -> dict[str, Any] | None:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM assets WHERE id = ?", (asset_id,)).fetchone()
            if not row:
                return None
            domains = [
                r[0]
                for r in conn.execute(
                    "SELECT domain FROM asset_domains WHERE asset_id = ?", (asset_id,)
                ).fetchall()
            ]
        api = self._row_to_api(row)
        api["domains"] = domains
        api["categories"] = domains
        return api

    def trending(self, period: str = "week", limit: int = 20) -> list[dict[str, Any]]:
        assets, _ = self.list_assets(period=period, limit=500)
        return assets[:limit]

    def by_domain(self, limit_per: int = 5) -> list[dict[str, Any]]:
        labels = taxonomy.DOMAIN_LABELS
        out: list[dict[str, Any]] = []
        for prof in taxonomy.DISCOVERY_PROFESSIONS:
            domain = prof["domain"]
            items, _ = self.list_assets(domain=domain, limit=500)
            items.sort(key=lambda a: (-(a.get("stars") or 0), a.get("title", "").lower()))
            top = items[:limit_per]
            if top:
                out.append(
                    {
                        "domain": domain,
                        "label": labels.get(domain, prof["label"]),
                        "items": [self._to_leaderboard_entry(a, rank=i + 1) for i, a in enumerate(top)],
                    }
                )
        return out

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

    def _row_to_api(self, row: Any) -> dict[str, Any]:
        d = row_to_dict(row) or {}
        aid = d.get("id", "")
        with get_connection() as conn:
            domains = [
                r[0]
                for r in conn.execute(
                    "SELECT domain FROM asset_domains WHERE asset_id = ?", (aid,)
                ).fetchall()
            ]
        return {
            "id": aid,
            "source_repo": d.get("source_repo", ""),
            "source_path": d.get("path", ""),
            "asset_type": d.get("asset_type", "skill"),
            "asset_type_label": taxonomy.ASSET_TYPE_LABELS.get(
                d.get("asset_type", "skill"), d.get("asset_type", "skill")
            ),
            "categories": domains or [d.get("category", "")],
            "domains": domains or [d.get("category", "")],
            "score": d.get("score", 0),
            "stars": d.get("stars", 0),
            "content_preview": d.get("content_preview", ""),
            "content": d.get("content", ""),
            "install_name": d.get("install_name", ""),
            "raw_url": d.get("raw_url", ""),
            "curated": True,
            "curated_rank": d.get("rank", 99),
            "curated_title": d.get("title", ""),
            "repo_pushed_at": d.get("repo_pushed_at", ""),
            "synced_at": d.get("synced_at", ""),
            "notes": d.get("notes", ""),
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
            "domain": a.get("domains", [""])[0] if a.get("domains") else "",
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
