from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def _build_client(tmp_path, monkeypatch) -> TestClient:
    user_path = tmp_path / "users.json"
    user_path.write_text("[]", encoding="utf-8")
    monkeypatch.setenv("USER_STORE_PATH", str(user_path))
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-secret")
    monkeypatch.setenv("INITIAL_ADMIN_EMAIL", "")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "")
    get_settings.cache_clear()
    return TestClient(app)


def test_register_first_user_becomes_admin(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["role"] == "admin"
    assert data["user"]["email"] == "admin@example.com"
    assert "insight_access_token" in response.cookies


def test_login_and_access_protected_routes(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    client.post("/api/v1/auth/register", json=payload)
    client.post("/api/v1/auth/logout")
    login = client.post("/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert login.status_code == 200
    protected = client.get("/api/v1/cybersecurity/controls")
    assert protected.status_code == 200
    assert protected.json()["count"] > 0


def test_non_privileged_user_cannot_access_cybersecurity(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    admin_payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    user_payload = {"email": "user@example.com", "password": "StrongPass!1", "full_name": "User One"}
    client.post("/api/v1/auth/register", json=admin_payload)
    client.post("/api/v1/auth/logout")
    client.post("/api/v1/auth/register", json=user_payload)
    forbidden = client.get("/api/v1/cybersecurity/controls")
    assert forbidden.status_code == 403


def test_admin_can_update_user_roles(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    admin_payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    user_payload = {"email": "user@example.com", "password": "StrongPass!1", "full_name": "User One"}
    client.post("/api/v1/auth/register", json=admin_payload)
    client.post("/api/v1/auth/logout")
    client.post("/api/v1/auth/register", json=user_payload)
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

    # Bootstrap administrator then switch to regular user session
    client.post("/api/v1/auth/register", json=admin_payload)
    client.post("/api/v1/auth/logout")
    client.post("/api/v1/auth/register", json=user_payload)

    overview_user = client.get("/api/v1/users/overview")
    assert overview_user.status_code == 200
    payload = overview_user.json()
    assert payload["stats"]["total"] == 2
    assert payload["current_user"]["email"] == user_payload["email"]
    assert payload["can_manage"] is False

    client.post("/api/v1/auth/logout")
    client.post("/api/v1/auth/login", json={"email": admin_payload["email"], "password": admin_payload["password"]})
    overview_admin = client.get("/api/v1/users/overview")
    assert overview_admin.status_code == 200
    assert overview_admin.json()["can_manage"] is True


def test_user_can_update_profile(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin One"}
    register = client.post("/api/v1/auth/register", json=payload)
    assert register.status_code == 200

    profile_before = client.get("/api/v1/auth/me").json()
    assert profile_before["full_name"] == "Admin One"

    update = client.patch("/api/v1/auth/me", json={"full_name": "Admin Updated"})
    assert update.status_code == 200
    assert update.json()["user"]["full_name"] == "Admin Updated"

    refreshed = client.get("/api/v1/auth/me").json()
    assert refreshed["full_name"] == "Admin Updated"
