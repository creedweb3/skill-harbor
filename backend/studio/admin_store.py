"""Admin users and sessions in harbor.db."""

from __future__ import annotations

import hashlib
import os
import secrets
import time
from typing import Any

from studio.database import get_connection

SESSION_TTL_SECONDS = 24 * 3600
PBKDF2_ITERATIONS = 260_000


def _hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return digest.hex()


def create_password_record(password: str) -> tuple[str, str]:
    salt = os.urandom(16)
    return salt.hex(), _hash_password(password, salt)


def verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    expected = _hash_password(password, salt)
    return secrets.compare_digest(expected, hash_hex)


def admin_count(*, active_only: bool = True) -> int:
    with get_connection() as conn:
        if active_only:
            return conn.execute(
                "SELECT COUNT(*) FROM admin_users WHERE active = 1"
            ).fetchone()[0]
        return conn.execute("SELECT COUNT(*) FROM admin_users").fetchone()[0]


def seed_default_admin(
    username: str = "admin",
    password: str = "admin",
    *,
    only_if_empty: bool = True,
) -> bool:
    """Create default admin for local dev. Returns True if created."""
    if only_if_empty and admin_count() > 0:
        return False
    create_admin(username, password, role="superadmin")
    return True


def create_admin(username: str, password: str, *, role: str = "admin") -> dict[str, Any]:
    uname = username.strip().lower()
    if not uname or len(password) < 3:
        raise ValueError("Username and password (min 3 chars) required")
    salt_hex, hash_hex = create_password_record(password)
    with get_connection() as conn:
        try:
            conn.execute(
                """
                INSERT INTO admin_users (username, password_hash, password_salt, role, active)
                VALUES (?, ?, ?, ?, 1)
                """,
                (uname, hash_hex, salt_hex, role),
            )
            conn.commit()
        except Exception as e:
            if "UNIQUE" in str(e).upper():
                raise ValueError(f"Admin '{uname}' already exists") from e
            raise
        row = conn.execute(
            "SELECT id, username, role, active, created_at FROM admin_users WHERE username = ?",
            (uname,),
        ).fetchone()
    return dict(row) if row else {"username": uname}


def list_admins() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, username, role, active, created_at, updated_at
            FROM admin_users ORDER BY username COLLATE NOCASE
            """
        ).fetchall()
    return [dict(r) for r in rows]


def verify_admin_login(username: str, password: str) -> dict[str, Any] | None:
    uname = username.strip().lower()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, username, password_hash, password_salt, role, active
            FROM admin_users WHERE username = ? COLLATE NOCASE
            """,
            (uname,),
        ).fetchone()
    if not row or not row["active"]:
        return None
    if not verify_password(password, row["password_salt"], row["password_hash"]):
        return None
    return {"id": row["id"], "username": row["username"], "role": row["role"]}


def create_session(admin_user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = time.time() + SESSION_TTL_SECONDS
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO admin_sessions (token, admin_user_id, expires_at) VALUES (?, ?, ?)",
            (token, admin_user_id, expires),
        )
        conn.commit()
    return token


def destroy_session(token: str | None) -> None:
    if not token:
        return
    with get_connection() as conn:
        conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
        conn.commit()


def session_valid(token: str | None) -> tuple[bool, dict[str, Any] | None]:
    if not token:
        return False, None
    now = time.time()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT s.token, s.expires_at, u.id, u.username, u.role
            FROM admin_sessions s
            JOIN admin_users u ON u.id = s.admin_user_id
            WHERE s.token = ? AND u.active = 1
            """,
            (token,),
        ).fetchone()
        if not row:
            return False, None
        if float(row["expires_at"]) < now:
            conn.execute("DELETE FROM admin_sessions WHERE token = ?", (token,))
            conn.commit()
            return False, None
        new_exp = now + SESSION_TTL_SECONDS
        conn.execute(
            "UPDATE admin_sessions SET expires_at = ? WHERE token = ?",
            (new_exp, token),
        )
        conn.commit()
    return True, {"id": row["id"], "username": row["username"], "role": row["role"]}
