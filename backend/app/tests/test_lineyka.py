import csv
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from .. import datasets_api, lineyka_api, main
from ..services import dataset_store, lineyka_store, lineyka_engine

HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def isolate_dataset_json(tmp_path, monkeypatch):
    store_dir = tmp_path / "datasets"
    store_dir.mkdir()
    monkeypatch.setattr(datasets_api, "CANDIDATE_DIRS", [store_dir])
    monkeypatch.setattr(datasets_api, "STORE_DIR", store_dir)
    monkeypatch.setattr(datasets_api, "DATASETS_JSON", store_dir / "datasets.json")
    monkeypatch.setattr(dataset_store, "DATASETS_PATH", store_dir / "datasets.json")
    dataset_store.DATASETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    yield


@pytest.fixture(autouse=True)
def isolate_lineyka(tmp_path, monkeypatch):
    root = tmp_path / "lineyka"
    monkeypatch.setattr(lineyka_store, "LINEYKA_ROOT", root)
    monkeypatch.setattr(lineyka_store, "VERSIONS_DIR", root / "versions")
    monkeypatch.setattr(lineyka_store, "META_PATH", root / "metadata.json")
    publish_dir = tmp_path / "published"
    publish_dir.mkdir()
    monkeypatch.setattr(lineyka_api, "PUBLISHED_DATASETS_DIR", publish_dir)
    new_store = lineyka_store.LineykaStore()
    monkeypatch.setattr(lineyka_store, "store", new_store)
    monkeypatch.setattr(lineyka_engine, "store", new_store)
    monkeypatch.setattr(lineyka_api, "store", new_store)
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def _write_csv(path: Path, rows):
    headers = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def _infer_columns(rows):
    columns = []
    sample = rows[0]
    for name, value in sample.items():
        col_type = "string"
        if isinstance(value, (int, float)):
            col_type = "number"
        if "date" in name.lower() or "month" in name.lower():
            col_type = "date"
        columns.append({"name": name, "type": col_type})
    return columns


def _create_dataset(client, tmp_path, name, rows):
    file_path = tmp_path / f"{name}.csv"
    _write_csv(file_path, rows)
    response = client.post(
        "/api/v1/dataset/create",
        json={
            "name": name,
            "description": name,
            "columns": _infer_columns(rows),
            "row_count": len(rows),
            "file_url": str(file_path),
            "sample_data": rows[:2],
        },
        headers=HEADERS,
    )
    payload = response.json()
    return payload["id"]


def _get_latest_version(client, dataset_id):
    response = client.get(f"/api/v1/lineyka/datasets/{dataset_id}/versions", headers=HEADERS)
    payload = response.json()
    assert payload["items"], "expected at least one version"
    return payload["items"][-1]["version_id"]


def test_list_datasets_bootstraps_versions(client, tmp_path):
    dataset_id = _create_dataset(
        client,
        tmp_path,
        "lineyka-bootstrap",
        [
            {"region": "North", "value": 5, "month": "2024-01-01"},
        ],
    )
    response = client.get("/api/v1/lineyka/datasets", headers=HEADERS)
    payload = response.json()
    ids = {item["dataset_id"] for item in payload["items"]}
    assert dataset_id in ids


def test_keep_filtered_creates_new_version(client, tmp_path):
    dataset_id = _create_dataset(
        client,
        tmp_path,
        "finance",
        [
            {"region": "North", "value": 10, "month": "2024-01-01"},
            {"region": "South", "value": 42, "month": "2024-02-01"},
            {"region": "West", "value": 55, "month": "2024-03-01"},
        ],
    )
    base_version = _get_latest_version(client, dataset_id)
    filter_payload = {"column": "value", "kind": "number", "operator": "gt", "value": 20}
    query = client.post(
        f"/api/v1/lineyka/datasets/{dataset_id}/versions/{base_version}/query",
        json={"limit": 50, "filters": [filter_payload]},
        headers=HEADERS,
    ).json()
    assert query["filtered_rows"] == 2

    transform = client.post(
        f"/api/v1/lineyka/datasets/{dataset_id}/versions/{base_version}/transform",
        json={"operations": [{"type": "keep_filtered", "filters": [filter_payload]}]},
        headers=HEADERS,
    )
    assert transform.status_code == 200
    latest = _get_latest_version(client, dataset_id)
    query_new = client.post(
        f"/api/v1/lineyka/datasets/{dataset_id}/versions/{latest}/query",
        json={"limit": 50},
        headers=HEADERS,
    ).json()
    assert query_new["total_rows"] == 2
    assert query_new["columns"]


def test_delete_column_and_append_rows(client, tmp_path):
    dataset_main = _create_dataset(
        client,
        tmp_path,
        "main",
        [
            {"region": "North", "value": 10, "obsolete": "old"},
            {"region": "South", "value": 42, "obsolete": "legacy"},
        ],
    )
    dataset_append = _create_dataset(
        client,
        tmp_path,
        "append",
        [
            {"region": "East", "value": 5, "obsolete": "extra"},
        ],
    )
    base_version = _get_latest_version(client, dataset_main)
    delete_response = client.post(
        f"/api/v1/lineyka/datasets/{dataset_main}/versions/{base_version}/transform",
        json={"operations": [{"type": "delete_columns", "columns": ["obsolete"]}]},
        headers=HEADERS,
    )
    assert delete_response.status_code == 200
    latest = _get_latest_version(client, dataset_main)
    append_response = client.post(
        f"/api/v1/lineyka/datasets/{dataset_main}/versions/{latest}/transform",
        json={
            "operations": [
                {
                    "type": "append_rows",
                    "source_dataset_id": dataset_append,
                    "align_by_names": True,
                    "column_mapping": {},
                }
            ]
        },
        headers=HEADERS,
    )
    assert append_response.status_code == 200
    final_version = _get_latest_version(client, dataset_main)
    query = client.post(
        f"/api/v1/lineyka/datasets/{dataset_main}/versions/{final_version}/query",
        json={"limit": 50},
        headers=HEADERS,
    ).json()
    assert query["total_rows"] == 3
    column_names = [column["name"] for column in query["columns"] if not column["internal"]]  # skip service id
    assert "obsolete" not in column_names


def test_join_columns_reports_matches(client, tmp_path):
    dataset_left = _create_dataset(
        client,
        tmp_path,
        "left",
        [
            {"region_id": 1, "value": 10},
            {"region_id": 2, "value": 15},
        ],
    )
    dataset_right = _create_dataset(
        client,
        tmp_path,
        "right",
        [
            {"region_id": 1, "factor": 0.5},
            {"region_id": 3, "factor": 1.2},
        ],
    )
    base_version = _get_latest_version(client, dataset_left)
    join_response = client.post(
        f"/api/v1/lineyka/datasets/{dataset_left}/versions/{base_version}/transform",
        json={
            "operations": [
                {
                    "type": "join_columns",
                    "source_dataset_id": dataset_right,
                    "left_on": "region_id",
                    "right_on": "region_id",
                    "columns": ["factor"],
                    "suffix": "_src",
                }
            ]
        },
        headers=HEADERS,
    )
    assert join_response.status_code == 200
    version_list = client.get(f"/api/v1/lineyka/datasets/{dataset_left}/versions", headers=HEADERS).json()["items"]
    latest = version_list[-1]
    assert latest["operation"]["summary"]["rows_matched"] == 1
    query = client.post(
        f"/api/v1/lineyka/datasets/{dataset_left}/versions/{latest['version_id']}/query",
        json={"limit": 10},
        headers=HEADERS,
    ).json()
    column_names = [column["name"] for column in query["columns"]]
    assert "factor_src" in column_names
    fetched = query["rows"][0]
    assert fetched["factor_src"] in (0.5, "0.5")


def test_update_cells_changes_value(client, tmp_path):
    dataset_id = _create_dataset(
        client,
        tmp_path,
        "editable",
        [
            {"region": "North", "value": 10},
            {"region": "South", "value": 15},
        ],
    )
    base_version = _get_latest_version(client, dataset_id)
    query = client.post(
        f"/api/v1/lineyka/datasets/{dataset_id}/versions/{base_version}/query",
        json={"limit": 10},
        headers=HEADERS,
    ).json()
    row_id = query["rows"][0]["__lineyka_row_id"]
    update_response = client.post(
        f"/api/v1/lineyka/datasets/{dataset_id}/versions/{base_version}/transform",
        json={
            "operations": [
                {"type": "update_cells", "updates": [{"row_id": row_id, "column": "value", "value": 99}]}
            ]
        },
        headers=HEADERS,
    )
    assert update_response.status_code == 200
    latest = _get_latest_version(client, dataset_id)
    result = client.post(
        f"/api/v1/lineyka/datasets/{dataset_id}/versions/{latest}/query",
        json={"limit": 10},
        headers=HEADERS,
    ).json()
    assert any(row["value"] in (99, "99") for row in result["rows"])


def test_publish_version_creates_dataset(client, tmp_path):
    dataset_id = _create_dataset(
        client,
        tmp_path,
        "publish-source",
        [
            {"region": "North", "value": 10},
            {"region": "South", "value": 12},
        ],
    )
    version_id = _get_latest_version(client, dataset_id)
    response = client.post(
        f"/api/v1/lineyka/datasets/{dataset_id}/versions/{version_id}/publish",
        json={"mode": "new", "name": "Линейка — копия"},
        headers=HEADERS,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "created"
    new_dataset_id = payload["dataset_id"]
    created = client.get(f"/api/v1/dataset/{new_dataset_id}", headers=HEADERS).json()
    assert created["name"] == "Линейка — копия"
