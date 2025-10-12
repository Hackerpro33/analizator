import json

import pytest
from fastapi.testclient import TestClient

from .. import chat_api
from .. import main


HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def isolate_chat_store(tmp_path, monkeypatch):
    store_dir = tmp_path / "chat_store"
    store_dir.mkdir()

    monkeypatch.setattr(chat_api, "CANDIDATE_DIRS", [store_dir])
    monkeypatch.setattr(chat_api, "STORE_DIR", store_dir)
    monkeypatch.setattr(chat_api, "CHAT_JSON", store_dir / "chat_sessions.json")

    yield

    if chat_api.CHAT_JSON.exists():
        chat_api.CHAT_JSON.unlink()


@pytest.fixture
def client():
    return TestClient(main.app)


def test_derive_focus_points_handles_multiple_signals():
    message = "Нужно проверить данные, гипотезы и тренды по сегментам за 2023 год с визуализацией"
    focus_points = chat_api._derive_focus_points(message)

    expected_fragments = [
        "структуру и качество данных",
        "гипотезу на проверяемые показатели",
        "временные ряды",
        "числовых показателей",
        "тип визуализации",
    ]

    for fragment in expected_fragments:
        assert any(fragment in point for point in focus_points)

    assert len(focus_points) <= chat_api.MAX_FOCUS_POINTS


def test_get_state_returns_default_greeting(client):
    response = client.get("/api/chat/state/alice", headers=HEADERS)
    assert response.status_code == 200

    payload = response.json()
    assert payload["user_id"] == "alice"
    assert payload["instructions"] == chat_api.DEFAULT_INSTRUCTIONS
    assert payload["messages"][0]["content"] == chat_api.DEFAULT_GREETING


def test_post_message_generates_reply_and_persists(client):
    response = client.post(
        "/api/chat/message",
        json={"user_id": "bob", "message": "Покажи данные 2022 и визуализацию"},
        headers=HEADERS,
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["user_id"] == "bob"
    assert len(payload["messages"]) == 3  # greeting, user, assistant

    assistant_message = payload["messages"][-1]
    assert assistant_message["role"] == "assistant"
    assert "•" in assistant_message["content"]
    assert "визуал" in assistant_message["content"].lower()
    assert "числов" in assistant_message["content"].lower()

    with chat_api.CHAT_JSON.open("r", encoding="utf-8") as fh:
        stored = json.load(fh)

    assert "bob" in stored
    assert len(stored["bob"]["messages"]) == 3


def test_update_instructions_and_reset(client):
    update_response = client.post(
        "/api/chat/instructions",
        json={"user_id": "carol", "instructions": "Быть кратким"},
        headers=HEADERS,
    )
    assert update_response.status_code == 200
    assert update_response.json()["instructions"] == "Быть кратким"

    message_response = client.post(
        "/api/chat/message",
        json={"user_id": "carol", "message": "Нужен отчет"},
        headers=HEADERS,
    )
    assert message_response.status_code == 200
    assert "Быть кратким" in message_response.json()["messages"][-1]["content"]

    reset_response = client.post(
        "/api/chat/reset",
        json={"user_id": "carol"},
        headers=HEADERS,
    )
    assert reset_response.status_code == 200

    reset_payload = reset_response.json()
    assert len(reset_payload["messages"]) == 1
    assert reset_payload["messages"][0]["content"] == chat_api.DEFAULT_GREETING
