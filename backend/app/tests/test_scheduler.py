from datetime import datetime, timezone

import pytest

from app.services.scheduler import InvalidSchedule, ScheduleConfig, TaskScheduler


def _utc(year: int, month: int, day: int, hour: int = 0, minute: int = 0, second: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)


def test_scheduler_due_jobs_and_retries(tmp_path):
    scheduler = TaskScheduler(tmp_path / "schedules.json")
    config = ScheduleConfig(
        name="refresh crime dataset",
        task="refresh_dataset",
        cron="*/5 * * * *",
        sla_seconds=60,
        max_retries=1,
        payload={"dataset_id": "crime"},
    )

    schedule = scheduler.register_job(config, now=_utc(2024, 1, 1, 12, 0, 0))
    assert schedule["status"] == "pending"
    assert schedule["next_run_due"].startswith("2024-01-01T12:05:00")

    due = scheduler.get_due_jobs(reference_time=_utc(2024, 1, 1, 12, 5, 0))
    assert [item["id"] for item in due] == [schedule["id"]]

    scheduler.mark_running(schedule["id"], started_at=_utc(2024, 1, 1, 12, 5, 0))
    scheduler.mark_failed(schedule["id"], "network error", failed_at=_utc(2024, 1, 1, 12, 5, 10))
    after_failure = scheduler.get_schedule(schedule["id"])
    assert after_failure["retry_count"] == 1
    assert after_failure["status"] == "pending"
    assert after_failure["last_error"] == "network error"

    scheduler.mark_running(schedule["id"], started_at=_utc(2024, 1, 1, 12, 5, 20))
    scheduler.enforce_sla(reference_time=_utc(2024, 1, 1, 12, 6, 30))
    sla_schedule = scheduler.get_schedule(schedule["id"])
    assert sla_schedule["status"] == "failed"
    assert sla_schedule["retry_count"] == 2
    assert sla_schedule["next_run_due"] is None
    assert sla_schedule["last_error"] == "SLA exceeded"


def test_scheduler_validates_cron_and_completion(tmp_path):
    scheduler = TaskScheduler(tmp_path / "schedules.json")
    bad_config = ScheduleConfig(
        name="invalid",
        task="refresh_dataset",
        cron="not-a-cron",
        payload={"dataset_id": "x"},
    )

    with pytest.raises(InvalidSchedule):
        scheduler.register_job(bad_config)

    good = ScheduleConfig(
        name="valid",
        task="refresh_dataset",
        cron="0 * * * *",
        sla_seconds=120,
        max_retries=0,
        payload={"dataset_id": "y"},
    )
    schedule = scheduler.register_job(good, now=_utc(2024, 1, 1, 0, 0, 0))
    scheduler.mark_running(schedule["id"], started_at=_utc(2024, 1, 1, 0, 0, 0))
    scheduler.mark_completed(schedule["id"], completed_at=_utc(2024, 1, 1, 0, 15, 0))
    completed = scheduler.get_schedule(schedule["id"])
    assert completed["status"] == "idle"
    assert completed["retry_count"] == 0
    assert completed["last_error"] is None
    assert completed["next_run_due"].startswith("2024-01-01T01:00:00")
