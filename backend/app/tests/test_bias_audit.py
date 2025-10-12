from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.audit_api import AUDIT_HISTORY_PATH, AUDIT_SCHEDULES_PATH
from app.main import app

DEFAULT_HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def cleanup_audit_files():
    for path in (AUDIT_HISTORY_PATH, AUDIT_SCHEDULES_PATH):
        if path.exists():
            path.unlink()
    yield
    for path in (AUDIT_HISTORY_PATH, AUDIT_SCHEDULES_PATH):
        if path.exists():
            path.unlink()


def _write_sample_dataset(tmp_path: Path) -> Path:
    csv_content = """sensitive,prediction,actual\nA,1,1\nA,0,0\nB,0,1\nB,0,0\nB,1,1\n"""
    csv_path = tmp_path / "bias_sample.csv"
    csv_path.write_text(csv_content, encoding="utf-8")
    return csv_path


def test_bias_audit_run_and_schedule(tmp_path):
    csv_path = _write_sample_dataset(tmp_path)
    client = TestClient(app)

    schedule_payload = {
        "name": "Monthly fairness review",
        "file_url": str(csv_path),
        "sensitive_attribute": "sensitive",
        "prediction_column": "prediction",
        "actual_column": "actual",
        "positive_label": 1,
        "privileged_values": ["A"],
        "frequency": "monthly",
        "notes": "Automated regression check",
    }

    schedule_response = client.post("/api/audit/bias/schedules", json=schedule_payload, headers=DEFAULT_HEADERS)
    assert schedule_response.status_code == 200
    schedule_data = schedule_response.json()["schedule"]
    assert schedule_data["next_run_due"] is not None

    audit_payload = {
        "file_url": str(csv_path),
        "sensitive_attribute": "sensitive",
        "prediction_column": "prediction",
        "actual_column": "actual",
        "positive_label": 1,
        "privileged_values": ["A"],
        "save_result": True,
        "schedule_id": schedule_data["id"],
        "schedule_frequency": "monthly",
    }

    audit_response = client.post("/api/audit/bias/run", json=audit_payload, headers=DEFAULT_HEADERS)
    assert audit_response.status_code == 200
    audit_result = audit_response.json()["audit"]
    assert audit_result["flagged"] is True
    assert audit_result["schedule_id"] == schedule_data["id"]
    assert audit_result["group_metrics"]["privileged"]["count"] == 2
    assert audit_result["group_metrics"]["unprivileged"]["count"] == 3

    metrics = {metric["name"]: metric for metric in audit_result["metrics"]}
    assert metrics["statistical_parity_difference"]["passed"] is False
    assert metrics["disparate_impact"]["passed"] is False
    assert metrics["equal_opportunity_difference"]["passed"] is False
    assert metrics["average_odds_difference"]["passed"] is False
    assert metrics["false_negative_rate_difference"]["passed"] is False
    assert metrics["predictive_parity_difference"]["passed"] is True

    thresholds = audit_result["thresholds"]
    assert thresholds["difference"]["statistical_parity_difference"] == pytest.approx(0.1)
    assert thresholds["ratio"]["disparate_impact"]["min"] == pytest.approx(0.8)
    assert thresholds["ratio"]["disparate_impact"]["max"] == pytest.approx(1.25)

    history_response = client.get("/api/audit/bias/history", headers=DEFAULT_HEADERS)
    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["count"] == 1
    assert history_payload["items"][0]["flagged"] is True

    schedules_response = client.get("/api/audit/bias/schedules", headers=DEFAULT_HEADERS)
    assert schedules_response.status_code == 200
    schedules_payload = schedules_response.json()
    assert schedules_payload["count"] == 1
    updated_schedule = schedules_payload["items"][0]
    assert updated_schedule["last_run_at"] is not None

    delete_response = client.delete(f"/api/audit/bias/schedules/{schedule_data['id']}", headers=DEFAULT_HEADERS)
    assert delete_response.status_code == 200
    assert delete_response.json()["status"] == "deleted"

    schedules_empty = client.get("/api/audit/bias/schedules", headers=DEFAULT_HEADERS).json()
    assert schedules_empty["count"] == 0

    history_response_after = client.get("/api/audit/bias/history", headers=DEFAULT_HEADERS).json()
    assert history_response_after["count"] == 1


def test_bias_audit_threshold_overrides(tmp_path):
    csv_path = _write_sample_dataset(tmp_path)
    client = TestClient(app)

    audit_payload = {
        "file_url": str(csv_path),
        "sensitive_attribute": "sensitive",
        "prediction_column": "prediction",
        "actual_column": "actual",
        "positive_label": 1,
        "privileged_values": ["A"],
        "save_result": False,
        "threshold_overrides": {
            "difference": {
                "statistical_parity_difference": 0.2,
                "equal_opportunity_difference": 0.6,
                "average_odds_difference": 0.3,
                "false_negative_rate_difference": 0.6,
            },
            "ratio": {"disparate_impact": {"min": 0.6, "max": 1.4}},
        },
    }

    audit_response = client.post("/api/audit/bias/run", json=audit_payload, headers=DEFAULT_HEADERS)
    assert audit_response.status_code == 200
    audit_result = audit_response.json()["audit"]

    assert audit_result["flagged"] is False
    overrides_thresholds = audit_result["thresholds"]["difference"]
    assert overrides_thresholds["statistical_parity_difference"] == pytest.approx(0.2)
    assert overrides_thresholds["false_negative_rate_difference"] == pytest.approx(0.6)
    ratio_thresholds = audit_result["thresholds"]["ratio"]["disparate_impact"]
    assert ratio_thresholds["min"] == pytest.approx(0.6)
    assert ratio_thresholds["max"] == pytest.approx(1.4)

    metrics = {metric["name"]: metric for metric in audit_result["metrics"]}
    assert metrics["statistical_parity_difference"]["passed"] is True
    assert metrics["disparate_impact"]["passed"] is True
    assert metrics["false_negative_rate_difference"]["passed"] is True
    assert metrics["average_odds_difference"]["threshold"] == "|difference| ≤ 0.300"

    assert not AUDIT_HISTORY_PATH.exists()
