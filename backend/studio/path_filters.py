"""Path allow/block patterns shared by crawler, discovery, and registry dedupe.

Skill assets are indexed only under known agent IDE layouts (.cursor/skills,
skills/, .claude/skills, …). Build and dependency trees (node_modules, vendor,
dist) are always skipped.
"""

from __future__ import annotations

from pathlib import Path

# Path segments that never contain installable skills/rules (build & deps).
SKIP_PATH_SEGMENTS: tuple[str, ...] = (
    "/node_modules/",
    "/vendor/",
    "/dist/",
    "/build/",
    "/.next/",
    "/out/",
    "/coverage/",
    "/__pycache__/",
    "/.github/workflows/",
    "/target/",
)

# Directories where SKILL.md (or sibling skill files) are expected.
SKILL_DIR_MARKERS: tuple[str, ...] = (
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
    "/copilot-skills/",
)

RULE_DIR_MARKERS: tuple[str, ...] = (
    "/rules/",
    "/.cursor/rules/",
    "/.claude/rules/",
    "/.codex/rules/",
    "/.gemini/",
    "/.agent/rules/",
    "/.windsurf/",
    "/.cline/",
)

AGENT_DIR_MARKERS: tuple[str, ...] = (
    "/.cursor/agents/",
    "/.claude/agents/",
    "/.agent/agents/",
)

SKIP_PATH_FRAGMENTS: tuple[str, ...] = (
    "/_template.",
    "/_template/",
    "rules/_template",
)

SKILL_FILENAME = "SKILL.md"
MIN_CONTENT_HASH_LEN = 12


def normalize_repo_path(path: str) -> str:
    return f"/{path.replace(chr(92), '/').strip('/')}/".lower()


def is_blocked_path(path: str) -> bool:
    """True for templates, build output, and dependency/vendor trees."""
    lower = path.replace("\\", "/").lower()
    if any(f in lower for f in SKIP_PATH_FRAGMENTS):
        return True
    norm = normalize_repo_path(path)
    return any(seg in norm for seg in SKIP_PATH_SEGMENTS)


def path_in_skill_dir(path: str) -> bool:
    norm = normalize_repo_path(path)
    return any(marker in norm for marker in SKILL_DIR_MARKERS)


def classify_candidate_path(path: str) -> str | None:
    """Return asset type if path is a crawl candidate, else None."""
    if is_blocked_path(path):
        return None

    lower = path.replace("\\", "/").lower()
    normalized = normalize_repo_path(path)
    name = Path(path).name

    if name.startswith("_") or "_template" in lower:
        return None

    if name == "agents.md" and lower.endswith("agents.md"):
        return "agents_md"

    if name.lower() == SKILL_FILENAME.lower():
        if path_in_skill_dir(path):
            return "skill"
        parts = [p for p in lower.split("/") if p]
        if len(parts) >= 2 and parts[-1] == "skill.md":
            if not any(x in normalized for x in ("/docs/", "/documentation/", "/test/", "/tests/")):
                return "skill"
        return None

    if name.endswith(".mdc"):
        if any(marker in normalized for marker in RULE_DIR_MARKERS):
            return "rule"
        if lower.endswith(".mdc") and lower.count("/") <= 1:
            return "rule"

    if name.endswith(".md") and "/.cursor/commands/" in normalized:
        return "command"
    if name.endswith(".md") and any(m in normalized for m in AGENT_DIR_MARKERS):
        return "agent"
    if name == ".cursorrules":
        return "rule"
    if name.endswith(".md") and "/rules/" in normalized:
        return "rule"
    return None


def path_quality_key(path: str) -> tuple[int, int, int, str]:
    """Lower is better when picking one row among duplicates."""
    norm = path or ""
    if is_blocked_path(norm):
        return (3, 999, len(norm), norm)
    ranked = normalize_repo_path(norm)
    preferred_markers = SKILL_DIR_MARKERS + (
        "/.agents/skills/",
        "/.kiro/skills/",
    )
    for i, marker in enumerate(preferred_markers):
        if marker in ranked:
            return (0, i, len(norm), norm)
    lower = norm.replace("\\", "/").lower()
    if lower.endswith("/skill.md") or lower.endswith("skill.md"):
        return (1, 0, len(norm), norm)
    return (2, 0, len(norm), norm)
