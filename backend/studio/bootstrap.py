"""First-run bootstrap: default settings, default admin, schema."""

from __future__ import annotations

import os

from studio import app_settings, admin_store
from studio.db_config import get_harbor_env


def bootstrap_harbor() -> dict[str, object]:
    app_settings.seed_defaults()

    created_admin = False
    if get_harbor_env().value == "development" or os.environ.get(
        "SKILL_HARBOR_SEED_DEFAULT_ADMIN", "1"
    ) in ("1", "true", "yes"):
        created_admin = admin_store.seed_default_admin("admin", "admin", only_if_empty=True)

    return {
        "settings_seeded": True,
        "default_admin_created": created_admin,
        "admin_count": admin_store.admin_count(),
        "min_repo_stars": app_settings.get_min_repo_stars(),
    }
