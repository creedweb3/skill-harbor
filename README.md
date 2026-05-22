# Skill Harbor

**Skill Harbor** is a local marketplace for [Cursor](https://cursor.com) agent assets — skills, rules, commands, and subagents — curated from the community and installable in one click.

Repository: [github.com/creedweb3/skill-harbor](https://github.com/creedweb3/skill-harbor)

## Install targets

- **Global:** `~/.cursor/skills/` (all projects)
- **Project:** `<your-repo>/.cursor/skills/` (current workspace)

There is no official Cursor plugin API. Skill Harbor **connects via the filesystem** — the same paths Cursor already uses.

## Quick start

```powershell
git clone https://github.com/creedweb3/skill-harbor.git
cd skill-harbor
npm install
npm run install:all
npm run dev
```

Or run `.\start.ps1` from the project folder.

Open **http://localhost:5173**

1. **Setup** — set your project directory; optionally add a GitHub token.
2. **Discover** — browse trending picks, profession rankings, and categories → **Fetch catalog** → **Install**.
3. **Installed** — view assets grouped by scope and type; export/import backups.
4. Restart Cursor or start a new Agent chat so new skills are picked up.

## Architecture

| Part | Stack |
|------|--------|
| API | Python 3.11+, FastAPI (`backend/`) |
| UI | React + Vite (`frontend/`) |
| Catalog | `scripts/cursor-curated-skills.json` + `scripts/scrape_cursor_github.py` |

## CLI

```powershell
python scripts/scrape_cursor_github.py --curated-only --report-only
```

## Config

Stored in `%USERPROFILE%\.cursor-skills-studio\config.json`:

- `project_dir`
- `github_token` (optional; removable in Settings)

## Production build

```powershell
npm run build:ui
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8765
```
