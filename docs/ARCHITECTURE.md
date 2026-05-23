# Skill Harbor — Architecture

**By Devs, For Devs** — an open-source, local-first marketplace for Cursor agent skills, rules, commands, and subagents.

## Vision

Skill Harbor is not a one-off script. It is the registry layer developers deserve: discover vetted community assets, **read full content before install**, sync from GitHub on your schedule, and install to Cursor with confidence.

## System layers

```
┌─────────────────────────────────────────────────────────────┐
│  UI (React + Vite)                                          │
│  Discovery · Browse · Inspector · Installed · Settings      │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST
┌───────────────────────────▼─────────────────────────────────┐
│  API (FastAPI)                                              │
│  /catalog · /assets/{id} · /sync · /install · /export       │
└───────────┬─────────────────────────────┬─────────────────────┘
            │                             │
┌───────────▼──────────┐    ┌───────────▼─────────────────────┐
│  Harbor DB (SQLite)    │    │  Cursor filesystem              │
│  assets · domains      │    │  ~/.cursor/skills · .cursor/    │
│  sync_runs             │    │  rules · commands · agents      │
└───────────┬────────────┘    └─────────────────────────────────┘
            │
┌───────────▼────────────┐
│  GitHub sync worker    │
│  raw content + metadata│
└────────────────────────┘
```

## Data model

| Entity | Purpose |
|--------|---------|
| **assets** | Canonical catalog row: repo path, type, stars, rank, **full content**, preview, sync timestamps |
| **asset_domains** | Many-to-many tags (web-development, agent-ai, …) |
| **sync_runs** | Audit log for registry refresh jobs |

Asset ID: `{owner}/{repo}::{path}` — stable across syncs.

## API surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/catalog` | List/filter assets from DB (no live GitHub on read) |
| GET | `/api/assets/{id}` | Full asset + content for inspector |
| POST | `/api/sync` | Refresh content/metadata from GitHub |
| GET | `/api/sync/status` | Last sync run |
| GET | `/api/leaderboards` | Trending / domains from DB |
| POST | `/api/install` | Write selected assets to Cursor paths |
| GET/PATCH | `/api/settings` | Project dir, token (local config.json) |

**Removed from UX:** “Fetch catalog” live scrape on every browse. Reads are DB-first; **Sync registry** is explicit.

## Local-first & privacy

- Database: `~/.cursor-skills-studio/harbor.db`
- Config: `~/.cursor-skills-studio/config.json` (GitHub token never sent to third parties)
- No telemetry in core OSS build
- All install operations are local filesystem writes

## Future (OSS → SaaS path)

1. **Postgres** + optional hosted registry for teams
2. **Scheduled sync** (cron / background worker)
3. **Community submissions** via PR to manifest → ingest pipeline
4. **Org workspaces** — shared allowlists, audit log, SSO
5. **Full-text search** (SQLite FTS5 → Meilisearch)

See [ROADMAP.md](./ROADMAP.md) for phased delivery.
