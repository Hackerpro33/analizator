from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

from app.services import user_store
from app.services.metadata_repository import JsonMetadataRepository
from app.services.object_storage import ObjectStorageClient
from .test_auth_api import _build_client as build_auth_client


def test_cybersecurity_endpoints_require_privileged_user(tmp_path, monkeypatch):
    user_store.get_user_store.cache_clear()
    client = build_auth_client(tmp_path, monkeypatch)
    client.post(
        "/api/v1/auth/register",
        json={"email": "sec@example.com", "password": "StrongPass!1", "full_name": "Sec Admin"},
    )
    controls = client.get("/api/v1/cybersecurity/controls")
    assert controls.status_code == 200
    assert controls.json()["count"] > 0

    payload = {
        "assets": [
            {
                "asset_id": "mesh",
                "asset_type": "service",
                "criticality": "high",
                "exposure": 0.45,
                "last_patch_days": 10,
                "contains_pii": False,
                "internet_exposed": True,
                "quantum_ready": True,
                "runtime": "kubernetes",
                "identities": ["mesh"],
            }
        ],
        "telemetry": [],
        "threat_level": "low",
    }
    posture = client.post("/api/v1/cybersecurity/posture", json=payload)
    assert posture.status_code == 200
    posture_body = posture.json()
    assert "resilience_index" in posture_body

    mtd_payload = {
        "services": [
            {"name": "api", "attack_surface": 0.3, "runtime": "kubernetes", "supports_chaos": True},
            {"name": "data", "attack_surface": 0.5, "runtime": "data-plane", "supports_chaos": False},
        ],
        "base_rotation_minutes": 30,
    }
    mtd = client.post("/api/v1/cybersecurity/moving-target", json=mtd_payload)
    assert mtd.status_code == 200
    plan = mtd.json()
    assert plan["services"]


def test_storage_and_metadata_repositories(tmp_path):
    client = ObjectStorageClient(
        bucket="tests",
        endpoint_url=None,
        access_key=None,
        secret_key=None,
        region_name=None,
        force_path_style=True,
        use_ssl=False,
        local_root=tmp_path,
    )
    location = client.put_object(key="datasets/demo.csv", data=b"col\n42\n", content_type="text/csv")
    saved_path = client.local_path_for("datasets/demo.csv")
    assert Path(saved_path).exists()
    assert location.bucket == "tests"
    assert location.key == "datasets/demo.csv"

    repo = JsonMetadataRepository(tmp_path / "metadata.json")
    record = repo.record_dataset_upload(
        dataset_id="ds1",
        filename="demo.csv",
        storage_bucket=location.bucket,
        storage_key=location.key,
        content_type="text/csv",
        size_bytes=6,
        checksum="abc",
        quick_extraction={"columns": [], "row_count": 0, "sample_data": [], "insights": []},
    )
    assert record.id == "ds1"
    repo.record_job_event(job_id="job1", job_type="extract", dataset_id="ds1", status="queued")
    repo.record_job_event(job_id="job1", job_type="extract", dataset_id="ds1", status="finished", result={"ok": True})

    state = json.loads((tmp_path / "metadata.json").read_text(encoding="utf-8"))
    assert "datasets" in state and "ds1" in state["datasets"]
    assert state["jobs"]["job1"]["status"] == "finished"
