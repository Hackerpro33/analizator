from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from .test_auth_api import _build_client as build_auth_client


def test_architecture_and_scenario_flow(tmp_path, monkeypatch):
    client: TestClient = build_auth_client(tmp_path, monkeypatch)
    register = client.post(
        "/api/v1/auth/register",
        json={"email": "sec@example.com", "password": "StrongPass!1", "full_name": "Sec Owner"},
    )
    assert register.status_code == 200

    versions = client.get("/api/v1/cyber/architecture/versions")
    assert versions.status_code == 200
    version_items = versions.json()["items"]
    assert version_items, "preset architectures should be available"
    architecture_id = version_items[0]["id"]

    scenarios = client.get("/api/v1/cyber/scenarios")
    assert scenarios.status_code == 200
    scenario_items = scenarios.json()["items"]
    scenario_id = scenario_items[0]["id"]

    run_response = client.post(
        f"/api/v1/cyber/scenarios/{scenario_id}/run",
        json={"architecture_version_id": architecture_id},
    )
    assert run_response.status_code == 200
    data = run_response.json()["run"]
    assert data["status"] == "completed"
    assert data["summary"]["blocked"] >= 0

    runs = client.get("/api/v1/cyber/runs")
    assert runs.status_code == 200
    assert runs.json()["items"], "simulation history should list at least the run"


def test_host_protection_status(tmp_path, monkeypatch):
    monkeypatch.setenv("HOST_AGENT_TOKEN", "agent-token")
    client: TestClient = build_auth_client(tmp_path, monkeypatch)
    client.post(
        "/api/v1/auth/register",
        json={"email": "sec@example.com", "password": "StrongPass!1", "full_name": "Sec Owner"},
    )

    status = client.post(
        "/api/v1/cyber/host",
        headers={"X-Host-Agent-Token": "agent-token"},
        json=[
            {"tool": "aide", "status": "ok", "details": {"drift": 0}, "message": "baseline verified", "severity": "low"},
            {"tool": "auditd", "status": "alert", "details": {"files": 1}, "message": "system file change", "severity": "high"},
        ],
    )
    assert status.status_code == 200
    payload = status.json()
    assert len(payload["status"]) == 2

    overview = client.get("/api/v1/cyber/host")
    assert overview.status_code == 200
    overview_payload = overview.json()
    assert any(entry["tool"] == "aide" for entry in overview_payload["status"])
    assert overview_payload["events"], "host protection events should be ingested"
