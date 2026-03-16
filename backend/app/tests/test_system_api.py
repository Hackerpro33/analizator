from __future__ import annotations

import json
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from .test_auth_api import login_user, register_user, verify_registered_user


def _client(tmp_path, monkeypatch) -> TestClient:
    store_path = tmp_path / "users.json"
    store_path.write_text("[]", encoding="utf-8")
    monkeypatch.setenv("USER_STORE_PATH", str(store_path))
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-secret")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_USER", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_USE_STARTTLS", "false")
    get_settings.cache_clear()
    return TestClient(app)


def test_metrics_endpoint_requires_auth(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    response = client.get("/api/v1/system/metrics")
    assert response.status_code == 401


def test_metrics_endpoint_returns_current_readings(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    register_user(client, {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin"})
    verify_registered_user(client, tmp_path, "admin@example.com")
    login_user(client, "admin@example.com", "StrongPass!1")
    metrics = client.get("/api/v1/system/metrics")
    assert metrics.status_code == 200
    payload = metrics.json()
    assert "cpu_percent" in payload
    assert "memory_percent" in payload
    assert "network" in payload and "download_mbps" in payload["network"]
    assert payload["system"]["version"]
    assert "model_alerts" in payload


def test_system_logs_require_privileged_access(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    log_path = tmp_path / "system.log"
    log_entries = [
        {"timestamp": "2024-01-01T00:00:00Z", "level": "info", "message": "boot", "logger": "test"},
        {"timestamp": "2024-01-01T01:00:00Z", "level": "error", "message": "failure", "logger": "test"},
    ]
    log_path.write_text("\n".join(json.dumps(entry) for entry in log_entries), encoding="utf-8")
    settings = get_settings()
    settings.log_file_path = str(log_path)

    admin_payload = {"email": "admin@example.com", "password": "StrongPass!1", "full_name": "Admin"}
    register_user(client, admin_payload)
    verify_registered_user(client, tmp_path, admin_payload["email"])
    login_user(client, admin_payload["email"], admin_payload["password"])

    logs = client.get("/api/v1/system/logs")
    assert logs.status_code == 200
    payload = logs.json()
    assert payload["count"] == 2

    download = client.get("/api/v1/system/logs/download")
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("text/plain")

    client.post("/api/v1/auth/logout")
    register_user(client, {"email": "user@example.com", "password": "StrongPass!1", "full_name": "User"})
    verify_registered_user(client, tmp_path, "user@example.com")
    login_user(client, "user@example.com", "StrongPass!1")
    forbidden = client.get("/api/v1/system/logs")
    assert forbidden.status_code == 403
