from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.services.security_event_store import get_security_event_store
from .test_auth_api import login_user, register_user, verify_registered_user


def _build_client(tmp_path, monkeypatch) -> TestClient:
    user_path = tmp_path / "users.json"
    user_path.write_text("[]", encoding="utf-8")
    db_path = tmp_path / "security.db"
    monkeypatch.setenv("USER_STORE_PATH", str(user_path))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("AUTH_JWT_SECRET", "test-secret")
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("INITIAL_ADMIN_EMAIL", "")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_USER", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_USE_STARTTLS", "false")
    get_settings.cache_clear()
    get_security_event_store.cache_clear()
    return TestClient(app)


def _seed_events(count: int = 30) -> List[dict]:
    store = get_security_event_store()
    now = datetime.now(timezone.utc)
    events = []
    for index in range(count):
        events.append(
            {
                "ts": (now - timedelta(minutes=index)).isoformat(),
                "source": "ids" if index % 2 == 0 else "auth",
                "severity": "high" if index % 3 == 0 else "medium",
                "segment": "dmz" if index % 4 else "prod",
                "event_type": "simulation",
                "src_ip": f"203.0.113.{index%255}",
                "src_geo": {"country": "US", "city": "New York", "lat": 40.71, "lon": -74.0},
                "dst_ip": f"10.0.0.{index%255}",
                "dst_host": "gateway",
                "dst_service": "https",
                "user": "svc-ci",
                "action": "scan" if index % 2 == 0 else "login_fail",
                "attack_phase": "recon" if index % 2 == 0 else "initial_access",
                "message": "simulated event",
            }
        )
    store.bulk_ingest(events)
    return events


def test_cyber_endpoints_and_roles(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    admin_payload = {"email": "chief@example.com", "password": "StrongPass!1", "full_name": "Chief Sec"}
    viewer_payload = {"email": "viewer@example.com", "password": "StrongPass!1", "full_name": "Read Only"}

    register_user(client, admin_payload)
    verify_registered_user(client, tmp_path, admin_payload["email"])
    login = login_user(client, admin_payload["email"], admin_payload["password"])
    assert login.status_code == 200

    _seed_events()

    summary = client.get("/api/v1/cyber/summary?range=24h")
    assert summary.status_code == 200
    summary_data = summary.json()
    assert "eps" in summary_data and summary_data["eps"]["trend"]
    incidents = summary_data.get("incidents") or {}
    assert incidents.get("count", 0) > 0
    assert incidents.get("mttd") is not None
    assert incidents.get("mttr") is not None

    events = client.get("/api/v1/cyber/events?range=24h&pageSize=5")
    assert events.status_code == 200
    events_data = events.json()
    assert len(events_data["items"]) <= 5
    first_event = events_data["items"][0]

    detail = client.get(f"/api/v1/cyber/event/{first_event['id']}")
    assert detail.status_code == 200
    assert detail.json()["id"] == first_event["id"]

    graph = client.get("/api/v1/cyber/graph?range=24h&limitNodes=20&limitEdges=20")
    assert graph.status_code == 200
    assert isinstance(graph.json()["nodes"], list)

    heatmap = client.get("/api/v1/cyber/heatmap?range=24h&mode=technique_segment")
    assert heatmap.status_code == 200
    assert isinstance(heatmap.json()["matrix"], list)

    attack_map = client.get("/api/v1/cyber/map?range=24h")
    assert attack_map.status_code == 200
    assert isinstance(attack_map.json()["connections"], list)

    client.post("/api/v1/auth/logout")
    register_user(client, viewer_payload)
    verify_registered_user(client, tmp_path, viewer_payload["email"])
    client.post("/api/v1/auth/logout")
    login_user(client, admin_payload["email"], admin_payload["password"])
    users = client.get("/api/v1/admin/users").json()["items"]
    viewer = next(item for item in users if item["email"] == viewer_payload["email"])
    update = client.patch(f"/api/v1/admin/users/{viewer['id']}", json={"role": "security_viewer"})
    assert update.status_code == 200

    client.post("/api/v1/auth/logout")
    login_viewer = login_user(client, viewer_payload["email"], viewer_payload["password"])
    assert login_viewer.status_code == 200
    viewer_summary = client.get("/api/v1/cyber/summary?range=24h")
    assert viewer_summary.status_code == 200


def test_summary_handles_incident_failures(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)
    admin_payload = {"email": "chief@example.com", "password": "StrongPass!1", "full_name": "Chief Sec"}
    register_user(client, admin_payload)
    verify_registered_user(client, tmp_path, admin_payload["email"])
    login_user(client, admin_payload["email"], admin_payload["password"])
    _seed_events()

    def boom(self, connection, filters):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.services.security_event_store.SecurityEventStore._compute_incident_metrics", boom)
    summary = client.get("/api/v1/cyber/summary?range=24h")
    assert summary.status_code == 200
    incidents = summary.json().get("incidents") or {}
    assert incidents.get("count") == 0


def test_redis_cache_handles_non_string_url(monkeypatch):
    from app.services import security_event_store as module

    class DummyUrl:
        def __str__(self):
            return "redis://invalid"

    class BrokenRedis:
        @classmethod
        def from_url(cls, url, decode_responses=True):
            raise RuntimeError("boom")

    monkeypatch.setattr(module, "Redis", BrokenRedis)

    cache = module._RedisCache(DummyUrl())
    assert cache.get("missing") is None
    assert cache._disabled is True
