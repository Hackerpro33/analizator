"""RQ worker entrypoint for Insight Sphere analytics tasks."""
from __future__ import annotations

from redis import Redis
from rq import Connection, Worker

from .config import get_settings
from .tasks import process_extraction_job  # noqa: F401  # ensure task import side-effect


def main() -> None:
    settings = get_settings()
    if not settings.task_queue_enabled:
        raise SystemExit("TASK_QUEUE_ENABLED must be set when running the worker")
    connection = Redis.from_url(settings.redis_url, decode_responses=False)
    with Connection(connection):
        worker = Worker([settings.task_queue_name])
        worker.work()


if __name__ == "__main__":
    main()
