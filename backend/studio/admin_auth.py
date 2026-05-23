"""Admin dashboard auth — users and sessions in harbor.db."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from studio import admin_store, config
from studio.admin_store import SESSION_TTL_SECONDS

SESSION_COOKIE = "harbor_admin_session"


def admin_credentials_configured() -> bool:
    return admin_store.admin_count() > 0


def verify_admin_password(username: str, password: str) -> bool:
    return admin_store.verify_admin_login(username, password) is not None


def create_session_for_user(username: str, password: str) -> str | None:
    user = admin_store.verify_admin_login(username, password)
    if not user:
        return None
    return admin_store.create_session(int(user["id"]))


def destroy_session(token: str | None) -> None:
    admin_store.destroy_session(token)


def session_valid(token: str | None) -> bool:
    ok, _ = admin_store.session_valid(token)
    return ok


def token_from_request(request: Request) -> str | None:
    cookie = request.cookies.get(SESSION_COOKIE)
    if cookie:
        return cookie
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def require_admin(request: Request) -> dict[str, Any]:
    if not admin_credentials_configured():
        raise HTTPException(
            503,
            "No admin users in database. Restart API with SKILL_HARBOR_SEED_DEFAULT_ADMIN=1 for dev.",
        )
    token = token_from_request(request)
    ok, user = admin_store.session_valid(token)
    if not ok or not user:
        raise HTTPException(401, "Admin login required.")
    return user


def session_info(request: Request) -> dict[str, Any]:
    token = token_from_request(request)
    ok, user = admin_store.session_valid(token)
    return {
        "authenticated": ok,
        "username": user["username"] if user else None,
        "role": user["role"] if user else None,
        "github_token_set": bool(config.get_admin_github_token()),
        "credentials_configured": admin_credentials_configured(),
        "session_ttl_hours": SESSION_TTL_SECONDS // 3600,
    }
