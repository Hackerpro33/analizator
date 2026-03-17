from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.services import messenger_store, object_storage, user_store

from .test_auth_api import login_user, register_user, verify_registered_user


def _configure_env(tmp_path, monkeypatch) -> None:
    user_path = tmp_path / "users.json"
    user_path.write_text("[]", encoding="utf-8")
    monkeypatch.setenv("USER_STORE_PATH", str(user_path))
    monkeypatch.setenv("MESSENGER_STORE_PATH", str(tmp_path / "messenger.json"))
    monkeypatch.setenv("OBJECT_STORAGE_LOCAL_ROOT", str(tmp_path / "uploads"))
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-secret")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("INITIAL_ADMIN_EMAIL", "")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_USER", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_USE_STARTTLS", "false")
    get_settings.cache_clear()
    user_store._user_store_for_path.cache_clear()
    messenger_store._messenger_store_for_path.cache_clear()
    object_storage.get_object_storage.cache_clear()


def _build_client(tmp_path, monkeypatch) -> TestClient:
    _configure_env(tmp_path, monkeypatch)
    return TestClient(app)


def _prepare_admin_and_security(tmp_path, monkeypatch):
    admin_client = _build_client(tmp_path, monkeypatch)
    security_client = _build_client(tmp_path, monkeypatch)

    admin_payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    security_payload = {"email": "security@example.com", "password": "StrongPass!1", "full_name": "Security One"}

    register_user(admin_client, admin_payload)
    verify_registered_user(admin_client, tmp_path, admin_payload["email"])
    login = login_user(admin_client, admin_payload["email"], admin_payload["password"])
    assert login.status_code == 200

    register_user(admin_client, security_payload)
    verify_registered_user(admin_client, tmp_path, security_payload["email"])
    login_user(admin_client, admin_payload["email"], admin_payload["password"])
    users = admin_client.get("/api/v1/admin/users").json()["items"]
    target = next(item for item in users if item["email"] == security_payload["email"])
    promote = admin_client.patch(f"/api/v1/admin/users/{target['id']}", json={"role": "security"})
    assert promote.status_code == 200

    security_login = login_user(security_client, security_payload["email"], security_payload["password"])
    assert security_login.status_code == 200

    return admin_client, security_client, admin_payload, security_payload, target["id"]


def test_messenger_bootstrap_and_space_creation(tmp_path, monkeypatch):
    admin_client, _security_client, _admin_payload, _security_payload, security_user_id = _prepare_admin_and_security(
        tmp_path, monkeypatch
    )

    device = admin_client.post(
        "/api/v1/messenger/devices",
        json={
            "label": "Admin browser",
            "device_kind": "web",
            "identity_key": {"kty": "OKP", "crv": "X25519", "x": "admin-key"},
            "prekey_bundle": {"signed_prekey": {"key_id": 1, "public_key": "signed-admin"}},
        },
    )
    assert device.status_code == 201

    created = admin_client.post(
        "/api/v1/messenger/spaces",
        json={
            "type": "group",
            "title": "Оперативный штаб",
            "description": "Защищенный контур координации",
            "member_ids": [security_user_id],
        },
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["title"] == "Оперативный штаб"
    assert len(payload["members"]) == 2

    bootstrap = admin_client.get("/api/v1/messenger/bootstrap")
    assert bootstrap.status_code == 200
    data = bootstrap.json()
    assert len(data["devices"]) == 1
    assert any(space["id"] == payload["id"] for space in data["spaces"])


def test_messenger_attachment_message_and_download(tmp_path, monkeypatch):
    admin_client, _security_client, _admin_payload, _security_payload, security_user_id = _prepare_admin_and_security(
        tmp_path, monkeypatch
    )

    device_id = admin_client.post(
        "/api/v1/messenger/devices",
        json={
            "label": "Admin browser",
            "device_kind": "web",
            "identity_key": {"kty": "OKP", "crv": "X25519", "x": "admin-key"},
            "prekey_bundle": {"signed_prekey": {"key_id": 1, "public_key": "signed-admin"}},
        },
    ).json()["id"]

    space_id = admin_client.post(
        "/api/v1/messenger/spaces",
        json={"type": "direct", "title": "Direct", "member_ids": [security_user_id]},
    ).json()["id"]

    upload = admin_client.post(
        "/api/v1/messenger/attachments",
        files={"file": ("evidence.bin", b"encrypted-blob", "application/octet-stream")},
        data={
            "media_kind": "document",
            "encrypted_metadata": '{"algorithm":"AES-GCM","iv":"abc"}',
        },
    )
    assert upload.status_code == 201
    attachment = upload.json()

    created_message = admin_client.post(
        f"/api/v1/messenger/spaces/{space_id}/messages",
        json={
            "sender_device_id": device_id,
            "message_type": "mixed",
            "encrypted_payload": {"algorithm": "AES-GCM", "ciphertext": "payload"},
            "envelopes": [{"device_id": device_id, "ciphertext": "sealed-key"}],
            "attachment_ids": [attachment["id"]],
        },
    )
    assert created_message.status_code == 201

    listed = admin_client.get(f"/api/v1/messenger/spaces/{space_id}/messages")
    assert listed.status_code == 200
    message = listed.json()["items"][0]
    assert message["attachments"][0]["id"] == attachment["id"]

    download = admin_client.get(f"/api/v1/messenger/attachments/{attachment['id']}/download")
    assert download.status_code == 200
    assert download.content == b"encrypted-blob"


def test_messenger_websocket_receives_new_messages(tmp_path, monkeypatch):
    admin_client, security_client, _admin_payload, _security_payload, security_user_id = _prepare_admin_and_security(
        tmp_path, monkeypatch
    )

    admin_device_id = admin_client.post(
        "/api/v1/messenger/devices",
        json={
            "label": "Admin browser",
            "device_kind": "web",
            "identity_key": {"kty": "OKP", "crv": "X25519", "x": "admin-key"},
            "prekey_bundle": {"signed_prekey": {"key_id": 1, "public_key": "signed-admin"}},
        },
    ).json()["id"]

    security_client.post(
        "/api/v1/messenger/devices",
        json={
            "label": "Security browser",
            "device_kind": "web",
            "identity_key": {"kty": "OKP", "crv": "X25519", "x": "sec-key"},
            "prekey_bundle": {"signed_prekey": {"key_id": 1, "public_key": "signed-sec"}},
        },
    )

    space_id = admin_client.post(
        "/api/v1/messenger/spaces",
        json={"type": "direct", "title": "Direct", "member_ids": [security_user_id]},
    ).json()["id"]

    with security_client.websocket_connect("/api/v1/messenger/ws") as websocket:
        ready = websocket.receive_json()
        assert ready["type"] == "session.ready"

        response = admin_client.post(
            f"/api/v1/messenger/spaces/{space_id}/messages",
            json={
                "sender_device_id": admin_device_id,
                "message_type": "text",
                "encrypted_payload": {"algorithm": "AES-GCM", "ciphertext": "opaque"},
                "envelopes": [{"device_id": admin_device_id, "ciphertext": "sealed-key"}],
                "attachment_ids": [],
            },
        )
        assert response.status_code == 201

        event = websocket.receive_json()
        assert event["type"] == "message.created"
        assert event["space_id"] == space_id
