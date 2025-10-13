"""Redis/RQ backed background tasks for long-running analytics."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import HTTPException
from redis import Redis
from redis.exceptions import RedisError
from rq import Queue
from rq.exceptions import NoSuchJobError
from rq.job import Job

from .config import get_settings
from .services.extraction import build_extraction
from .utils.files import load_dataframe_from_identifier


class TaskQueueUnavailable(RuntimeError):
    """Raised when the task queue cannot be reached or is disabled."""


def _ensure_queue() -> Queue:
    settings = get_settings()
    if not settings.task_queue_enabled:
        raise TaskQueueUnavailable("Task queue is disabled. Set TASK_QUEUE_ENABLED=1 to activate it.")

    try:
        connection = Redis.from_url(settings.redis_url, decode_responses=False)
    except RedisError as exc:  # pragma: no cover - connection construction issues
        raise TaskQueueUnavailable(f"Failed to create Redis connection: {exc}") from exc

    try:
        return Queue(
            settings.task_queue_name,
            connection=connection,
            default_timeout=settings.task_default_timeout,
        )
    except RedisError as exc:  # pragma: no cover - queue initialisation errors
        raise TaskQueueUnavailable(f"Failed to initialize task queue: {exc}") from exc


def process_extraction_job(file_url: str) -> Dict[str, Any]:
    """Worker-side execution for dataset extraction."""

    df = load_dataframe_from_identifier(file_url)
    return build_extraction(df)


def enqueue_extraction(file_url: str) -> str:
    """Schedule an asynchronous extraction job and return its task identifier."""

    queue = _ensure_queue()
    try:
        job = queue.enqueue(process_extraction_job, file_url)
    except RedisError as exc:  # pragma: no cover - network/infra failure
        raise TaskQueueUnavailable(f"Failed to enqueue task: {exc}") from exc
    return job.id


def serialize_job(job: Job) -> Dict[str, Any]:
    """Convert an RQ job into an API friendly payload."""

    status = job.get_status(refresh=False)
    payload: Dict[str, Any] = {
        "task_id": job.id,
        "status": status,
    }
    if status == "finished" and job.result is not None:
        payload["result"] = job.result
    if status == "failed":
        payload["error"] = job.exc_info
    return payload


def get_task_status(task_id: str) -> Dict[str, Any]:
    """Fetch task status and optional results."""

    queue = _ensure_queue()
    try:
        job = Job.fetch(task_id, connection=queue.connection)
    except NoSuchJobError as exc:
        raise HTTPException(status_code=404, detail="Task not found") from exc
    except RedisError as exc:  # pragma: no cover - network/infra failure
        raise TaskQueueUnavailable(f"Failed to communicate with task queue: {exc}") from exc

    return serialize_job(job)


__all__ = [
    "enqueue_extraction",
    "get_task_status",
    "process_extraction_job",
    "serialize_job",
    "TaskQueueUnavailable",
]
