# Harbor registry

## Database today: **SQLite**

- File: `~/.cursor-skills-studio/harbor.db`
- **Cost:** $0 — local file, no cloud
- **Scale:** Great for 10k–100k assets on desktop; single-writer
- **Future hosted option:** [Turso](https://turso.tech) (SQLite edge, generous free tier) or **Supabase Postgres** (500MB free)

## Quality rules

| Rule | Detail |
|------|--------|
| **Min repo stars** | 1,000 — assets from lower-star repos are **pruned** on admin refresh |
| **Exception** | `source_type = custom` (manual import by URL) always kept |

## Admin vs public

| Role | GitHub token | Actions |
|------|----------------|---------|
| **Public user** | None | Browse, vote, install, sync content (raw GitHub) |
| **Admin (you)** | `admin_github_token` in config or `SKILL_HARBOR_ADMIN_TOKEN` env | Expand crawl, refresh star counts, prune, full registry rebuild |

Token is **never** exposed in API responses.

## Initial registry upload (admin)

```powershell
# Optional: set admin token for accurate stars + faster API
$env:SKILL_HARBOR_ADMIN_TOKEN = "ghp_..."

cd backend
python ../scripts/build_registry.py --full
```

Or in the app: **Settings → Admin → Refresh registry**

## Auto-update strategy

1. **Local app:** run `build_registry.py --full` weekly (Task Scheduler / cron)
2. **Hosted (later):** GitHub Action on `skill-harbor` repo builds `harbor.db` → release asset → clients download delta
3. **Intelligent crawl:** admin refresh order = expand → refresh stars → prune &lt;5k★ → sync content

## Anonymous votes

- Stored in `asset_votes` with a random `voter_id` in browser `localStorage`
- One vote per asset per browser; toggle same vote to remove
- Counts on `assets.upvotes` / `assets.downvotes`

## Browse search

Search is **registry-only** (local DB): title, install name, repo (`owner/repo`), GitHub URL, file path, content preview. It does **not** live-search GitHub — use **Custom import** for a new repo URL.

## Duplicates

Each asset is keyed by **`owner/repo::file/path`** — true path duplicates cannot exist. What looked like duplicates was usually **the same install/title** for different files (e.g. 130 skills all labeled `ai-research` from one mega-repo).

Admin refresh runs **dedupe**: fix names from paths, drop `_template` junk, remove identical content, collapse any remaining install-name collisions.

```powershell
python scripts/build_registry.py --dedupe-only
```

## Taxonomy v2 (domains + tech stack)

Each asset has:

| Field | Cardinality | Purpose |
|-------|-------------|---------|
| **primary_domain** | 1 | Discovery sections, main filter bucket |
| **secondary_domains** | 0–2 | Extra filters in `asset_domains` |
| **tech_tags** | 0–5 | Stack filter (Python, Next.js, etc.) in `asset_tech_tags` |

**Primary domains (10):** `agent-ai`, `languages`, `web-frameworks`, `backend-apis`, `testing-security`, `devops-infra`, `design-ux`, `growth-seo`, `docs-workflow`, `data-ml`.

Legacy v1 slugs (e.g. `web-development`, `full-stack`) are mapped to v2 on ingest and reclassify.

### Reclassify after taxonomy changes

```powershell
python scripts/build_registry.py --reclassify-only
```

Or in the app: **Admin → Reclassify tags**.

## Evolving registry (continuous updates)

**Evolve registry** runs the full cycle:

1. Expand seed repos (11+ high-star sources)
2. **Discover** new repos via GitHub search (requires admin token in Settings)
3. Refresh star counts, prune repos below 5k★ (skills-related discovery uses `stars:>5000` on GitHub)
4. **Safety purge** — remove harmful / suspicious content
5. Dedupe, **reclassify** (content + path based), sync file content

```powershell
python scripts/build_registry.py --evolve-only
```

Or **Admin → Evolve registry** (recommended weekly).

## Safety verification

Assets are scanned for prompt-injection patterns, malware references, credential theft instructions, and placeholder templates. Unsafe rows are skipped on ingest and removed on purge/reclassify.

## Installed item updates

On **Installed**, click **Check updates** to compare local files with registry content hashes. **Update** per item or **Update all** — selective, not forced.

## GitHub links in the UI

- **Open on GitHub** → `github.com/owner/repo/blob/branch/path` (file view)
- **View repository** → repo home
- `raw_url` is kept for sync/install only (not shown as the primary link)
