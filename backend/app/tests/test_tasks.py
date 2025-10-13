import pandas as pd
import pytest
from fastapi.testclient import TestClient

from .. import main
from ..tasks import process_extraction_job
from ..utils.files import register_uploaded_file, get_file_registry


@pytest.fixture(autouse=True)
def clear_registry():
    registry = get_file_registry()
    registry.clear()
    yield
    registry.clear()


@pytest.fixture
def client():
    return TestClient(main.app)


def test_process_extraction_job_generates_preview(tmp_path):
    csv_path = tmp_path / "incidents.csv"
    pd.DataFrame({"crime": [1, 2, 3]}).to_csv(csv_path, index=False)
    register_uploaded_file("job-1", csv_path)

    payload = process_extraction_job("job-1")

    assert payload["row_count"] == 3
    assert payload["columns"][0]["name"] == "crime"
    assert payload["insights"]  # domain insights are populated for crime column


def test_extract_async_requires_queue_enabled(client):
    response = client.post(
        "/api/extract/async",
        json={"file_url": "job-unknown"},
        headers={"host": "localhost"},
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Task queue is disabled"


def test_task_status_requires_queue_enabled(client):
    response = client.get("/api/tasks/rq:job:123", headers={"host": "localhost"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Task queue is disabled"
