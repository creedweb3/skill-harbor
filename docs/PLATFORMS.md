# Skill Harbor v2 — Platform support

Skill Harbor is evolving from a Cursor-only installer into a **multi-platform agent skills marketplace**. The same catalog (skills, rules, commands, subagents) can be installed to different agents and IDEs via filesystem paths each tool already understands.

## Platform matrix

| Platform | Status | Global root | Project root | Skills | Rules | Commands | Agents |
|----------|--------|-------------|--------------|--------|-------|----------|--------|
| **Cursor** | stable | `~/.cursor` | `.cursor` | ✓ | ✓ (.mdc) | ✓ | ✓ |
| **Claude Code** | stable | `~/.claude` | `.claude` | ✓ | ✓ (.md) | ✓ | ✓ |
| **Codex** | stable | `~/.codex` | `.codex` | ✓ | ✓ | — | ✓ |
| **Gemini CLI** | beta | `~/.gemini` | `.gemini` | ✓ | ✓ | — | ✓ |
| **Antigravity** | beta | `~/.agent` | `.agent` | ✓ | ✓ | ✓ | ✓ |
| **Windsurf** | beta | `~/.codeium` | `.windsurf` | ✓ | ✓ | — | ✓ |
| **Cline** | beta | `~/.cline` | `.cline` | ✓ | ✓ | — | ✓ |
| **GitHub Copilot** | planned | `.github` | `.github` | — | ✓ | — | ✓ |
| **Continue** | planned | `~/.continue` | `.continue` | ✓ | ✓ | — | — |
| **Aider** | planned | `~/.aider` | `.aider` | — | ✓ | — | ✓ |

Paths follow the layout: `{root}/{skills|rules|commands|agents}/` with `SKILL.md` inside each skill folder unless noted.

## API

- `GET /api/platforms` — list platforms, installability, supported asset types
- `GET /api/connection?platform=cursor` — scope paths for a platform
- `GET /api/catalog?platform=claude` — filter catalog to assets compatible with a platform
- `POST /api/install` — body may include `"platform": "claude"`
- `GET /api/export?platform=claude` — backup for a platform's install roots
- Settings: `default_platform` in `~/.cursor-skills-studio/config.json`

Each catalog asset has a `platforms` array (stored in `asset_platforms`) inferred from repo path or manifest hints.

## Implementation

- Registry: `backend/studio/platforms.py`
- Path resolution: `backend/studio/platform_paths.py`
- Machine-readable list: `platforms/registry.json`

## Contributing a platform

1. Add a `PlatformSpec` in `platforms.py` with verified paths from official docs.
2. Set `status` to `beta` until install has been tested on that tool.
3. Open a PR with docs link and a sample install screenshot or log.

Beta platforms may use community conventions; we prioritize **safe, predictable filesystem installs** over perfect feature parity.
