# Deployment — dev vs prod

## Database

| Mode | Env | Storage |
|------|-----|---------|
| **Development** | `SKILL_HARBOR_ENV=development` (default) | SQLite at `~/.cursor-skills-studio/harbor.db` |
| **Production** | `SKILL_HARBOR_ENV=production` | `SKILL_HARBOR_DATABASE_URL` |

Same SQLite file holds:

- Registry (`assets`, votes, domains, …)
- **Admin users** (`admin_users`, `admin_sessions`)
- **Live config** (`app_settings` — e.g. `min_repo_stars`)

PostgreSQL via `SKILL_HARBOR_DATABASE_URL=postgresql://…` is the intended prod target; wire-up is pending. Until then use a persistent SQLite path on the server.

## Admin users (database, not env)

On first API start in development, a default user is created:

- **Username:** `admin`
- **Password:** `admin`

Disable in production:

```env
SKILL_HARBOR_SEED_DEFAULT_ADMIN=0
```

Add admins via **Admin dashboard → API** `POST /api/admin/users` (while signed in) or insert via future UI.

Admin UI: `https://your-host/admin-dashboard` (not linked from the public app).

## Live registry settings (`app_settings`)

Editable without redeploy (admin API):

| Key | Default | Purpose |
|-----|---------|---------|
| `min_repo_stars` | 5000 | Prune & list threshold |
| `max_files_per_repo_expand` | 150 | Ingest cap per repo |
| `discover_max_per_skills_query` | 15 | GitHub skills search page size |
| `discover_max_per_domain_query` | 8 | Domain search page size |

`GET /api/admin/settings/registry`  
`PATCH /api/admin/settings/registry` with JSON body, e.g. `{ "min_repo_stars": 8000 }`

Settings are cached ~5s in the API process, then re-read from DB.

## Secrets still in config file (local)

Per-machine secrets remain in `~/.cursor-skills-studio/config.json`:

- `admin_github_token`
- `project_dir`

Move to DB/env in a later pass if you need centralized secrets.
