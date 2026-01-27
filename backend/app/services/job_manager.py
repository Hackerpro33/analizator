"""Simple in-process background job manager used for AI Lab training tasks."""
from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable, Dict, Optional


class BackgroundJobManager:
    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._jobs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def _log(self, job_id: str, message: str) -> None:
        with self._lock:
            entry = self._jobs.get(job_id)
            if not entry:
                return
            entry.setdefault("logs", []).append(
                {"timestamp": time.time(), "message": message}
            )

    def submit(self, label: str, func: Callable[..., Any], *, kwargs: Optional[Dict[str, Any]] = None) -> str:
        job_id = str(uuid.uuid4())
        payload = {
            "id": job_id,
            "label": label,
            "status": "queued",
            "created_at": time.time(),
            "logs": [],
            "result": None,
            "error": None,
        }
        with self._lock:
            self._jobs[job_id] = payload

        def runner():
            with self._lock:
                payload["status"] = "running"
                payload["started_at"] = time.time()
            try:
                result = func(logger=lambda msg: self._log(job_id, msg), **(kwargs or {}))
                with self._lock:
                    payload["status"] = "completed"
                    payload["result"] = result
                    payload["completed_at"] = time.time()
            except Exception as exc:  # pragma: no cover - defensive logging
                self._log(job_id, f"Ошибка: {exc}")
                with self._lock:
                    payload["status"] = "failed"
                    payload["error"] = str(exc)
                    payload["completed_at"] = time.time()

        self._executor.submit(runner)
        return job_id

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            return dict(job)

    def list_jobs(self) -> Dict[str, Any]:
        with self._lock:
            return {"items": [dict(job) for job in self._jobs.values()]}


manager = BackgroundJobManager()


__all__ = ["manager", "BackgroundJobManager"]
