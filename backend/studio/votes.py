"""Anonymous asset voting."""

from __future__ import annotations

from datetime import datetime, timezone

from studio.database import get_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def cast_vote(asset_id: str, voter_id: str, direction: str) -> dict:
    vote = 1 if direction == "up" else -1 if direction == "down" else None
    if vote is None or not voter_id.strip():
        raise ValueError("Invalid vote")

    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM assets WHERE id = ?", (asset_id,)).fetchone()
        if not exists:
            raise LookupError("Asset not found")

        prev = conn.execute(
            "SELECT vote FROM asset_votes WHERE asset_id = ? AND voter_id = ?",
            (asset_id, voter_id),
        ).fetchone()

        user_vote = 0
        if prev and prev[0] == vote:
            conn.execute(
                "DELETE FROM asset_votes WHERE asset_id = ? AND voter_id = ?",
                (asset_id, voter_id),
            )
            delta_up = -1 if vote == 1 else 0
            delta_down = -1 if vote == -1 else 0
        elif prev:
            conn.execute(
                "UPDATE asset_votes SET vote = ?, updated_at = ? WHERE asset_id = ? AND voter_id = ?",
                (vote, _now(), asset_id, voter_id),
            )
            delta_up = (1 if vote == 1 else 0) - (1 if prev[0] == 1 else 0)
            delta_down = (1 if vote == -1 else 0) - (1 if prev[0] == -1 else 0)
            user_vote = vote
        else:
            conn.execute(
                "INSERT INTO asset_votes (asset_id, voter_id, vote, updated_at) VALUES (?, ?, ?, ?)",
                (asset_id, voter_id, vote, _now()),
            )
            delta_up = 1 if vote == 1 else 0
            delta_down = 1 if vote == -1 else 0
            user_vote = vote

        if delta_up or delta_down:
            conn.execute(
                "UPDATE assets SET upvotes = MAX(0, upvotes + ?), downvotes = MAX(0, downvotes + ?) WHERE id = ?",
                (delta_up, delta_down, asset_id),
            )

        row = conn.execute(
            "SELECT upvotes, downvotes FROM assets WHERE id = ?", (asset_id,)
        ).fetchone()
        conn.commit()

    up, down = int(row[0]), int(row[1])
    return {
        "asset_id": asset_id,
        "upvotes": up,
        "downvotes": down,
        "score": up - down,
        "user_vote": user_vote,
    }


def get_user_vote(asset_id: str, voter_id: str) -> int:
    if not voter_id:
        return 0
    with get_connection() as conn:
        row = conn.execute(
            "SELECT vote FROM asset_votes WHERE asset_id = ? AND voter_id = ?",
            (asset_id, voter_id),
        ).fetchone()
    return int(row[0]) if row else 0
