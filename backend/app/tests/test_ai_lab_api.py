from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_series_endpoint_bootstraps_model(tmp_path, monkeypatch):
    response = client.get("/api/v1/ai-lab/series", params={"target": "ai-lab-monthly"})
    assert response.status_code == 200
    payload = response.json()
    assert "actual" in payload and payload["actual"]
    assert payload["meta"]["dataset_id"] == "ai-lab-monthly"


def test_forecast_and_artifacts(tmp_path, monkeypatch):
    response = client.post(
        "/api/v1/ai-lab/forecast",
        json={
            "dataset_id": "ai-lab-monthly",
            "date_column": "month",
            "value_column": "target_value",
            "sef_columns": ["sef_budget"],
            "horizon": 6,
            "methods": ["sarima", "ets"],
            "ensemble_mode": "weighted",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["forecast"]
    assert payload["best_model"]["method"]
    artifacts = Path(payload["artifact_dir"])
    assert (artifacts / "forecast.csv").exists()
    assert (artifacts / "model_comparison.csv").exists()
    assert (artifacts / "correlations_table.csv").exists()


def test_data_audit_endpoint():
    response = client.post(
        "/api/v1/audit/data/run",
        json={"dataset_id": "ai-lab-monthly", "date_column": "month", "target_column": "target_value"},
    )
    assert response.status_code == 200
    report = response.json()["report"]
    assert report["dataset_id"] == "ai-lab-monthly"
    assert report["status"]
