"""GitHub discovery — intent-first, mirrors manual GitHub repo search (sort: stars)."""

from __future__ import annotations

import re
from typing import Any, Literal

from studio.app_settings import get_int, get_min_repo_stars
from studio.discovery_queue import enqueue_repo, get_query_page, queue_stats, set_query_page
from studio.registry_crawl import repos_in_registry

QueryKind = Literal["intent", "path"]

# Mirrors what you type in GitHub search → Repositories → Sort: Most stars
INTENT_SEARCHES: list[tuple[str, str, float]] = [
    ("skills", "skills", 1.0),
    ("ai rules", "ai-rules", 1.2),
    ("claude skills", "claude-skills", 1.3),
    ("coding agent skills", "coding-agent-skills", 1.25),
    ("improve ai code", "improve-ai-code", 1.0),
    ("code rules", "code-rules", 1.15),
]

PATH_SEARCHES: list[tuple[str, str, float]] = [
    ("filename:SKILL.md", "path-skill-md", 1.5),
    ("path:.cursor/skills", "path-cursor-skills", 1.5),
    ("path:.cursor/rules", "path-cursor-rules", 1.35),
    ("path:.cursor/commands", "path-cursor-commands", 1.2),
    ("path:.cursor/agents", "path-cursor-agents", 1.2),
    ("path:.claude/skills", "path-claude-skills", 1.45),
    ("path:.claude/rules", "path-claude-rules", 1.3),
    ("path:.codex/skills", "path-codex-skills", 1.4),
    ("path:.gemini/", "path-gemini", 1.25),
    ("path:.agent/", "path-antigravity", 1.25),
    ("path:.windsurf/", "path-windsurf", 1.2),
    ("path:.cline/", "path-cline", 1.2),
    ("filename:.cursorrules", "path-cursorrules", 1.1),
    ("filename:CLAUDE.md", "path-claude-md", 1.15),
    ("filename:AGENTS.md", "path-agents-md", 1.2),
    ("agent-skills in:name", "name-agent-skills", 1.3),
    ("cursor-skills in:name", "name-cursor-skills", 1.3),
    ("claude-skills in:name", "name-claude-skills", 1.25),
    ("codex-skills in:name", "name-codex-skills", 1.2),
    ("awesome-cursorrules in:name", "name-awesome-cursorrules", 1.2),
    ("awesome-claude-skills in:name", "name-awesome-claude", 1.2),
    ("awesome-agent-skills in:name", "name-awesome-agent", 1.2),
]

_BLOCKLIST = re.compile(
    r"(?:^|/)(?:30-seconds-of-code|app-ideas|free-programming-books|"
    r"developer-roadmap|public-apis|system-design-primer|coding-interview-university|"
    r"awesome-python|awesome-go|awesome-react|awesome-java|build-your-own-x|"
    r"javaguide|java-guide|snailclimb)(?:$|/|\.)",
    re.I,
)

_UNRELATED_NAME = re.compile(
    r"download|wechat|whatsapp|telegram|saas|boilerplate|starter-kit|"
    r"course|tutorial|interview|leetcode|cheatsheet|roadmap|"
    r"open-saas|template-app|clone-of",
    re.I,
)

_NAME_SIGNALS = re.compile(
    r"skill|cursor|claude|codex|agent|cursorrules|openclaw|superpowers|"
    r"subagent|commands|mdc|rules",
    re.I,
)

_AI_CONTEXT = re.compile(
    r"cursor|claude|codex|openclaw|agent.?skill|agentic|llm|copilot|"
    r"skill\.md|\.cursor|cursor.?rule|mcp|anthropic|subagent|superpowers|"
    r"openai|gemini|codex|aider|windsurf|cline|roo.?code",
    re.I,
)


def _star_qualifier() -> str:
    return f"stars:>={get_min_repo_stars()}"


def build_repo_query(keywords: str, *, kind: QueryKind) -> str:
    """Build GitHub search/repositories query (sorted by stars in client)."""
    kw = keywords.strip()
    if kind == "path" or ":" in kw:
        return f"{kw} {_star_qualifier()}"
    return f"{kw} {_star_qualifier()}"


def evaluate_repo_intent(
    repo_name: str,
    *,
    description: str = "",
    topics: list[str] | None = None,
    query_kind: QueryKind = "intent",
    intent_label: str = "",
) -> tuple[bool, str]:
    """
    Return (accept, reason). Only repos related to AI coding skills/rules/agents pass.
    """
    name = repo_name.strip()
    if not name:
        return False, "empty name"

    if _BLOCKLIST.search(name):
        return False, "known non-skills blocklist"

    blob = " ".join([name, description, " ".join(topics or []), intent_label]).lower()

    if _UNRELATED_NAME.search(name):
        if not _AI_CONTEXT.search(blob) and not _NAME_SIGNALS.search(name):
            return False, "unrelated repo name (not AI skills/rules)"

    if query_kind == "path":
        if _NAME_SIGNALS.search(name):
            return True, "path search + name signal"
        if _AI_CONTEXT.search(blob):
            return True, "path search + AI context"
        return False, "path search hit but no skills/rules signals"

    # Intent keyword searches (skills, ai rules, claude skills, …)
    if _NAME_SIGNALS.search(name):
        return True, "repo name matches skills/rules/agents"
    if _AI_CONTEXT.search(blob):
        return True, "description/topics mention AI coding assistants"
    return False, "no AI skills, rules, or agent context"


def repo_has_skill_artifacts(client: Any, owner: str, repo: str) -> bool:
    """Confirm repo contains skill/rule files via code search (expensive — use sparingly)."""
    checks = (
        f"repo:{owner}/{repo} filename:SKILL.md",
        f"repo:{owner}/{repo} path:.cursor/skills",
        f"repo:{owner}/{repo} extension:mdc path:.cursor/rules",
        f"repo:{owner}/{repo} filename:.cursorrules",
    )
    for q in checks:
        try:
            hits = client.search_code(q, per_page=1)
            if hits:
                return True
        except Exception:
            continue
    return False


def sanitize_pending_queue(job: Any | None = None) -> int:
    """Drop queue rows that fail intent (pending or stuck crawling from old loose rules)."""
    from studio.database import get_connection

    removed = 0
    removed_logs: list[str] = []
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT full_name, owner, repo, source_query, status
            FROM discovery_queue
            WHERE status IN ('pending', 'crawling')
            """
        ).fetchall()
        for row in rows:
            owner = str(row["owner"])
            repo = str(row["repo"])
            src = str(row["source_query"] or "")
            kind: QueryKind = "path" if ":" in src.split("|")[0] else "intent"
            ok, reason = evaluate_repo_intent(
                repo, query_kind=kind, intent_label=src.split("|")[0] if "|" in src else src
            )
            if ok:
                continue
            conn.execute(
                """
                UPDATE discovery_queue
                SET status = 'skipped', last_error = ?
                WHERE full_name = ? AND status IN ('pending', 'crawling')
                """,
                (f"Removed: {reason}"[:500], str(row["full_name"])),
            )
            removed += 1
            if job:
                removed_logs.append(f"  ✗ removed {owner}/{repo} from queue — {reason}")
        conn.commit()
    if job:
        for line in removed_logs[:40]:
            job.log(line, level="warn")
    if job and removed:
        job.log(f"Sanitized queue — removed {removed} unrelated repos.")
    return removed


def discover_and_enqueue(
    job: Any | None = None,
    *,
    force: bool = False,
) -> dict[str, Any]:
    """
    Discover repos via GitHub Search API (repositories, sort=stars).
    Intent searches mirror GitHub UI queries; path searches find SKILL.md / .cursor/*.
    """
    import scrape_cursor_github as scraper

    from studio import config

    token = config.get_admin_github_token()
    if not token:
        if job:
            job.log("No GitHub token — discovery requires a saved admin token.", level="warn")
        return {"enqueued": 0, "skipped": True, "reason": "no_token"}

    sanitized = sanitize_pending_queue(job)

    max_per_page = get_int("discover_max_per_skills_query", 30)
    pages = get_int("discover_search_pages", 5)
    path_queries_per_run = get_int("discover_path_queries_per_run", 4)
    enqueue_cap = get_int("discover_enqueue_cap", 200)
    code_verify_budget = get_int("discover_code_verify_budget", 8)

    client = scraper.GitHubClient(token, use_api_metadata=True)
    in_registry = repos_in_registry()
    enqueued = 0
    scanned = 0
    rejected = 0
    api_calls = 0
    duplicates = 0
    code_checks = 0

    if job:
        job.log(
            f"Discovery — {len(INTENT_SEARCHES)} intent queries (like GitHub search bar) "
            f"+ {path_queries_per_run} path queries; {pages} pages × {max_per_page} results; "
            f"sort=stars ↓; cap {enqueue_cap}."
        )

    def _try_enqueue(
        item: dict[str, Any],
        *,
        query_label: str,
        query_kind: QueryKind,
        weight: float,
    ) -> None:
        nonlocal enqueued, rejected, duplicates, code_checks

        if enqueued >= enqueue_cap:
            return

        owner = (item.get("owner") or {}).get("login") or ""
        repo = item.get("name") or ""
        if not owner or not repo:
            return

        stars = int(item.get("stargazers_count") or 0)
        if stars < get_min_repo_stars():
            rejected += 1
            return

        desc = str(item.get("description") or "")
        topics = [str(t) for t in (item.get("topics") or [])]
        ok, reason = evaluate_repo_intent(
            repo,
            description=desc,
            topics=topics,
            query_kind=query_kind,
            intent_label=query_label,
        )
        if not ok:
            rejected += 1
            if job and rejected <= 8:
                job.log(f"  ✗ skip {owner}/{repo} — {reason}", level="warn")
            return

        if query_kind == "intent" and not _NAME_SIGNALS.search(repo):
            if code_checks < code_verify_budget:
                code_checks += 1
                if not repo_has_skill_artifacts(client, owner, repo):
                    rejected += 1
                    if job and rejected <= 10:
                        job.log(
                            f"  ✗ skip {owner}/{repo} — no SKILL.md / .cursor files found",
                            level="warn",
                        )
                    return

        full = f"{owner}/{repo}"
        if full in in_registry:
            duplicates += 1
            return

        source = f"{query_label}|{query_kind}"
        if enqueue_repo(owner, repo, stars, source_query=source, query_weight=weight):
            enqueued += 1
            in_registry.add(full)
            if job and enqueued <= 15:
                job.log(f"  + queue {full} ({stars:,}★) [{query_label}]")

    def _run_query(
        keywords: str,
        label: str,
        weight: float,
        *,
        query_kind: QueryKind,
        paginate: bool,
    ) -> None:
        nonlocal api_calls, scanned

        query = build_repo_query(keywords, kind=query_kind)
        query_key = f"{label}:{query[:100]}"
        page_start = 1 if force else get_query_page(query_key)
        last_page = page_start - 1
        page_count = pages if paginate else 1

        for page in range(page_start, page_start + page_count):
            if enqueued >= enqueue_cap:
                break
            try:
                items = client.search_repositories(query, per_page=max_per_page, page=page)
                api_calls += 1
            except Exception as e:
                if job:
                    job.log(f"Search failed [{label}] p{page}: {e}", level="warn")
                break
            if not items:
                break
            last_page = page
            for item in items:
                scanned += 1
                _try_enqueue(item, query_label=label, query_kind=query_kind, weight=weight)
                if enqueued >= enqueue_cap:
                    break
        if last_page >= page_start:
            set_query_page(query_key, last_page + 1)

    # 1) Always run all 6 user intent searches (GitHub search bar equivalents)
    for keywords, label, weight in INTENT_SEARCHES:
        if enqueued >= enqueue_cap:
            break
        _run_query(keywords, label, weight, query_kind="intent", paginate=True)

    # 2) Rotate path/name-qualified searches
    path_offset = get_int("discover_path_query_offset", 0) % max(len(PATH_SEARCHES), 1)
    path_batch = (
        PATH_SEARCHES[path_offset:] + PATH_SEARCHES[:path_offset]
    )[:path_queries_per_run]

    for keywords, label, weight in path_batch:
        if enqueued >= enqueue_cap:
            break
        _run_query(keywords, label, weight, query_kind="path", paginate=True)

    from studio.app_settings import set_setting

    try:
        set_setting(
            "discover_path_query_offset",
            (path_offset + path_queries_per_run) % len(PATH_SEARCHES),
            updated_by="discover",
        )
    except ValueError:
        pass

    stats = queue_stats()
    result = {
        "enqueued": enqueued,
        "scanned": scanned,
        "rejected": rejected,
        "duplicates": duplicates,
        "sanitized": sanitized,
        "api_calls": api_calls,
        "code_checks": code_checks,
        "queue_pending": stats.get("pending", 0),
        "queue_total": stats.get("total", 0),
    }
    if job:
        job.log(
            f"Discovery done — +{enqueued} queued, {rejected} rejected, "
            f"{stats.get('pending', 0)} pending total ({api_calls} repo searches, "
            f"{code_checks} code checks)."
        )
    return result
