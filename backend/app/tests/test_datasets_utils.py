import json
from datetime import datetime, timezone

import pytest

from .. import datasets_api


@pytest.fixture(autouse=True)
def isolate_store(tmp_path, monkeypatch):
    store = tmp_path / 'datasets'
    store.mkdir()
    monkeypatch.setattr(datasets_api, 'CANDIDATE_DIRS', [store])
    monkeypatch.setattr(datasets_api, 'STORE_DIR', store)
    monkeypatch.setattr(datasets_api, 'DATASETS_JSON', store / 'datasets.json')
    yield


def test_atomic_write_json_creates_file(tmp_path):
    target = tmp_path / 'data.json'
    payload = {'name': 'dataset'}

    datasets_api._atomic_write_json(target, payload)

    assert target.exists()
    assert json.loads(target.read_text(encoding='utf-8')) == payload


def test_ensure_dates_populates_missing_fields(monkeypatch):
    now = datetime(2024, 6, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(datasets_api.time, 'time', lambda: now.timestamp())
    payload = {'id': '42', 'name': 'Demo'}

    enriched = datasets_api._ensure_dates(payload.copy())

    assert 'created_at' in enriched
    assert enriched['created_date'].startswith('2024-06-01')
    assert enriched.get('created_date')


def test_list_datasets_sorting(tmp_path):
    first = {
        'id': 'a',
        'name': 'First',
        'created_at': 100,
        'created_date': '1970-01-01T00:01:40Z',
    }
    second = {
        'id': 'b',
        'name': 'Second',
        'created_at': 200,
        'created_date': '1970-01-01T00:03:20Z',
    }
    datasets_api._save_all([first, second])

    items = datasets_api.list_datasets(order_by='created_at')
    assert [item['id'] for item in items] == ['a', 'b']

    items_desc = datasets_api.list_datasets(order_by='-created_at')
    assert [item['id'] for item in items_desc] == ['b', 'a']


def test_get_dataset_not_found():
    with pytest.raises(datasets_api.HTTPException) as exc:
        datasets_api.get_dataset('missing')
    assert exc.value.status_code == 404


def test_save_and_retrieve_roundtrip(tmp_path):
    dataset = {
        'id': 'demo',
        'name': 'Demo dataset',
        'created_at': 123,
        'created_date': '1970-01-01T00:02:03Z',
    }
    datasets_api._save_all([dataset])

    retrieved = datasets_api.get_dataset('demo')
    assert retrieved['name'] == dataset['name']
    assert retrieved['created_date'].endswith('Z')
