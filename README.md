# Skill Harbor

**Skill Harbor** is a local-first marketplace for agent skills, rules, commands, and subagents — curated from the community and installable in one click.

**v2** extends beyond [Cursor](https://cursor.com) to **Claude Code**, **Codex**, **Gemini CLI**, **Antigravity**, **Windsurf**, **Cline**, and more. See [docs/PLATFORMS.md](docs/PLATFORMS.md) for the compatibility matrix.

Repository: [github.com/creedweb3/skill-harbor](https://github.com/creedweb3/skill-harbor)

## Install targets

Choose your **agent / IDE** in the app (Settings or Discover install bar), then:

- **Global:** e.g. `~/.cursor/skills/`, `~/.claude/skills/`, `~/.codex/skills/`
- **Project:** e.g. `<your-repo>/.cursor/skills/`, `<repo>/.claude/skills/`

There is no universal plugin API. Skill Harbor **connects via the filesystem** — the same paths each tool already uses.

## Quick start

```powershell
git clone https://github.com/creedweb3/skill-harbor.git
cd skill-harbor
git checkout v2
npm install
npm run install:all
npm run dev
```

Or run `.\start.ps1` from the project folder.

`npm run dev` **force-stops** any prior UI (:5173) and API (:8765) processes before starting. To stop without starting:

```powershell
npm run stop        # both UI + API
npm run stop:ui     # Vite only
npm run stop:api    # API only
```

Open **http://localhost:5173**

1. **Setup** — pick default platform (Cursor, Claude, …), set project directory; optionally add a GitHub token.
2. **Discover** — browse trending picks, profession rankings, and categories → **Install**.
3. **Installed** — view assets grouped by scope and type; export/import backups.
4. Restart your agent or start a new session so new skills are picked up.

## Architecture

| Part | Stack |
|------|--------|
| API | Python 3.11+, FastAPI (`backend/`) |
| UI | React + Vite (`frontend/`) |
| Catalog | `scripts/cursor-curated-skills.json` + GitHub sync → `harbor.db` |
| Platforms | `backend/studio/platforms.py` + `platforms/registry.json` |

## CLI

```powershell
python scripts/scrape_cursor_github.py --curated-only --report-only
```

## Config

Stored in `%USERPROFILE%\.cursor-skills-studio\config.json`:

- `project_dir`
- `default_platform` (e.g. `cursor`, `claude`, `codex`)
- `github_token` (optional; removable in Settings)

## Production build

```powershell
npm run build:ui
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8765
```

## Branch: v2

Work on multi-platform marketplace features happens on the **`v2`** branch. `prototype-v1` remains Cursor-focused; merge to `main` when v2 is stable.
