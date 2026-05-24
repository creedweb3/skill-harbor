"""
Agent platform registry — Skill Harbor v2.

Defines install targets for Cursor, Claude Code, Codex, Gemini, Antigravity,
and other agents/IDEs that use filesystem-based skills, rules, and commands.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

PlatformStatus = Literal["stable", "beta", "planned"]
AssetKind = Literal["skill", "rule", "command", "agent", "agents_md"]


@dataclass(frozen=True)
class PlatformSpec:
    id: str
    label: str
    vendor: str
    status: PlatformStatus
    description: str
    global_root: str  # under Path.home(), e.g. ".cursor"
    project_root: str  # under project dir, e.g. ".cursor"
    supported_assets: tuple[AssetKind, ...]
    skill_subdir: str = "skills"
    rules_subdir: str = "rules"
    commands_subdir: str = "commands"
    agents_subdir: str = "agents"
    skill_filename: str = "SKILL.md"
    rule_extension: str = ".mdc"
    docs_url: str | None = None
    restart_hint: str = ""
    aliases: tuple[str, ...] = field(default_factory=tuple)


PLATFORMS: dict[str, PlatformSpec] = {
    "cursor": PlatformSpec(
        id="cursor",
        label="Cursor",
        vendor="Anysphere",
        status="stable",
        description="Cursor Agent skills, rules (.mdc), commands, and subagents.",
        global_root=".cursor",
        project_root=".cursor",
        supported_assets=("skill", "rule", "command", "agent", "agents_md"),
        docs_url="https://cursor.com/docs",
        restart_hint="Restart Cursor or open a new Agent chat after installing.",
        aliases=("anysphere",),
    ),
    "claude": PlatformSpec(
        id="claude",
        label="Claude Code",
        vendor="Anthropic",
        status="stable",
        description="Claude Code project skills and instruction files.",
        global_root=".claude",
        project_root=".claude",
        supported_assets=("skill", "rule", "command", "agent", "agents_md"),
        skill_filename="SKILL.md",
        rule_extension=".md",
        docs_url="https://docs.anthropic.com/en/docs/claude-code",
        restart_hint="Restart Claude Code or start a new session to pick up skills.",
        aliases=("claude-code", "anthropic"),
    ),
    "codex": PlatformSpec(
        id="codex",
        label="Codex",
        vendor="OpenAI",
        status="stable",
        description="OpenAI Codex CLI skills and agent plugins.",
        global_root=".codex",
        project_root=".codex",
        supported_assets=("skill", "rule", "agents_md"),
        docs_url="https://developers.openai.com/codex",
        restart_hint="Restart the Codex CLI session after installing skills.",
        aliases=("openai-codex",),
    ),
    "gemini": PlatformSpec(
        id="gemini",
        label="Gemini CLI",
        vendor="Google",
        status="beta",
        description="Gemini CLI extensions and project context (GEMINI.md).",
        global_root=".gemini",
        project_root=".gemini",
        supported_assets=("skill", "rule", "agents_md"),
        rule_extension=".md",
        docs_url="https://github.com/google-gemini/gemini-cli",
        restart_hint="Restart the Gemini CLI after installing project context.",
        aliases=("google-gemini", "gemini-cli"),
    ),
    "antigravity": PlatformSpec(
        id="antigravity",
        label="Antigravity",
        vendor="Google",
        status="beta",
        description="Google Antigravity IDE agent rules and skills.",
        global_root=".agent",
        project_root=".agent",
        supported_assets=("skill", "rule", "command", "agent"),
        rule_extension=".md",
        restart_hint="Reload the Antigravity workspace after installing assets.",
        aliases=("google-antigravity",),
    ),
    "windsurf": PlatformSpec(
        id="windsurf",
        label="Windsurf",
        vendor="Codeium",
        status="beta",
        description="Windsurf Cascade rules and workflows.",
        global_root=".codeium",
        project_root=".windsurf",
        supported_assets=("rule", "skill", "agents_md"),
        rule_extension=".md",
        restart_hint="Reload Windsurf after updating rules.",
        aliases=("codeium", "cascade"),
    ),
    "cline": PlatformSpec(
        id="cline",
        label="Cline",
        vendor="Cline",
        status="beta",
        description="Cline custom instructions and rule files.",
        global_root=".cline",
        project_root=".cline",
        supported_assets=("rule", "skill", "agents_md"),
        rule_extension=".md",
        restart_hint="Start a new Cline task to apply updated rules.",
        aliases=(),
    ),
    "copilot": PlatformSpec(
        id="copilot",
        label="GitHub Copilot",
        vendor="GitHub",
        status="planned",
        description="Copilot custom instructions (.github/copilot-instructions.md).",
        global_root=".github",
        project_root=".github",
        supported_assets=("rule", "agents_md"),
        rule_extension=".md",
        docs_url="https://docs.github.com/en/copilot",
        restart_hint="Planned — Copilot uses repo-level instruction files.",
        aliases=("github-copilot",),
    ),
    "continue": PlatformSpec(
        id="continue",
        label="Continue",
        vendor="Continue",
        status="planned",
        description="Continue dev assistant config and rules.",
        global_root=".continue",
        project_root=".continue",
        supported_assets=("rule", "skill"),
        restart_hint="Planned — Continue config-based rules.",
        aliases=(),
    ),
    "aider": PlatformSpec(
        id="aider",
        label="Aider",
        vendor="Aider",
        status="planned",
        description="Aider CONVENTIONS and project notes.",
        global_root=".aider",
        project_root=".aider",
        supported_assets=("rule", "agents_md"),
        restart_hint="Planned — Aider uses .aider.conf.yml and conventions files.",
        aliases=(),
    ),
}

DEFAULT_PLATFORM_ID = "cursor"


def get_platform(platform_id: str | None) -> PlatformSpec:
    key = (platform_id or DEFAULT_PLATFORM_ID).lower().strip()
    if key in PLATFORMS:
        return PLATFORMS[key]
    for spec in PLATFORMS.values():
        if key in spec.aliases:
            return spec
    return PLATFORMS[DEFAULT_PLATFORM_ID]


def list_platforms(*, include_planned: bool = True) -> list[PlatformSpec]:
    specs = list(PLATFORMS.values())
    if not include_planned:
        specs = [s for s in specs if s.status != "planned"]
    return sorted(specs, key=lambda s: ({"stable": 0, "beta": 1, "planned": 2}[s.status], s.label))


def platform_to_dict(spec: PlatformSpec) -> dict:
    return {
        "id": spec.id,
        "label": spec.label,
        "vendor": spec.vendor,
        "status": spec.status,
        "description": spec.description,
        "global_root": spec.global_root,
        "project_root": spec.project_root,
        "supported_assets": list(spec.supported_assets),
        "skill_subdir": spec.skill_subdir,
        "rules_subdir": spec.rules_subdir,
        "commands_subdir": spec.commands_subdir,
        "agents_subdir": spec.agents_subdir,
        "skill_filename": spec.skill_filename,
        "rule_extension": spec.rule_extension,
        "docs_url": spec.docs_url,
        "restart_hint": spec.restart_hint,
        "installable": spec.status in ("stable", "beta"),
    }
