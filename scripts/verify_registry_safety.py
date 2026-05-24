#!/usr/bin/env python3
"""Scan harbor.db assets for safety issues (prompt injection, malware patterns, etc.)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from studio.database import get_connection  # noqa: E402
from studio.safety import assess_content_safety, purge_unsafe_assets  # noqa: E402


def scan(*, purge: bool = False) -> dict:
    blocked: list[dict] = []
    warned: list[dict] = []

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, title, install_name, path, content, content_preview FROM assets"
        ).fetchall()
        for row in rows:
            text = row["content"] or row["content_preview"] or ""
            if not text.strip():
                continue
            result = assess_content_safety(text, row["path"] or "")
            entry = {
                "id": row["id"],
                "title": row["title"] or row["install_name"],
                "reason": result.reason,
                "warnings": result.warnings,
            }
            if not result.safe:
                blocked.append(entry)
            elif result.warnings:
                warned.append(entry)

    out = {
        "scanned": len(rows),
        "blocked": len(blocked),
        "warned": len(warned),
        "blocked_assets": blocked[:50],
        "warned_assets": warned[:20],
    }
    if purge:
        out["purge"] = purge_unsafe_assets()
    return out


def main() -> None:
    p = argparse.ArgumentParser(description="Verify Skill Harbor registry safety")
    p.add_argument("--purge", action="store_true", help="Remove unsafe rows from harbor.db")
    p.add_argument("--json", action="store_true", help="Print JSON report")
    args = p.parse_args()
    report = scan(purge=args.purge)
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Scanned {report['scanned']} assets")
        print(f"Blocked: {report['blocked']}, Warnings: {report['warned']}")
        if report.get("purge"):
            print(f"Purged: {report['purge'].get('removed', 0)}")
        for item in report["blocked_assets"][:10]:
            print(f"  ✗ {item['title']}: {item['reason']}")
    if report["blocked"] and not args.purge:
        sys.exit(1)


if __name__ == "__main__":
    main()
