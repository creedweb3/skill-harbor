# Skill Harbor — Roadmap

## Phase 0 — Harbor Registry (current)

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
