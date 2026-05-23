"""Long-running admin jobs with human-readable logs and progress."""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from typing import Any, Callable

from studio.database import get_connection, row_to_dict


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobCancelled(Exception):
    """Raised when an admin stops a running job."""


_cancel_events: dict[int, threading.Event] = {}


def register_job_cancellation(activity_id: int) -> threading.Event:
    ev = threading.Event()
    _cancel_events[activity_id] = ev
    return ev


def unregister_job_cancellation(activity_id: int) -> None:
    _cancel_events.pop(activity_id, None)


def is_cancel_requested(activity_id: int) -> bool:
    ev = _cancel_events.get(activity_id)
    if ev and ev.is_set():
        return True
    with get_connection() as conn:
        row = conn.execute(
            "SELECT status FROM admin_activity WHERE id = ?", (activity_id,)
        ).fetchone()
    return bool(row and row[0] != "running")


class JobLogger:
    """Append human-readable and developer logs to an admin_activity row."""

    def __init__(self, activity_id: int, *, total_steps: int = 7) -> None:
        self.activity_id = activity_id
        self.total_steps = max(1, total_steps)
        self._step_index = 0

    def check_cancel(self) -> None:
        if is_cancel_requested(self.activity_id):
            raise JobCancelled()

    def log(self, message: str, *, level: str = "info") -> None:
        self.check_cancel()
        append_log(self.activity_id, message, level=level, kind="human")

    def dev(self, label: str, payload: Any) -> None:
        try:
            body = json.dumps(payload, default=str, indent=2)
        except TypeError:
            body = str(payload)
        append_log(
            self.activity_id,
            f"{label}:\n{body}",
            level="info",
            kind="dev",
        )

    def step(self, name: str, *, message: str | None = None) -> None:
        self.check_cancel()
        self._step_index += 1
        pct = min(99, int((self._step_index / self.total_steps) * 100))
        text = message or name
        update_progress(self.activity_id, step=name, progress=pct, detail=text[:500])
        self.log(text)

    def finish(self, summary: str, *, status: str = "ok", result: dict[str, Any] | None = None) -> None:
        if result:
            self.dev("summary", result)
        finish_activity(self.activity_id, status=status, detail=summary, progress=100)


def capture_registry_snapshot() -> dict[str, Any]:
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]
        synced = conn.execute(
            "SELECT COUNT(*) FROM assets WHERE content != ''"
        ).fetchone()[0]
        repos = conn.execute(
            "SELECT COUNT(DISTINCT source_repo) FROM assets"
        ).fetchone()[0]
    return {
        "total_assets": int(total),
        "synced_content": int(synced),
        "unique_repos": int(repos),
        "captured_at": _now_iso(),
    }


def get_running_activity() -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM admin_activity
            WHERE status = 'running'
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()
    if not row:
        return None
    return _enrich(row_to_dict(row) or {})


def start_activity(action: str, detail: str = "") -> int:
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO admin_activity (action, detail, status, progress, step, logs, meta_json)
            VALUES (?, ?, 'running', 0, 'Starting…', '[]', '{}')
            """,
            (action, detail[:500]),
        )
        conn.commit()
        return int(cur.lastrowid)


def update_activity_meta(activity_id: int, **fields: Any) -> None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT meta_json FROM admin_activity WHERE id = ?", (activity_id,)
        ).fetchone()
        if not row:
            return
        try:
            meta = json.loads(row[0] or "{}")
        except json.JSONDecodeError:
            meta = {}
        for key, val in fields.items():
            meta[key] = val
        conn.execute(
            "UPDATE admin_activity SET meta_json = ? WHERE id = ?",
            (json.dumps(meta), activity_id),
        )
        conn.commit()


def append_log(
    activity_id: int,
    message: str,
    *,
    level: str = "info",
    kind: str = "human",
) -> None:
    line = {"ts": _now_iso(), "level": level, "message": message, "kind": kind}
    with get_connection() as conn:
        row = conn.execute(
            "SELECT logs FROM admin_activity WHERE id = ?", (activity_id,)
        ).fetchone()
        if not row:
            return
        try:
            logs = json.loads(row[0] or "[]")
        except json.JSONDecodeError:
            logs = []
        logs.append(line)
        if len(logs) > 800:
            logs = logs[-800:]
        conn.execute(
            "UPDATE admin_activity SET logs = ? WHERE id = ?",
            (json.dumps(logs), activity_id),
        )
        conn.commit()


def update_progress(
    activity_id: int,
    *,
    step: str = "",
    progress: int = 0,
    detail: str | None = None,
) -> None:
    with get_connection() as conn:
        if detail is not None:
            conn.execute(
                """
                UPDATE admin_activity
                SET step = ?, progress = ?, detail = ?
                WHERE id = ?
                """,
                (step[:200], max(0, min(99, progress)), detail[:500], activity_id),
            )
        else:
            conn.execute(
                "UPDATE admin_activity SET step = ?, progress = ? WHERE id = ?",
                (step[:200], max(0, min(99, progress)), activity_id),
            )
        conn.commit()


def finish_activity(
    activity_id: int,
    *,
    status: str = "ok",
    detail: str = "",
    progress: int = 100,
    result_json: dict[str, Any] | None = None,
    snapshot_after: dict[str, Any] | None = None,
) -> bool:
    """Mark activity finished. Returns False if it was already stopped or finished."""
    serialized = json.dumps(result_json, default=str) if result_json else ""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT status, meta_json FROM admin_activity WHERE id = ?", (activity_id,)
        ).fetchone()
        if not row or row[0] != "running":
            return False
        if snapshot_after is not None:
            try:
                meta = json.loads(row[1] or "{}")
            except json.JSONDecodeError:
                meta = {}
            meta["snapshot_after"] = snapshot_after
            conn.execute(
                "UPDATE admin_activity SET meta_json = ? WHERE id = ?",
                (json.dumps(meta), activity_id),
            )
        cur = conn.execute(
            """
            UPDATE admin_activity
            SET status = ?, detail = ?, progress = ?, step = '', finished_at = ?,
                result_json = ?
            WHERE id = ? AND status = 'running'
            """,
            (status, detail[:2000], progress, _now_iso(), serialized[:120_000], activity_id),
        )
        conn.commit()
        return cur.rowcount > 0


def cancel_activity(
    activity_id: int | None = None,
    *,
    reason: str = "Stopped by admin",
) -> dict[str, Any]:
    """Force-stop a running activity. Works even if the worker thread is already gone."""
    if activity_id is None:
        running = get_running_activity()
        if not running:
            return {"ok": False, "message": "No running activity to stop."}
        activity_id = int(running["id"])

    ev = _cancel_events.get(activity_id)
    if ev:
        ev.set()

    with get_connection() as conn:
        row = conn.execute(
            "SELECT status FROM admin_activity WHERE id = ?", (activity_id,)
        ).fetchone()
        if not row:
            return {"ok": False, "message": "Activity not found."}
        if row[0] != "running":
            return {
                "ok": True,
                "activity_id": activity_id,
                "status": row[0],
                "message": f"Activity already {row[0]}.",
            }

    append_log(activity_id, reason, level="warn", kind="human")
    append_log(
        activity_id,
        json.dumps({"cancelled": True, "reason": reason}, indent=2),
        level="warn",
        kind="dev",
    )
    after = capture_registry_snapshot()
    update_activity_meta(
        activity_id,
        snapshot_after=after,
        cancelled_at=_now_iso(),
        cancelled_reason=reason,
    )
    finish_activity(
        activity_id,
        status="cancelled",
        detail=reason,
        progress=100,
        snapshot_after=after,
    )
    unregister_job_cancellation(activity_id)
    return {
        "ok": True,
        "activity_id": activity_id,
        "status": "cancelled",
        "message": "Job stopped. Registry state snapshot saved — you can start a new operation.",
        "snapshot_after": after,
    }


def get_activity(activity_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM admin_activity WHERE id = ?", (activity_id,)
        ).fetchone()
    if not row:
        return None
    return _enrich(row_to_dict(row) or {})


def _enrich(row: dict[str, Any]) -> dict[str, Any]:
    try:
        row["logs"] = json.loads(row.get("logs") or "[]")
    except json.JSONDecodeError:
        row["logs"] = []
    try:
        row["meta"] = json.loads(row.get("meta_json") or "{}")
    except json.JSONDecodeError:
        row["meta"] = {}
    try:
        raw = row.get("result_json") or ""
        row["result"] = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        row["result"] = None
    row["progress"] = int(row.get("progress") or 0)
    row["summary"] = _human_summary(row)
    row["snapshot_before"] = row["meta"].get("snapshot_before")
    row["snapshot_after"] = row["meta"].get("snapshot_after")
    return row


def _human_summary(row: dict[str, Any]) -> str:
    action = str(row.get("action") or "")
    detail = str(row.get("detail") or "")
    step = str(row.get("step") or "")
    status = str(row.get("status") or "")
    if status == "running":
        for line in reversed(row.get("logs") or []):
            if line.get("kind") == "dev":
                continue
            msg = str(line.get("message") or "").strip()
            if msg:
                return msg[:500]
        return step or detail or f"{action} in progress…"
    if detail and not detail.startswith("{"):
        return detail
    if action == "registry.dedupe" and detail.startswith("{"):
        return "Dedupe finished — see full log for counts"
    return detail or action


def run_in_background(fn: Callable[[], None]) -> None:
    import threading

    threading.Thread(target=fn, daemon=True).start()
