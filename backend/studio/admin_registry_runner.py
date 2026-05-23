"""Run registry admin operations as background jobs with snapshots and logs."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException

from studio.admin_jobs import (
    JobCancelled,
    JobLogger,
    capture_registry_snapshot,
    finish_activity,
    get_running_activity,
    is_cancel_requested,
    register_job_cancellation,
    run_in_background,
    start_activity,
    unregister_job_cancellation,
    update_activity_meta,
)


def ensure_no_running_job() -> None:
    if get_running_activity():
        raise HTTPException(
            409,
            "A registry job is already running. Open Activity to watch live progress.",
        )


def run_registry_job(
    action: str,
    start_message: str,
    runner: Callable[[JobLogger], dict[str, Any]],
    *,
    total_steps: int = 4,
    finish_message: Callable[[dict[str, Any]], str] | None = None,
) -> dict[str, Any]:
    """Start a background registry job; returns immediately with activity_id."""
    ensure_no_running_job()
    before = capture_registry_snapshot()
    activity_id = start_activity(action, start_message)
    update_activity_meta(activity_id, snapshot_before=before)

    def _run() -> None:
        register_job_cancellation(activity_id)
        job = JobLogger(activity_id, total_steps=total_steps)
        job.log(start_message)
        job.dev("snapshot_before", before)
        try:
            result = runner(job)
            if is_cancel_requested(activity_id):
                return
            after = capture_registry_snapshot()
            job.dev("snapshot_after", after)
            job.dev("result", result)
            summary = (
                finish_message(result)
                if finish_message
                else f"{action} complete"
            )
            if finish_activity(
                activity_id,
                status="ok",
                detail=summary,
                progress=100,
                result_json=result,
                snapshot_after=after,
            ):
                job.log(summary)
        except JobCancelled:
            if not is_cancel_requested(activity_id):
                after = capture_registry_snapshot()
                finish_activity(
                    activity_id,
                    status="cancelled",
                    detail="Stopped by admin",
                    progress=100,
                    snapshot_after=after,
                )
        except Exception as e:
            if is_cancel_requested(activity_id):
                return
            after = capture_registry_snapshot()
            job.log(f"Failed: {e}", level="error")
            job.dev("error", {"message": str(e), "snapshot_after": after})
            finish_activity(
                activity_id,
                status="error",
                detail=str(e)[:2000],
                progress=100,
                snapshot_after=after,
            )
        finally:
            unregister_job_cancellation(activity_id)

    run_in_background(_run)
    return {
        "activity_id": activity_id,
        "status": "running",
        "message": f"{start_message} — open Activity for live logs.",
        "snapshot_before": before,
    }
