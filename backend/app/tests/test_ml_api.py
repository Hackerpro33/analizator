import pytest
from fastapi.testclient import TestClient

from .. import main
from ..services import ml_engine

HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def isolate_model_registry(tmp_path, monkeypatch):
    model_dir = tmp_path / "models"
    artifact_dir = model_dir / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    registry_path = model_dir / "registry.json"

    monkeypatch.setattr(ml_engine, "MODEL_DATA_DIR", model_dir)
    monkeypatch.setattr(ml_engine, "ARTIFACT_DIR", artifact_dir)
    monkeypatch.setattr(ml_engine, "REGISTRY_PATH", registry_path)

    registry = ml_engine.ModelRegistry(registry_path=registry_path)
    ml_engine._registry = registry
    ml_engine.service.registry = registry
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def _find_demo_dataset(client: TestClient) -> str:
    response = client.get("/api/v1/ml/datasets", headers=HEADERS)
    assert response.status_code == 200
    payload = response.json()
    items = payload.get("items", [])
    assert items, "Dataset catalog is empty"
    for item in items:
        if "ai_demo_incidents" in (item.get("file_url") or ""):
            return item["id"]
    return items[0]["id"]


def test_catalog_and_dataset_profile(client):
    dataset_id = _find_demo_dataset(client)

    catalog_response = client.get("/api/v1/ml/catalog", headers=HEADERS)
    assert catalog_response.status_code == 200
    catalog = catalog_response.json()["algorithms"]
    assert "classification" in catalog

    profile_response = client.get(f"/api/v1/ml/datasets/{dataset_id}/profile", headers=HEADERS)
    assert profile_response.status_code == 200
    profile = profile_response.json()
    assert profile["dataset"]["id"] == dataset_id
    assert profile["columns"]
    assert profile["preview"]


def test_training_and_inference_flow(client):
    dataset_id = _find_demo_dataset(client)

    payload = {
        "name": "Автотестовая модель",
        "dataset_id": dataset_id,
        "target_column": "alert_level",
        "feature_columns": [
            "incident_reports",
            "community_alerts",
            "critical_infrastructure",
            "intelligence_score",
            "public_sentiment",
        ],
        "task_type": "classification",
        "algorithm": "random_forest",
        "hyperparameters": {"n_estimators": 120},
        "test_size": 0.2,
        "random_state": 21,
        "description": "Автообучение для проверки API",
    }

    train_response = client.post("/api/v1/ml/train", json=payload, headers=HEADERS)
    assert train_response.status_code == 200
    model = train_response.json()
    assert model["status"] == "ready"
    assert "metrics" in model
    model_id = model["id"]

    models_response = client.get("/api/v1/ml/models", headers=HEADERS)
    assert models_response.status_code == 200
    listed = models_response.json()["items"]
    assert any(entry["id"] == model_id for entry in listed)

    detail_response = client.get(f"/api/v1/ml/models/{model_id}", headers=HEADERS)
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["target_column"] == "alert_level"

    predict_payload = {"dataset_id": dataset_id, "limit": 20}
    predict_response = client.post(
        f"/api/v1/ml/models/{model_id}/predict",
        json=predict_payload,
        headers=HEADERS,
    )
    assert predict_response.status_code == 200
    predictions = predict_response.json()
    assert predictions["count"] > 0
    assert predictions["summary"]

    insights_response = client.get("/api/v1/ml/insights", headers=HEADERS)
    assert insights_response.status_code == 200
    insights = insights_response.json()
    assert insights["highlight"]["id"] == model_id
