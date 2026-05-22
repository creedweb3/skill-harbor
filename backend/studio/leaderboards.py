"""Curated leaderboards for marketplace discovery (no GitHub fetch required)."""

from __future__ import annotations

from typing import Any

from studio import scraper_bridge, taxonomy

# Legacy curated manifest categories → marketplace profession slug
CURATED_CATEGORY_TO_DOMAIN: dict[str, str] = {
    "frontend": "web-development",
    "backend": "backend-apis",
    "fullstack": "full-stack",
    "seo": "marketing-seo",
    "geo-aeo": "marketing-seo",
    "gsc": "marketing-seo",
    "database": "database",
    "claude": "agent-ai",
    "cursor": "agent-ai",
    "orchestrator": "agent-ai",
    "ui": "product-design",
    "ux": "product-design",
    "mobile-responsive": "mobile-apps",
    "devops": "devops-infra",
    "security": "devops-infra",
    "testing": "web-development",
    "writing": "writing-docs",
    "ecommerce": "ecommerce",
    "data": "data-ml",
    "crypto": "crypto-web3",
}


def _entry_row(entry: dict[str, Any]) -> dict[str, Any]:
    owner = entry.get("owner", "")
    repo = entry.get("repo", "")
    return {
        "id": f"{owner}/{repo}::{entry.get('path', '')}",
        "title": entry.get("title") or entry.get("install_folder", ""),
        "install_folder": entry.get("install_folder", ""),
        "category": entry.get("category", ""),
        "domain": CURATED_CATEGORY_TO_DOMAIN.get(
            entry.get("category", ""), entry.get("category", "")
        ),
        "rank": int(entry.get("rank") or 99),
        "owner": owner,
        "repo": repo,
        "path": entry.get("path", ""),
        "source_repo": f"{owner}/{repo}" if owner and repo else "",
        "optional": bool(entry.get("optional")),
        "notes": entry.get("notes", ""),
    }


def _dedupe_by_install(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        key = row.get("install_folder") or row.get("id", "")
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def build_leaderboards() -> dict[str, Any]:
    entries = scraper_bridge.load_all_curated_entries()
    rows = [_entry_row(e) for e in entries if e.get("install_folder")]

    top_picks = _dedupe_by_install(
        sorted(
            [r for r in rows if r["rank"] <= 2 and not r.get("optional")],
            key=lambda r: (r["rank"], r["title"].lower()),
        )
    )[:24]

    trending = _dedupe_by_install(
        sorted(
            [r for r in rows if r["rank"] == 1],
            key=lambda r: r["title"].lower(),
        )
    )[:16]

    # Per profession group (Build & ship, Grow & design, Specialist)
    by_profession: list[dict[str, Any]] = []
    domain_labels = {slug: slug.replace("-", " ").title() for slug in taxonomy.all_domain_categories()}

    for group in taxonomy.CATEGORY_GROUPS:
        group_domains = set(group["categories"])
        group_rows = [
            r
            for r in rows
            if r["domain"] in group_domains and r["rank"] <= 3 and not r.get("optional")
        ]
        group_rows = _dedupe_by_install(
            sorted(group_rows, key=lambda r: (r["rank"], -len(r.get("title", ""))))
        )[:8]
        if group_rows:
            by_profession.append(
                {
                    "id": group["id"],
                    "label": group["label"],
                    "items": group_rows,
                }
            )

    # Per-domain top 5 (profession rankings)
    by_domain: list[dict[str, Any]] = []
    for domain in taxonomy.all_domain_categories():
        domain_rows = [
            r for r in rows if r["domain"] == domain and r["rank"] <= 5
        ]
        domain_rows = _dedupe_by_install(
            sorted(domain_rows, key=lambda r: (r["rank"], r["title"].lower()))
        )[:5]
        if domain_rows:
            by_domain.append(
                {
                    "domain": domain,
                    "label": domain_labels.get(domain, domain),
                    "items": domain_rows,
                }
            )

    return {
        "top_picks": top_picks,
        "trending": trending,
        "by_profession": by_profession,
        "by_domain": by_domain,
        "total_curated": len(rows),
    }
