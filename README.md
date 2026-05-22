# SkillHarbor

**SkillHarbor** is a local marketplace for [Cursor](https://cursor.com) agent assets — skills, rules, commands, and subagents — curated from trusted GitHub sources and installable in one click.

Install to:

- **Global:** `~/.cursor/skills/` (all projects)
- **Project:** `<your-repo>/.cursor/` (current workspace)

There is no official Cursor plugin API. SkillHarbor connects via the **same filesystem paths** Cursor already uses.

## Quick start

```powershell
cd "$env:USERPROFILE\Documents\skill-harbor"
npm install
npm run install:all
npm run dev
```

Or run `.\start.ps1` from the project folder.

Open **http://localhost:5173**

1. Set your **project directory** in **Setup**.
2. Optionally add a **GitHub token** for star counts and discovery (removable anytime).
3. Browse **Trending** / **Top picks** or pick categories → **Fetch catalog** → **Install**.
4. Restart Cursor or start a new Agent chat so new assets load.

## Architecture

| Part | Stack |
|------|--------|
| API | Python 3.11+, FastAPI (`backend/`) |
| UI | React + Vite (`frontend/`) |
| Catalog | `scripts/cursor-curated-skills.json` + optional GitHub discovery |

## Config

Stored in `%USERPROFILE%\.skill-harbor\config.json` (migrates from legacy `.cursor-skills-studio`):

- `project_dir`
- `github_token` (optional; never commit)

## Production build

```powershell
npm run build:ui
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8765
```

## License

MIT — see repository for details.
