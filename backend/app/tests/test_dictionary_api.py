import csv
import pytest
from fastapi.testclient import TestClient

from .. import main
from ..utils import dictionaries as dictionary_store
from ..utils import files as file_utils

HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def isolate_dictionary_store(tmp_path, monkeypatch):
    store_path = tmp_path / "dictionary_store.json"
    monkeypatch.setattr(dictionary_store, "DICTIONARY_JSON", store_path)
    if store_path.exists():
        store_path.unlink()
    yield
    if store_path.exists():
        store_path.unlink()


@pytest.fixture(autouse=True)
def isolate_uploads(tmp_path, monkeypatch):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setattr(file_utils, "UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(file_utils, "_FILE_REGISTRY", {})
    yield
    for item in upload_dir.iterdir():
        item.unlink()


@pytest.fixture
def client():
    return TestClient(main.app)


def test_create_dictionary_from_entries(client):
    payload = {
        "name": "Статусы",
        "description": "Расшифровка статусов обращений",
        "dataset_id": "dataset-1",
        "column": "status",
        "entries": [
            {"code": "A01", "label": "Активный"},
            {"code": "B02", "label": "Закрыт"},
        ],
    }

    response = client.post("/api/dictionary/create", json=payload, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    dictionary = data["dictionary"]
    assert dictionary["name"] == "Статусы"
    assert len(dictionary["entries"]) == 2

    list_response = client.get("/api/dictionary/list", headers=HEADERS)
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == 1
    assert listed[0]["dataset_id"] == "dataset-1"


def test_create_dictionary_from_uploaded_file(client, tmp_path):
    csv_path = tmp_path / "dict.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["code", "label", "description"])
        writer.writeheader()
        writer.writerow({"code": "P1", "label": "Первый", "description": "Первый статус"})
        writer.writerow({"code": "P2", "label": "Второй", "description": "Второй статус"})

    file_utils.register_uploaded_file("dict-file", csv_path)

    payload = {
        "name": "Позиции",
        "column": "position_code",
        "file_url": "dict-file",
        "code_column": "code",
        "label_column": "label",
        "context_columns": ["description"],
    }

    response = client.post("/api/dictionary/create", json=payload, headers=HEADERS)
    assert response.status_code == 200
    dictionary = response.json()["dictionary"]
    assert dictionary["source_file"] == "dict-file"
    assert len(dictionary["entries"]) == 2
    assert dictionary["entries"][0]["code"] in {"P1", "P2"}

    stored = dictionary_store.load_dictionaries()
    assert stored[0]["entries"][0]["description"]


def test_search_dictionaries_returns_grouped_matches(client):
    dictionary_store.save_dictionaries([])
    dictionary_store.save_dictionaries(
        [
            {
                "id": "dict-1",
                "name": "Статусы",
                "description": "Коды статусов",
                "dataset_id": "dataset-1",
                "column": "status_code",
                "entries": [
                    {
                        "code": "A01",
                        "label": "Активный",
                        "description": "Заявка в работе",
                        "keywords": ["активный", "работе"],
                    },
                    {
                        "code": "B02",
                        "label": "Закрыт",
                        "description": "Обращение завершено",
                    },
                ],
                "created_at": 1,
                "updated_at": 2,
            },
            {
                "id": "dict-2",
                "name": "Типы",
                "dataset_id": "dataset-2",
                "column": "type_code",
                "entries": [
                    {
                        "code": "T9",
                        "label": "Технический",
                        "description": "Техническая заявка",
                    }
                ],
                "created_at": 3,
                "updated_at": 3,
            },
        ]
    )

    response = client.get(
        "/api/dictionary/search",
        params={"q": "активный код", "dataset_id": "dataset-1"},
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["query"] == "активный код"
    assert payload["matches"] == 1
    assert payload["has_more"] is False
    assert len(payload["results"]) == 1
    result = payload["results"][0]
    assert result["dictionary"]["id"] == "dict-1"
    assert result["dictionary"]["name"] == "Статусы"
    assert result["entries"][0]["code"] == "A01"


def test_search_dictionaries_respects_limit(client):
    dictionary_store.save_dictionaries([])
    dictionary_store.save_dictionaries(
        [
            {
                "id": "dict-3",
                "name": "Категории",
                "entries": [
                    {"code": f"C{i}", "label": f"Категория {i}", "description": "Категории"}
                    for i in range(5)
                ],
                "created_at": 1,
                "updated_at": 1,
            }
        ]
    )

    response = client.get(
        "/api/dictionary/search",
        params={"q": "категория", "limit": 2},
        headers=HEADERS,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["matches"] == 2
    assert payload["has_more"] is True
    assert len(payload["results"]) == 1
    assert len(payload["results"][0]["entries"]) == 2
