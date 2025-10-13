from datetime import datetime, timedelta, timezone

from app import datasets_api
from app.services.scheduler import ScheduleConfig, TaskScheduler


def _utc_now_minus(seconds: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(seconds=seconds)


def _build_scheduler(tmp_path) -> TaskScheduler:
    return TaskScheduler(tmp_path / "refresh_schedules.json")


def _sample_config() -> ScheduleConfig:
    return ScheduleConfig(
        name="refresh:test",
        task="refresh_dataset",
        cron="*/5 * * * *",
        sla_seconds=60,
        max_retries=0,
        payload={"dataset_id": "dataset-1"},
    )


def test_register_refresh_failure_triggers_webhook(monkeypatch, tmp_path):
    scheduler = _build_scheduler(tmp_path)
    config = _sample_config()
    schedule = scheduler.register_job(config)

    monkeypatch.setattr(datasets_api, "_refresh_scheduler", scheduler)

    captured = {}

    def fake_notify(schedule_payload, *, reason, **_kwargs):
        captured["schedule"] = schedule_payload
        captured["reason"] = reason
        return {"status": "sent"}

    monkeypatch.setattr(datasets_api, "notify_dataset_refresh_failure", fake_notify)

    report = datasets_api.RefreshFailureReport(error="network timeout")
    response = datasets_api.register_refresh_failure(schedule["id"], report)

    assert captured["reason"] == "network timeout"
    assert captured["schedule"]["id"] == schedule["id"]
    assert response["schedule"]["retry_count"] == 1


def test_enforce_refresh_sla_notifies(monkeypatch, tmp_path):
    scheduler = _build_scheduler(tmp_path)
    config = _sample_config()
    schedule = scheduler.register_job(config)
    scheduler.mark_running(schedule["id"], started_at=_utc_now_minus(120))

    monkeypatch.setattr(datasets_api, "_refresh_scheduler", scheduler)

    events = []

    def fake_notify(schedule_payload, *, reason, **_kwargs):
        events.append((schedule_payload["id"], reason, schedule_payload["status"]))
        return {"status": "sent"}

    monkeypatch.setattr(datasets_api, "notify_dataset_refresh_failure", fake_notify)

    result = datasets_api.enforce_refresh_sla()

    assert result["count"] == 1
    assert events[0][0] == schedule["id"]
    assert events[0][1] == "SLA exceeded"
    assert events[0][2] == "failed"
