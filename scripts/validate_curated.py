#!/usr/bin/env python3
"""Verify curated manifest entries resolve on raw.githubusercontent.com."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFESTS = [ROOT / "cursor-curated-skills.json", ROOT / "cursor-curated-rules.json"]
BRANCHES = ("main", "master")


def check_url(url: str) -> bool:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "skill-harbor-validate/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        if e.code == 405:
            req = urllib.request.Request(url, headers={"User-Agent": "skill-harbor-validate/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return 200 <= resp.status < 300
        return False
    except Exception:
        return False


def resolve_entry(entry: dict) -> tuple[bool, str]:
    owner = entry["owner"]
    repo = entry["repo"]
    path = entry["path"].lstrip("/")
    hint = entry.get("branch")
    branches = [hint] if hint else []
    for b in BRANCHES:
        if b not in branches:
            branches.append(b)
    last = ""
    for branch in branches:
        url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
        last = url
        if check_url(url):
            return True, url
    return False, last


def main() -> int:
    prune = "--prune" in sys.argv
    bad: list[tuple[Path, dict, str]] = []

    for manifest in MANIFESTS:
        if not manifest.is_file():
            continue
        data = json.loads(manifest.read_text(encoding="utf-8"))
        entries = data.get("entries") or []
        kept = []
        for entry in entries:
            ok, url = resolve_entry(entry)
            if ok:
                kept.append(entry)
            else:
                bad.append((manifest, entry, url))
                print(f"MISSING: {entry.get('title')} -> {url}")
        if prune and len(kept) != len(entries):
            data["entries"] = kept
            manifest.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
            print(f"Pruned {manifest.name}: {len(entries) - len(kept)} removed, {len(kept)} kept")

    if bad and not prune:
        print(f"\n{len(bad)} broken entries. Re-run with --prune to remove from manifests.")
        return 1
    if not bad:
        total = sum(
            len(json.loads(m.read_text(encoding="utf-8")).get("entries") or [])
            for m in MANIFESTS
            if m.is_file()
        )
        print(f"All {total} curated entries resolve on GitHub.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
