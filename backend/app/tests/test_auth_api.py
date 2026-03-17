from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.security import create_email_verification_token


def _build_client(tmp_path, monkeypatch) -> TestClient:
    user_path = tmp_path / "users.json"
    user_path.write_text("[]", encoding="utf-8")
    monkeypatch.setenv("USER_STORE_PATH", str(user_path))
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-secret")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("INITIAL_ADMIN_EMAIL", "")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_USER", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_USE_STARTTLS", "false")
    get_settings.cache_clear()
    return TestClient(app)


def register_user(client: TestClient, payload: dict) -> dict:
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 200
    return response.json()


def verify_registered_user(client: TestClient, tmp_path, email: str) -> None:
    records = json.loads((tmp_path / "users.json").read_text(encoding="utf-8"))
    user = next(entry for entry in records if entry["email"] == email.lower())
    token = create_email_verification_token(user)
    response = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert response.status_code == 200


def login_user(client: TestClient, email: str, password: str):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_register_first_user_becomes_admin(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    data = register_user(
        client,
        {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"},
    )
    assert data["status"] == "pending_verification"
    verify_registered_user(client, tmp_path, "admin@example.com")

    login = login_user(client, "admin@example.com", "StrongPass!1")
    assert login.status_code == 200
    assert login.json()["user"]["role"] == "admin"
    assert login.json()["user"]["email"] == "admin@example.com"
    assert login.json()["user"]["email_verified"] is True
    assert "insight_access_token" in login.cookies


def test_login_requires_verified_email(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    register_user(client, payload)

    blocked = login_user(client, payload["email"], payload["password"])
    assert blocked.status_code == 403
    detail = blocked.json()["detail"]
    assert detail["code"] == "email_not_verified"
    assert detail["allow_resend_verification"] is True


def test_login_and_access_protected_routes(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    register_user(client, payload)
    verify_registered_user(client, tmp_path, payload["email"])

    login = login_user(client, payload["email"], payload["password"])
    assert login.status_code == 200
    protected = client.get("/api/v1/cybersecurity/controls")
    assert protected.status_code == 200
    assert protected.json()["count"] > 0


def test_non_privileged_user_cannot_access_cybersecurity(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    admin_payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    user_payload = {"email": "user@example.com", "password": "StrongPass!1", "full_name": "User One"}

    register_user(client, admin_payload)
    verify_registered_user(client, tmp_path, admin_payload["email"])
    login_user(client, admin_payload["email"], admin_payload["password"])
    client.post("/api/v1/auth/logout")

    register_user(client, user_payload)
    verify_registered_user(client, tmp_path, user_payload["email"])
    login_user(client, user_payload["email"], user_payload["password"])

    forbidden = client.get("/api/v1/cybersecurity/controls")
    assert forbidden.status_code == 403


def test_admin_can_update_user_roles(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    admin_payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    user_payload = {"email": "user@example.com", "password": "StrongPass!1", "full_name": "User One"}

    register_user(client, admin_payload)
    verify_registered_user(client, tmp_path, admin_payload["email"])
    login_user(client, admin_payload["email"], admin_payload["password"])
    client.post("/api/v1/auth/logout")

    register_user(client, user_payload)
    verify_registered_user(client, tmp_path, user_payload["email"])
    login_user(client, user_payload["email"], user_payload["password"])
    client.post("/api/v1/auth/logout")

    client.post("/api/v1/auth/login", json={"email": admin_payload["email"], "password": admin_payload["password"]})
    users_response = client.get("/api/v1/admin/users")
    assert users_response.status_code == 200
    users = users_response.json()["items"]
    target = next(user for user in users if user["email"] == user_payload["email"])

    update = client.patch(f"/api/v1/admin/users/{target['id']}", json={"role": "security"})
    assert update.status_code == 200
    assert update.json()["user"]["role"] == "security"

    admin_id = next(user for user in users if user["email"] == admin_payload["email"])["id"]
    cannot_demote = client.patch(f"/api/v1/admin/users/{admin_id}", json={"role": "user"})
    assert cannot_demote.status_code == 400


def test_users_overview_read_only_access(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    admin_payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    user_payload = {"email": "user@example.com", "password": "StrongPass!1", "full_name": "User One"}

    register_user(client, admin_payload)
    verify_registered_user(client, tmp_path, admin_payload["email"])
    login_user(client, admin_payload["email"], admin_payload["password"])
    client.post("/api/v1/auth/logout")

    register_user(client, user_payload)
    verify_registered_user(client, tmp_path, user_payload["email"])
    login_user(client, user_payload["email"], user_payload["password"])

    overview_user = client.get("/api/v1/users/overview")
    assert overview_user.status_code == 200
    payload = overview_user.json()
    assert payload["stats"]["total"] == 2
    assert payload["current_user"]["email"] == user_payload["email"]
    assert payload["can_manage"] is False

    client.post("/api/v1/auth/logout")
    login_user(client, admin_payload["email"], admin_payload["password"])
    overview_admin = client.get("/api/v1/users/overview")
    assert overview_admin.status_code == 200
    assert overview_admin.json()["can_manage"] is True


def test_user_can_update_profile(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    register_user(client, payload)
    verify_registered_user(client, tmp_path, payload["email"])
    login = login_user(client, payload["email"], payload["password"])
    assert login.status_code == 200

    profile_before = client.get("/api/v1/auth/me").json()
    assert profile_before["full_name"] == "Admin One"

    update = client.patch("/api/v1/auth/me", json={"full_name": "Admin Updated"})
    assert update.status_code == 200
    assert update.json()["user"]["full_name"] == "Admin Updated"

    refreshed = client.get("/api/v1/auth/me").json()
    assert refreshed["full_name"] == "Admin Updated"
