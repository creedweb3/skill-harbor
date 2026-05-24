# Skill Harbor — Architecture

**By Devs, For Devs** — an open-source, local-first marketplace for agent skills, rules, commands, and subagents across **Cursor, Claude Code, Codex, Gemini, Antigravity**, and other filesystem-based agents.

## Vision

Skill Harbor is not a one-off script. It is the registry layer developers deserve: discover vetted community assets, **read full content before install**, sync from GitHub on your schedule, and install to **your chosen agent/IDE** with confidence.

**v2** adds a platform abstraction (`backend/studio/platforms.py`, `platform_paths.py`) so one catalog can target multiple install roots. See [PLATFORMS.md](./PLATFORMS.md).

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
│  Harbor DB (SQLite)    │    │  Agent filesystem (per platform)│
│  assets · domains      │    │  ~/.cursor · ~/.claude · …      │
│  sync_runs             │    │  skills · rules · commands      │
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
| GET | `/api/platforms` | Supported agents/IDEs and install roots |
| POST | `/api/install` | Write selected assets (optional `platform`) |
| GET/PATCH | `/api/settings` | Project dir, token (local config.json) |

**Removed from UX:** “Fetch catalog” live scrape on every browse. Reads are DB-first; **Sync registry** is explicit.

## Local-first & privacy

- Database: `~/.cursor-skills-studio/harbor.db`
- Config: `~/.cursor-skills-studio/config.json` (GitHub token never sent to third parties)
- No telemetry in core OSS build
- All install operations are local filesystem writes

## Discovery UI (admin-configurable)

Discovery layout and limits are stored in `app_settings.discovery_ui` (JSON). Defaults: `config/discovery-ui.default.json`. Admins edit via **Admin → Discovery panel** (no UI redeploy).

| Key | Meaning |
|-----|---------|
| `layout.columns` / `layout.rows` | Cards per category (default 3×2) |
| `limits.items_per_domain` | Top skills per category (default 6) |
| `limits.profession_domain_count` | Category columns on Discovery (default 6) |
| `profession_domains` | Ordered domain slugs |
| `rotate_domains` | Weekly rotation through the domain list |

Taxonomy assigns **one** `primary_domain` per asset. Run **Reclassify** after rule changes.

## Future (OSS → SaaS path)

1. **Postgres** + optional hosted registry for teams
2. **Scheduled sync** (cron / background worker)
3. **Community submissions** via PR to manifest → ingest pipeline
4. **Org workspaces** — shared allowlists, audit log, SSO
5. **Full-text search** (SQLite FTS5 → Meilisearch)

See [ROADMAP.md](./ROADMAP.md) for phased delivery.
