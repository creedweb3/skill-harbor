#!/usr/bin/env python3
"""
Discover and optionally install Cursor rules/skills from GitHub.

Searches curated seed repos + GitHub repository search, classifies assets by
topic (fullstack, frontend, backend, database, seo, intelligence, design,
mobile-responsive), and can write them to:

  User (global):   ~/.cursor/{rules,skills,commands,agents}/
  Project (cwd):   <project>/.cursor/{rules,skills,commands,agents}/

Usage:
  python scripts/scrape_cursor_github.py --report-only
  python scripts/scrape_cursor_github.py --curated-only --install-user
  python scripts/scrape_cursor_github.py --install-user --install-project
  python scripts/scrape_cursor_github.py --categories frontend,seo --top-per-category 5

Curated list (community top picks): scripts/cursor-curated-skills.json

Set GITHUB_TOKEN for higher rate limits (recommended).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Categories & keyword scoring
# ---------------------------------------------------------------------------

CATEGORIES: dict[str, list[str]] = {
    "fullstack": [
        "fullstack",
        "full-stack",
        "full stack",
        "nextjs",
        "next.js",
        "remix",
        "nuxt",
        "t3",
        "mern",
        "mean",
        "monorepo",
        "turborepo",
    ],
    "frontend": [
        "frontend",
        "front-end",
        "react",
        "vue",
        "svelte",
        "angular",
        "typescript",
        "javascript",
        "vite",
        "webpack",
        "tailwind",
        "css",
        "html",
        "component",
        "ui kit",
        "shadcn",
    ],
    "backend": [
        "backend",
        "back-end",
        "api",
        "rest",
        "graphql",
        "node",
        "express",
        "fastapi",
        "django",
        "flask",
        "nestjs",
        "spring",
        "go",
        "rust",
        "server",
        "microservice",
    ],
    "database": [
        "database",
        "postgres",
        "postgresql",
        "mysql",
        "mongodb",
        "redis",
        "prisma",
        "drizzle",
        "supabase",
        "sql",
        "orm",
        "migration",
        "sqlite",
    ],
    "seo": [
        "seo",
        "sitemap",
        "metadata",
        "opengraph",
        "schema.org",
        "json-ld",
        "robots",
        "canonical",
        "search engine",
        "lighthouse",
    ],
    "intelligence": [
        "ai",
        "llm",
        "openai",
        "anthropic",
        "claude",
        "gpt",
        "agent",
        "rag",
        "embedding",
        "prompt",
        "mcp",
        "copilot",
        "cursor",
    ],
    "design": [
        "design",
        "ux",
        "ui",
        "figma",
        "accessibility",
        "a11y",
        "typography",
        "design system",
        "wireframe",
        "brand",
        "color",
    ],
    "mobile-responsive": [
        "mobile",
        "responsive",
        "viewport",
        "touch",
        "ios",
        "android",
        "react native",
        "expo",
        "pwa",
        "media query",
        "breakpoint",
        "fluid",
    ],
    "geo-aeo": [
        "geo",
        "aeo",
        "answer engine",
        "generative engine",
        "ai overview",
        "llms.txt",
        "citation",
        "perplexity",
        "entity seo",
    ],
    "gsc": [
        "google search console",
        "core web vitals",
        "cwv",
        "search console",
        "crux",
        "pagespeed",
        "lighthouse audit",
    ],
    "claude": [
        "claude code",
        "claude",
        "anthropic",
        "claude.md",
    ],
    "cursor": [
        "cursor",
        "cursorrules",
        ".cursor/rules",
        "agents.md",
    ],
    "orchestrator": [
        "orchestrator",
        "subagent",
        "multi-agent",
        "parallel agent",
        "planning",
        "workflow",
    ],
    "ui": [
        "ui",
        "interface",
        "component library",
        "design system",
        "shadcn",
        "tailwind ui",
    ],
    "ux": [
        "ux",
        "usability",
        "heuristic",
        "nielsen",
        "user flow",
        "wireframe",
        "laws of ux",
    ],
    "mobile-native": [
        "pwa",
        "progressive web app",
        "service worker",
        "offline",
        "capacitor",
        "ionic",
        "expo",
        "react native",
        "hybrid app",
    ],
    "performance": [
        "performance",
        "lighthouse",
        "core web vitals",
        "bundle size",
        "waterfall",
        "lazy load",
        "web vitals",
        "optimization",
    ],
}

SCRIPT_DIR = Path(__file__).resolve().parent
CURATED_DEFAULT = SCRIPT_DIR / "cursor-curated-skills.json"

# High-signal seed repos (owner/repo). Extend via --seeds-file JSON.
SEED_REPOS: list[dict[str, str]] = [
    {"owner": "PatrickJS", "repo": "awesome-cursorrules", "kind": "rules"},
    {"owner": "spencerpauly", "repo": "awesome-cursor-skills", "kind": "skills"},
    {"owner": "sanjeed5", "repo": "awesome-cursor-rules-mdc", "kind": "rules"},
    {"owner": "tugkanboz", "repo": "awesome-cursorrules", "kind": "rules"},
]

# GitHub repo search queries per category (repository search works without auth, slowly)
REPO_SEARCH_QUERIES: dict[str, str] = {
    "fullstack": "cursor rules fullstack OR nextjs stars:>20",
    "frontend": "cursor rules react OR frontend OR tailwind stars:>15",
    "backend": "cursor rules node OR backend OR api stars:>15",
    "database": "cursor rules prisma OR postgres OR database stars:>10",
    "seo": "cursor rules seo OR sitemap OR metadata stars:>5",
    "intelligence": "cursor skills agent OR llm OR mcp stars:>10",
    "design": "cursor rules design OR ui OR accessibility stars:>10",
    "mobile-responsive": "cursor rules mobile OR responsive OR react-native stars:>10",
    "geo-aeo": "cursor skills aeo OR geo OR answer engine stars:>5",
    "gsc": "cursor skills lighthouse OR core web vitals stars:>5",
    "performance": "cursor skills performance OR lighthouse stars:>10",
    "ui": "cursor skills ui design OR design system stars:>10",
    "ux": "cursor skills ux OR usability stars:>5",
}

RULE_EXTENSIONS = {".mdc", ".md", ".cursorrules"}
SKILL_FILENAME = "SKILL.md"
MAX_FILE_BYTES = 512_000
RAW_HOST = "https://raw.githubusercontent.com"
API_HOST = "https://api.github.com"
DEFAULT_BRANCH_CANDIDATES = ("main", "master")


class GitHubRateLimitError(RuntimeError):
    """GitHub REST API rate limit exceeded."""


@dataclass
class Asset:
    source_repo: str
    source_path: str
    asset_type: str  # rule | skill | command | agent | agents_md
    categories: list[str]
    score: float
    stars: int
    content_sha256: str
    content_preview: str
    install_name: str
    raw_url: str
    curated: bool = False
    curated_rank: int = 0
    curated_title: str = ""
    repo_pushed_at: str = ""


@dataclass
class ScrapeReport:
    generated_at: str
    project_dir: str
    user_cursor_dir: str
    categories_filter: list[str]
    assets: list[Asset] = field(default_factory=list)
    repos_scanned: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class GitHubClient:
    def __init__(self, token: str | None, *, use_api_metadata: bool = True) -> None:
        self.token = token
        self.use_api_metadata = use_api_metadata and bool(token)
        self._last_request = 0.0
        self._min_interval = 0.35 if token else 2.0
        self.rate_limited = False

    def _headers(self) -> dict[str, str]:
        h = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "docxform-cursor-scraper",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)

    def request_json(self, url: str, params: dict[str, str] | None = None) -> Any:
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        self._throttle()
        req = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self._last_request = time.monotonic()
                remaining = resp.headers.get("X-RateLimit-Remaining")
                if remaining == "0":
                    reset = resp.headers.get("X-RateLimit-Reset")
                    if reset:
                        wait = max(0, int(reset) - int(time.time()) + 1)
                        time.sleep(min(wait, 120))
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:500]
            if e.code == 403 and "rate limit" in body.lower():
                self.rate_limited = True
                raise GitHubRateLimitError(
                    "GitHub API rate limit exceeded. Add a token in Settings "
                    "(or set GITHUB_TOKEN) and try again."
                ) from e
            raise RuntimeError(f"GitHub API {e.code} for {url}: {body}") from e

    def request_text(self, url: str) -> str:
        self._throttle()
        req = urllib.request.Request(url, headers={"User-Agent": "docxform-cursor-scraper"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self._last_request = time.monotonic()
                data = resp.read()
                if len(data) > MAX_FILE_BYTES:
                    raise ValueError(f"File too large ({len(data)} bytes): {url}")
                return data.decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:200]
            raise RuntimeError(f"HTTP {e.code} for {url}: {body}") from e

    def repo_meta(self, owner: str, repo: str) -> dict[str, Any]:
        if not self.use_api_metadata:
            raise GitHubRateLimitError(
                "GitHub API disabled for this run (add a token to fetch repo metadata)."
            )
        if self.rate_limited:
            raise GitHubRateLimitError("GitHub API rate limit already hit; skipping repo metadata.")
        return self.request_json(f"{API_HOST}/repos/{owner}/{repo}")

    def resolve_branch(self, owner: str, repo: str) -> str:
        if self.use_api_metadata:
            try:
                meta = self.repo_meta(owner, repo)
                return meta.get("default_branch") or "main"
            except Exception:
                pass
        for branch in DEFAULT_BRANCH_CANDIDATES:
            try:
                self.request_text(raw_url(owner, repo, branch, "README.md"))
                return branch
            except Exception:
                continue
        return "main"

    def default_branch(self, owner: str, repo: str) -> str:
        return self.resolve_branch(owner, repo)

    def fetch_raw_file(
        self,
        owner: str,
        repo: str,
        path: str,
        branch_hint: str | None = None,
    ) -> tuple[str, str]:
        """Fetch via raw.githubusercontent.com only (no REST API)."""
        branches: list[str] = []
        if branch_hint:
            branches.append(branch_hint)
        for b in DEFAULT_BRANCH_CANDIDATES:
            if b not in branches:
                branches.append(b)

        last_err: Exception | None = None
        for branch in branches:
            url = raw_url(owner, repo, branch, path)
            try:
                return self.request_text(url), branch
            except Exception as e:
                last_err = e
                if "HTTP 404" in str(e) or " 404 " in str(e):
                    continue
                raise
        tried = ", ".join(branches)
        raise RuntimeError(
            f"Could not download from raw.githubusercontent.com ({owner}/{repo}, "
            f"tried branches: {tried}). Last error: {last_err}"
        ) from last_err

    def list_tree_paths(self, owner: str, repo: str, branch: str) -> list[str]:
        tree = self.request_json(
            f"{API_HOST}/repos/{owner}/{repo}/git/trees/{branch}",
            {"recursive": "1"},
        )
        paths: list[str] = []
        for item in tree.get("tree") or []:
            if item.get("type") == "blob" and item.get("path"):
                paths.append(item["path"])
        return paths

    def search_repositories(
        self, query: str, per_page: int = 10, page: int = 1
    ) -> list[dict[str, Any]]:
        data = self.request_json(
            f"{API_HOST}/search/repositories",
            {
                "q": query,
                "sort": "stars",
                "order": "desc",
                "per_page": str(max(1, min(100, per_page))),
                "page": str(max(1, page)),
            },
        )
        return list(data.get("items") or [])

    def search_code(self, query: str, per_page: int = 3) -> list[dict[str, Any]]:
        """Search code in repos — requires auth; 9 req/min limit."""
        data = self.request_json(
            f"{API_HOST}/search/code",
            {"q": query, "per_page": str(max(1, min(100, per_page)))},
        )
        return list(data.get("items") or [])


def slugify(text: str, max_len: int = 80) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return (text[:max_len] or "item").strip("-")


def classify_text(text: str, path: str = "") -> tuple[list[str], float]:
    blob = f"{path}\n{text}".lower()
    scores: list[tuple[str, float]] = []
    for cat, keywords in CATEGORIES.items():
        hits = sum(1 for kw in keywords if kw in blob)
        if hits:
            scores.append((cat, float(hits)))
    if not scores:
        return ["fullstack"], 0.0
    scores.sort(key=lambda x: x[1], reverse=True)
    top_score = scores[0][1]
    primary = [c for c, s in scores if s >= max(1.0, top_score * 0.5)]
    return primary[:3], top_score


def is_candidate_path(path: str) -> str | None:
    lower = path.replace("\\", "/").lower()
    normalized = f"/{lower.strip('/')}/"
    name = Path(path).name

    if name.startswith("_") or "_template" in lower:
        return None

    blocked = (
        "/node_modules/",
        "/vendor/",
        "/dist/",
        "/build/",
        "/.github/workflows/",
        "/__pycache__/",
    )
    if any(b in normalized for b in blocked):
        return None

    if name == "agents.md" and lower.endswith("agents.md"):
        return "agents_md"

    if name.lower() == SKILL_FILENAME.lower():
        if any(
            marker in normalized
            for marker in (
                "/skills/",
                "/.cursor/skills/",
                "/.claude/skills/",
                "/.codex/skills/",
                "/.gemini/skills/",
                "/.agent/skills/",
                "/.windsurf/skills/",
                "/.cline/skills/",
                "/agent-skills/",
                "/capabilities/",
            )
        ):
            return "skill"
        # e.g. brand-guidelines/SKILL.md or composio-skills/foo/SKILL.md
        parts = [p for p in lower.split("/") if p]
        if len(parts) >= 2 and parts[-1] == "skill.md":
            if not any(x in normalized for x in ("/docs/", "/documentation/", "/test/", "/tests/")):
                return "skill"
        return None

    if name.endswith(".mdc"):
        if any(
            marker in normalized
            for marker in (
                "/rules/",
                "/.cursor/rules/",
                "/.claude/rules/",
                "/.codex/rules/",
                "/.gemini/",
                "/.agent/rules/",
                "/.windsurf/",
                "/.cline/",
            )
        ):
            return "rule"
        if lower.endswith(".mdc") and lower.count("/") <= 1:
            return "rule"

    if name.endswith(".md") and "/.cursor/commands/" in normalized:
        return "command"
    if name.endswith(".md") and any(
        m in normalized for m in ("/.cursor/agents/", "/.claude/agents/", "/.agent/agents/")
    ):
        return "agent"
    if name == ".cursorrules":
        return "rule"
    if name.endswith(".md") and "/rules/" in normalized:
        return "rule"
    return None


def raw_url(owner: str, repo: str, branch: str, path: str) -> str:
    return f"{RAW_HOST}/{owner}/{repo}/{branch}/{urllib.parse.quote(path, safe='/')}"


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def install_name_for(asset_type: str, repo: str, path: str) -> str:
    """Delegate to studio.naming when backend is on sys.path (Harbor app)."""
    try:
        from studio.naming import install_name_for as harbor_install

        return harbor_install(asset_type, repo, path)
    except ImportError:
        pass

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
        parent = p.parent.name
        stem = p.stem
        core = slugify(f"{parent}-{stem}", 56)
        return f"{slug_repo}--{core}.mdc"
    slug_path = slugify(str(p.with_suffix("")), 64)
    return f"{slug_repo}--{slug_path}.md"


def wrap_cursorrules_as_mdc(body: str, description: str) -> str:
    desc = description.replace('"', "'")[:200]
    return (
        "---\n"
        f"description: {desc}\n"
        "alwaysApply: false\n"
        "---\n\n"
        f"{body.strip()}\n"
    )


def load_seeds_file(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict) and x.get("owner") and x.get("repo")]
    return []


def load_curated_entries(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    entries = data.get("entries") if isinstance(data, dict) else data
    if not isinstance(entries, list):
        return []
    valid: list[dict[str, Any]] = []
    for e in entries:
        if not isinstance(e, dict):
            continue
        if e.get("owner") and e.get("repo") and e.get("path") and e.get("category"):
            valid.append(e)
    return valid


def select_curated_entries(
    entries: list[dict[str, Any]],
    categories: list[str],
    top_per_category: int,
) -> list[dict[str, Any]]:
    by_cat: dict[str, list[dict[str, Any]]] = {}
    for e in entries:
        cat = e["category"]
        if categories and cat not in categories:
            continue
        by_cat.setdefault(cat, []).append(e)
    selected: list[dict[str, Any]] = []
    for cat in sorted(by_cat.keys()):
        pool = sorted(by_cat[cat], key=lambda x: int(x.get("rank", 99)))
        selected.extend(pool[:top_per_category])
    return selected


def fetch_curated_assets(
    client: GitHubClient,
    entries: list[dict[str, Any]],
    report: ScrapeReport,
) -> list[Asset]:
    assets: list[Asset] = []
    branch_cache: dict[str, str] = {}
    stars_cache: dict[str, int] = {}
    pushed_cache: dict[str, str] = {}

    for entry in entries:
        owner = entry["owner"]
        repo = entry["repo"]
        path = entry["path"]
        full_name = f"{owner}/{repo}"
        optional = bool(entry.get("optional"))
        branch_hint = entry.get("branch")

        try:
            if full_name not in branch_cache:
                text, branch = client.fetch_raw_file(owner, repo, path, branch_hint)
                branch_cache[full_name] = branch
                if full_name not in stars_cache:
                    stars_cache[full_name] = int(entry.get("stars") or 0)
                if client.use_api_metadata and full_name not in pushed_cache:
                    try:
                        meta = client.repo_meta(owner, repo)
                        stars_cache[full_name] = int(meta.get("stargazers_count") or stars_cache[full_name])
                        pushed_cache[full_name] = str(meta.get("pushed_at") or "")
                    except Exception:
                        pushed_cache[full_name] = ""
                if full_name not in report.repos_scanned:
                    report.repos_scanned.append(full_name)
            else:
                branch = branch_cache[full_name]
                text = client.request_text(raw_url(owner, repo, branch, path))
            stars = stars_cache.get(full_name, 0)
            pushed_at = pushed_cache.get(full_name, "")
            url = raw_url(owner, repo, branch_cache[full_name], path)
        except Exception as e:
            msg = f"curated [{entry.get('title', path)}] {full_name}/{path}: {e}"
            if optional:
                continue
            report.errors.append(msg)
            continue

        rank = int(entry.get("rank", 5))
        cat = entry["category"]
        install = entry.get("install_folder") or slugify(
            entry.get("title", Path(path).parent.name), 64
        )
        preview = re.sub(r"\s+", " ", text.strip())[:240]
        asset_type = str(entry.get("asset_type") or "").strip().lower()
        pl = path.replace("\\", "/").lower()
        if not asset_type:
            if path.endswith(".mdc") or "/rules/" in pl:
                asset_type = "rule"
            elif "/commands/" in pl:
                asset_type = "command"
            elif "/agents/" in pl or "subagent" in pl:
                asset_type = "agent"
            else:
                asset_type = "skill"
        if asset_type == "rule":
            install_name = str(install) if str(install).endswith(".mdc") else f"{slugify(str(install), 56)}.mdc"
        else:
            install_name = slugify(str(install), 64)

        asset = Asset(
            source_repo=full_name,
            source_path=path,
            asset_type=asset_type,
            categories=[cat],
            score=1000.0 - rank,
            stars=stars,
            content_sha256=content_hash(text),
            content_preview=preview,
            install_name=install_name,
            raw_url=url,
            curated=True,
            curated_rank=rank,
            curated_title=str(entry.get("title", "")),
            repo_pushed_at=pushed_at,
        )
        setattr(asset, "_content", text)
        assets.append(asset)

    return assets


def merge_and_dedupe_assets(assets: list[Asset]) -> list[Asset]:
    """Prefer curated entries; dedupe by content hash."""
    by_hash: dict[str, Asset] = {}
    for a in sorted(assets, key=lambda x: (0 if x.curated else 1, x.curated_rank or 99)):
        if a.content_sha256 not in by_hash:
            by_hash[a.content_sha256] = a
    return list(by_hash.values())


def discover_repos(
    client: GitHubClient,
    categories: list[str],
    max_repos_per_query: int,
    report: ScrapeReport,
) -> list[tuple[str, str, int]]:
    seen: set[str] = set()
    found: list[tuple[str, str, int]] = []

    for seed in SEED_REPOS:
        key = f"{seed['owner']}/{seed['repo']}"
        if key not in seen:
            seen.add(key)
            try:
                meta = client.repo_meta(seed["owner"], seed["repo"])
                found.append((seed["owner"], seed["repo"], int(meta.get("stargazers_count") or 0)))
            except Exception as e:
                report.errors.append(f"seed {key}: {e}")

    for cat in categories:
        query = REPO_SEARCH_QUERIES.get(cat)
        if not query:
            continue
        try:
            items = client.search_repositories(query, per_page=max_repos_per_query)
            for item in items:
                owner = item["owner"]["login"]
                repo = item["name"]
                key = f"{owner}/{repo}"
                if key in seen:
                    continue
                seen.add(key)
                found.append((owner, repo, int(item.get("stargazers_count") or 0)))
        except Exception as e:
            report.errors.append(f"search [{cat}]: {e}")

    found.sort(key=lambda x: x[2], reverse=True)
    return found


def path_priority(path: str, categories_filter: list[str]) -> int:
    """Higher = fetch first when capping files per repo."""
    blob = f"/{path.replace(chr(92), '/').strip('/')}/".lower()
    score = 0
    if "/.cursor/skills/" in blob or "/skills/" in blob:
        score += 5
    if blob.endswith("/skill.md"):
        score += 4
    if "/.cursor/rules/" in blob or blob.endswith(".mdc"):
        score += 3
    for cat in categories_filter:
        for kw in CATEGORIES.get(cat, []):
            if kw.replace(" ", "-") in blob or kw.replace(" ", "") in blob or kw in blob:
                score += 2
                break
    return score


def extract_assets_from_repo(
    client: GitHubClient,
    owner: str,
    repo: str,
    stars: int,
    categories_filter: list[str],
    report: ScrapeReport,
    max_files_per_repo: int,
) -> list[Asset]:
    assets: list[Asset] = []
    full_name = f"{owner}/{repo}"
    try:
        branch = client.default_branch(owner, repo)
        paths = client.list_tree_paths(owner, repo, branch)
    except Exception as e:
        report.errors.append(f"tree {full_name}: {e}")
        return assets

    report.repos_scanned.append(full_name)

    candidates = [p for p in paths if is_candidate_path(p)]
    candidates.sort(key=lambda p: path_priority(p, categories_filter), reverse=True)
    if max_files_per_repo > 0:
        candidates = candidates[:max_files_per_repo]

    for path in candidates:
        asset_type = is_candidate_path(path)
        if not asset_type:
            continue
        url = raw_url(owner, repo, branch, path)
        try:
            text = client.request_text(url)
        except Exception as e:
            report.errors.append(f"fetch {full_name}/{path}: {e}")
            continue

        cats, score = classify_text(text, path)
        if categories_filter and not any(c in categories_filter for c in cats):
            continue

        preview = re.sub(r"\s+", " ", text.strip())[:240]
        inst = install_name_for(asset_type, full_name, path)
        assets.append(
            Asset(
                source_repo=full_name,
                source_path=path,
                asset_type=asset_type,
                categories=cats,
                score=score,
                stars=stars,
                content_sha256=content_hash(text),
                content_preview=preview,
                install_name=inst,
                raw_url=url,
            )
        )
        # stash content on asset via monkey-patch dict — use side channel
        setattr(assets[-1], "_content", text)

    return assets


def rank_and_cap(assets: list[Asset], max_per_category: int) -> list[Asset]:
    by_cat: dict[str, list[Asset]] = {c: [] for c in CATEGORIES}
    unclassified: list[Asset] = []

    for a in assets:
        placed = False
        for cat in a.categories:
            if cat in by_cat:
                by_cat[cat].append(a)
                placed = True
        if not placed:
            unclassified.append(a)

    selected: list[Asset] = []
    seen_hash: set[str] = set()

    def sort_key(a: Asset) -> tuple[float, int, int]:
        curated_boost = 1 if a.curated else 0
        return (curated_boost, a.score, a.stars)

    for cat in CATEGORIES:
        pool = sorted(by_cat[cat], key=sort_key, reverse=True)
        count = 0
        for a in pool:
            if a.content_sha256 in seen_hash:
                continue
            seen_hash.add(a.content_sha256)
            selected.append(a)
            count += 1
            if count >= max_per_category:
                break

    for a in sorted(unclassified, key=sort_key, reverse=True):
        if a.content_sha256 not in seen_hash:
            seen_hash.add(a.content_sha256)
            selected.append(a)

    return selected


def user_cursor_dir() -> Path:
    return Path.home() / ".cursor"


def project_cursor_dir(project_dir: Path) -> Path:
    return project_dir / ".cursor"


def write_asset(
    asset: Asset,
    text: str,
    base: Path,
    force: bool,
) -> Path | None:
    base.mkdir(parents=True, exist_ok=True)
    asset_type = asset.asset_type

    if asset_type == "rule":
        rules_dir = base / "rules"
        rules_dir.mkdir(exist_ok=True)
        dest = rules_dir / asset.install_name
        if not dest.suffix == ".mdc":
            dest = dest.with_suffix(".mdc")
        body = text
        if asset.source_path.endswith(".cursorrules") or not text.lstrip().startswith("---"):
            desc = f"Imported from {asset.source_repo} ({asset.source_path})"
            body = wrap_cursorrules_as_mdc(text, desc)
    elif asset_type == "skill":
        skill_dir = base / "skills" / asset.install_name
        skill_dir.mkdir(parents=True, exist_ok=True)
        dest = skill_dir / SKILL_FILENAME
        body = text
    elif asset_type == "command":
        cmd_dir = base / "commands"
        cmd_dir.mkdir(exist_ok=True)
        dest = cmd_dir / asset.install_name
        body = text
    elif asset_type in ("agent", "agents_md"):
        agents_dir = base / "agents"
        agents_dir.mkdir(exist_ok=True)
        dest = agents_dir / asset.install_name
        body = text
    else:
        return None

    if dest.exists() and not force:
        return None
    dest.write_text(body, encoding="utf-8", newline="\n")
    return dest


def install_assets(
    assets: list[Asset],
    client: GitHubClient,
    install_user: bool,
    install_project: Path | None,
    force: bool,
    report: ScrapeReport,
) -> dict[str, list[str]]:
    installed: dict[str, list[str]] = {"user": [], "project": []}
    bases: list[tuple[str, Path]] = []
    if install_user:
        bases.append(("user", user_cursor_dir()))
    if install_project:
        bases.append(("project", project_cursor_dir(install_project)))

    for asset in assets:
        text = getattr(asset, "_content", None)
        if text is None:
            try:
                text = client.request_text(asset.raw_url)
            except Exception as e:
                report.errors.append(f"install fetch {asset.raw_url}: {e}")
                continue

        for scope, base in bases:
            try:
                dest = write_asset(asset, text, base, force)
                if dest:
                    installed[scope].append(str(dest))
            except Exception as e:
                report.errors.append(f"install {scope} {asset.install_name}: {e}")

    return installed


def write_report(
    report: ScrapeReport,
    output_dir: Path,
    installed: dict[str, list[str]] | None,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": report.generated_at,
        "project_dir": report.project_dir,
        "user_cursor_dir": report.user_cursor_dir,
        "categories_filter": report.categories_filter,
        "repos_scanned": report.repos_scanned,
        "errors": report.errors,
        "assets": [asdict(a) for a in report.assets],
        "installed": installed or {},
    }
    json_path = output_dir / "cursor-github-scrape.json"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    md_lines = [
        "# Cursor GitHub scrape report",
        "",
        f"Generated: {report.generated_at}",
        f"Project: `{report.project_dir}`",
        f"User cursor dir: `{report.user_cursor_dir}`",
        "",
        f"Repos scanned: {len(report.repos_scanned)}",
        f"Assets selected: {len(report.assets)}",
        "",
        "## By category",
        "",
    ]
    for cat in CATEGORIES:
        items = [a for a in report.assets if cat in a.categories]
        if not items:
            continue
        md_lines.append(f"### {cat} ({len(items)})")
        md_lines.append("")
        for a in items[:25]:
            label = a.curated_title or a.install_name
            tag = "curated" if a.curated else a.asset_type
            md_lines.append(
                f"- **{tag}** `{a.install_name}` — {label} — "
                f"{a.source_repo}/{a.source_path} (★{a.stars}, score {a.score})"
            )
        md_lines.append("")

    if report.errors:
        md_lines.append("## Errors")
        md_lines.append("")
        for err in report.errors[:50]:
            md_lines.append(f"- {err}")
        md_lines.append("")

    (output_dir / "cursor-github-scrape.md").write_text("\n".join(md_lines), encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Scrape GitHub for Cursor rules/skills and optionally install them.",
    )
    p.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project root for .cursor install (default: current directory)",
    )
    p.add_argument(
        "--categories",
        type=str,
        default=",".join(CATEGORIES.keys()),
        help="Comma-separated categories to include",
    )
    p.add_argument(
        "--max-repos-per-query",
        type=int,
        default=8,
        help="Max repos per GitHub search query",
    )
    p.add_argument(
        "--max-per-category",
        type=int,
        default=12,
        help="Max unique assets kept per category after ranking (GitHub discovery)",
    )
    p.add_argument(
        "--top-per-category",
        type=int,
        default=5,
        help="Max curated picks per category from cursor-curated-skills.json",
    )
    p.add_argument(
        "--curated-file",
        type=Path,
        default=CURATED_DEFAULT,
        help="JSON manifest of recommended skills (default: scripts/cursor-curated-skills.json)",
    )
    p.add_argument(
        "--curated-only",
        action="store_true",
        help="Only install curated recommendations (skip GitHub repo search)",
    )
    p.add_argument(
        "--no-curated",
        action="store_true",
        help="Skip curated manifest; use GitHub discovery only",
    )
    p.add_argument(
        "--max-files-per-repo",
        type=int,
        default=40,
        help="Max candidate files downloaded per repository (prioritizes .cursor paths)",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Report output directory (default: <project-dir>/.cursor/scrape-reports)",
    )
    p.add_argument(
        "--seeds-file",
        type=Path,
        default=None,
        help="JSON list of {owner, repo, kind?} seed repos",
    )
    p.add_argument("--report-only", action="store_true", help="Do not install files (default)")
    p.add_argument("--install-user", action="store_true", help="Install to ~/.cursor/")
    p.add_argument(
        "--install-project",
        action="store_true",
        help="Install to <project-dir>/.cursor/",
    )
    p.add_argument("--force", action="store_true", help="Overwrite existing installed files")
    p.add_argument(
        "--token",
        type=str,
        default=os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN"),
        help="GitHub token (or set GITHUB_TOKEN / GH_TOKEN)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    categories = [c.strip() for c in args.categories.split(",") if c.strip()]
    unknown = [c for c in categories if c not in CATEGORIES]
    if unknown:
        print(f"Unknown categories: {unknown}. Valid: {', '.join(CATEGORIES)}", file=sys.stderr)
        return 2

    global SEED_REPOS
    if args.seeds_file:
        SEED_REPOS = SEED_REPOS + load_seeds_file(args.seeds_file)

    project_dir = args.project_dir.resolve()
    output_dir = args.output_dir or (project_dir / ".cursor" / "scrape-reports")
    report_only = args.report_only or not (args.install_user or args.install_project)

    client = GitHubClient(args.token)
    report = ScrapeReport(
        generated_at=datetime.now(timezone.utc).isoformat(),
        project_dir=str(project_dir),
        user_cursor_dir=str(user_cursor_dir()),
        categories_filter=categories,
    )

    if not args.token:
        print(
            "Tip: set GITHUB_TOKEN for higher rate limits (60/hr unauthenticated vs 5000/hr).",
            file=sys.stderr,
        )

    all_assets: list[Asset] = []

    use_curated = not args.no_curated and args.curated_file.is_file()
    if use_curated:
        curated_raw = load_curated_entries(args.curated_file)
        picked = select_curated_entries(curated_raw, categories, args.top_per_category)
        print(
            f"Curated: fetching {len(picked)} skills from {args.curated_file.name}",
            file=sys.stderr,
        )
        all_assets.extend(fetch_curated_assets(client, picked, report))

    if not args.curated_only:
        repos = discover_repos(client, categories, args.max_repos_per_query, report)
        for owner, repo, stars in repos:
            all_assets.extend(
                extract_assets_from_repo(
                    client,
                    owner,
                    repo,
                    stars,
                    categories,
                    report,
                    args.max_files_per_repo,
                )
            )
        merged = merge_and_dedupe_assets(all_assets)
        report.assets = rank_and_cap(merged, args.max_per_category)
    else:
        report.assets = merge_and_dedupe_assets(all_assets)

    installed = None
    if not report_only:
        installed = install_assets(
            report.assets,
            client,
            install_user=args.install_user,
            install_project=project_dir if args.install_project else None,
            force=args.force,
            report=report,
        )
        for scope, paths in (installed or {}).items():
            print(f"Installed {len(paths)} file(s) to {scope} scope.")

    write_report(report, output_dir, installed)
    print(f"Report: {output_dir / 'cursor-github-scrape.json'}")
    print(f"Summary: {output_dir / 'cursor-github-scrape.md'}")
    print(f"Selected {len(report.assets)} assets from {len(report.repos_scanned)} repos.")
    if report.errors:
        print(f"Warnings/errors: {len(report.errors)} (see report)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
