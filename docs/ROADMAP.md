# Skill Harbor — Roadmap

## Phase 0 — Harbor Registry (v1 / prototype-v1)

Done on `prototype-v1`.

## Phase 0.5 — Multi-platform marketplace (v2 branch, in progress)

- [x] Platform registry (Cursor, Claude, Codex, Gemini, Antigravity, Windsurf, Cline, …)
- [x] `GET /api/platforms`, platform-aware install & connection
- [x] UI platform selector (Settings + Discover install bar)
- [x] Platform-specific install writes (rule extension per platform)
- [x] Per-platform catalog tags, filters, and compatibility badges
- [x] GitHub discovery paths for `.claude/`, `.codex/`, `.gemini/`, `.agent/`, etc.
- [x] Platform-aware export/import and installed update checks
- [ ] Dedicated curated manifests per platform (beyond universal skills)
- [ ] Copilot / Continue / Aider install adapters (planned platforms)

## Phase 0 — Harbor Registry (baseline, shipped)

- [x] SQLite catalog (`harbor.db`) seeded from community manifests
- [x] **Sync registry** replaces live curated fetch
- [x] Professional discovery dashboard (trending periods, domains)
- [x] **Content inspector** — read SKILL.md / rules before install
- [x] “By Devs, For Devs” product shell

## Phase 1 — Registry ops

- Scheduled background sync (daily stars + content hash check)
- FTS5 search inside DB
- Sync diff view (what changed since last run)
- Import/export harbor.db backup

## Phase 2 — Community scale

- Public registry API (read-only)
- Contribution flow: validate → ingest → rank
- Asset ratings & install counts (opt-in telemetry)
- Verified publisher badges

## Phase 3 — Team & org

- Shared team catalogs
- Policy: allowed domains, required review
- Postgres backend option
- Hosted Skill Harbor Cloud (optional SaaS)

---

**Principle:** Ship value to solo devs first. Every phase keeps local-first install and full content transparency.
