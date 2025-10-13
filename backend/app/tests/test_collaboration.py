from __future__ import annotations

from pathlib import Path

import json
import pytest
from fastapi.testclient import TestClient

from app import collaboration_api
from app.main import app

DEFAULT_HEADERS = {"host": "localhost"}


@pytest.fixture(autouse=True)
def isolate_collaboration_storage(tmp_path, monkeypatch):
    storage_dir = tmp_path / "collaboration"
    storage_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(collaboration_api, "COLLAB_DATA_DIR", storage_dir, raising=False)
    monkeypatch.setattr(collaboration_api, "COMMENTS_PATH", storage_dir / "comments.json", raising=False)
    monkeypatch.setattr(collaboration_api, "WORKSPACES_PATH", storage_dir / "workspaces.json", raising=False)
    monkeypatch.setattr(collaboration_api, "ACCESS_POLICIES_PATH", storage_dir / "access_policies.json", raising=False)
    monkeypatch.setattr(collaboration_api, "AUDIT_LOG_PATH", storage_dir / "audit.log", raising=False)

    yield


def _read_audit_events(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def test_comment_creation_and_listing(tmp_path):
    client = TestClient(app)

    workspace_payload = {
        "name": "Operations",
        "created_by": "alice",
        "description": "Ops workspace",
        "tags": ["ops"],
    }
    workspace_response = client.post(
        "/api/collaboration/workspaces",
        json=workspace_payload,
        headers=DEFAULT_HEADERS,
    )
    assert workspace_response.status_code == 200
    workspace_data = workspace_response.json()
    workspace_id = workspace_data["workspace"]["id"]

    comment_payload = {
        "text": "Проверить метрику на графике @bob",
        "created_by": "alice",
        "target": {
            "workspace_id": workspace_id,
            "dataset_id": "sales-q1",
            "widget_id": "chart-42",
            "row": 5,
            "column": "revenue",
        },
        "mentions": ["charlie"],
    }

    comment_response = client.post(
        "/api/collaboration/comments",
        json=comment_payload,
        headers=DEFAULT_HEADERS,
    )
    assert comment_response.status_code == 200
    created_comment = comment_response.json()
    assert created_comment["mentions"] == ["bob", "charlie"]
    assert created_comment["anchor"].startswith("workspace:")
    assert "dataset:sales-q1" in created_comment["anchor"]
    assert created_comment["target"]["row"] == 5

    list_response = client.get(
        f"/api/collaboration/comments?dataset_id=sales-q1",
        headers=DEFAULT_HEADERS,
    )
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["count"] == 1
    assert payload["items"][0]["id"] == created_comment["id"]

    audit_events = _read_audit_events(collaboration_api.AUDIT_LOG_PATH)
    assert any(event["action"] == "comment.created" for event in audit_events)


def test_access_policy_inheritance(tmp_path):
    client = TestClient(app)

    parent_response = client.post(
        "/api/collaboration/workspaces",
        json={"name": "HQ", "created_by": "owner"},
        headers=DEFAULT_HEADERS,
    )
    assert parent_response.status_code == 200
    parent_id = parent_response.json()["workspace"]["id"]

    child_response = client.post(
        "/api/collaboration/workspaces",
        json={
            "name": "Research",
            "created_by": "owner",
            "parent_id": parent_id,
            "inherit_permissions": True,
        },
        headers=DEFAULT_HEADERS,
    )
    assert child_response.status_code == 200
    child_id = child_response.json()["workspace"]["id"]

    parent_policy = {
        "assignments": [
            {"user_id": "owner", "role": "owner", "tags": ["executive"]},
        ],
        "actor": "owner",
    }
    parent_policy_response = client.put(
        f"/api/collaboration/access-policies/{parent_id}",
        json=parent_policy,
        headers=DEFAULT_HEADERS,
    )
    assert parent_policy_response.status_code == 200
    assert parent_policy_response.json()["roles_summary"]["owner"] == 1

    child_policy = {
        "assignments": [
            {"user_id": "analyst", "role": "editor", "folders": ["experiments"]}
        ],
        "actor": "owner",
    }
    child_policy_response = client.put(
        f"/api/collaboration/access-policies/{child_id}",
        json=child_policy,
        headers=DEFAULT_HEADERS,
    )
    assert child_policy_response.status_code == 200
    payload = child_policy_response.json()
    assert payload["roles_summary"]["owner"] == 1
    assert payload["roles_summary"]["editor"] == 1

    policy_fetch = client.get(
        f"/api/collaboration/access-policies/{child_id}",
        headers=DEFAULT_HEADERS,
    )
    assert policy_fetch.status_code == 200
    effective = policy_fetch.json()["effective_assignments"]
    assert len(effective) == 2
    assert {assignment["role"] for assignment in effective} == {"owner", "editor"}

    workspaces_list = client.get("/api/collaboration/workspaces", headers=DEFAULT_HEADERS)
    assert workspaces_list.status_code == 200
    workspaces_payload = workspaces_list.json()
    research_entry = next(
        item for item in workspaces_payload["items"] if item["workspace"]["id"] == child_id
    )
    assert len(research_entry["effective_assignments"]) == 2


def test_comment_filters_and_deletion(tmp_path):
    client = TestClient(app)

    workspace_response = client.post(
        "/api/collaboration/workspaces",
        json={"name": "Operations", "created_by": "alice"},
        headers=DEFAULT_HEADERS,
    )
    assert workspace_response.status_code == 200
    workspace_id = workspace_response.json()["workspace"]["id"]

    first_comment = client.post(
        "/api/collaboration/comments",
        json={
            "text": "Нужно сверить числа @bob",
            "created_by": "alice",
            "target": {
                "workspace_id": workspace_id,
                "dataset_id": "sales-q2",
                "widget_id": "table-1",
                "row": 3,
            },
        },
        headers=DEFAULT_HEADERS,
    )
    assert first_comment.status_code == 200
    first_payload = first_comment.json()

    second_comment = client.post(
        "/api/collaboration/comments",
        json={
            "text": "@dora проверь тренд",
            "created_by": "carol",
            "target": {
                "workspace_id": workspace_id,
                "dataset_id": "sales-q2",
                "widget_id": "chart-2",
            },
        },
        headers=DEFAULT_HEADERS,
    )
    assert second_comment.status_code == 200
    second_payload = second_comment.json()

    widget_filtered = client.get(
        "/api/collaboration/comments",
        params={"workspace_id": workspace_id, "widget_id": "table-1"},
        headers=DEFAULT_HEADERS,
    )
    assert widget_filtered.status_code == 200
    assert widget_filtered.json()["count"] == 1
    assert widget_filtered.json()["items"][0]["id"] == first_payload["id"]

    mention_filtered = client.get(
        "/api/collaboration/comments",
        params={"workspace_id": workspace_id, "mentioned_user": "dora"},
        headers=DEFAULT_HEADERS,
    )
    assert mention_filtered.status_code == 200
    assert mention_filtered.json()["count"] == 1
    assert mention_filtered.json()["items"][0]["id"] == second_payload["id"]

    resolve_response = client.patch(
        f"/api/collaboration/comments/{first_payload['id']}",
        json={"resolved": True, "actor": "bob"},
        headers=DEFAULT_HEADERS,
    )
    assert resolve_response.status_code == 200
    resolved_payload = resolve_response.json()
    assert resolved_payload["resolved"] is True
    assert resolved_payload["updated_at"] is not None

    get_response = client.get(
        f"/api/collaboration/comments/{first_payload['id']}",
        headers=DEFAULT_HEADERS,
    )
    assert get_response.status_code == 200
    assert get_response.json()["resolved"] is True

    delete_response = client.delete(
        f"/api/collaboration/comments/{first_payload['id']}",
        params={"actor": "bob"},
        headers=DEFAULT_HEADERS,
    )
    assert delete_response.status_code == 204

    remaining = client.get(
        "/api/collaboration/comments",
        params={"workspace_id": workspace_id},
        headers=DEFAULT_HEADERS,
    )
    assert remaining.status_code == 200
    assert remaining.json()["count"] == 1
    assert remaining.json()["items"][0]["id"] == second_payload["id"]

    audit_response = client.get(
        "/api/collaboration/audit-log",
        params={"limit": 5},
        headers=DEFAULT_HEADERS,
    )
    assert audit_response.status_code == 200
    actions = [event["action"] for event in audit_response.json()["items"]]
    assert "comment.created" in actions
    assert "comment.updated" in actions
    assert "comment.deleted" in actions


def test_access_policy_attribute_evaluation(tmp_path):
    client = TestClient(app)

    parent_response = client.post(
        "/api/collaboration/workspaces",
        json={"name": "Finance", "created_by": "owner"},
        headers=DEFAULT_HEADERS,
    )
    parent_id = parent_response.json()["workspace"]["id"]

    child_response = client.post(
        "/api/collaboration/workspaces",
        json={
            "name": "Analytics",
            "created_by": "owner",
            "parent_id": parent_id,
            "inherit_permissions": True,
        },
        headers=DEFAULT_HEADERS,
    )
    child_id = child_response.json()["workspace"]["id"]

    client.put(
        f"/api/collaboration/access-policies/{parent_id}",
        json={
            "assignments": [
                {"user_id": "alice", "role": "owner", "tags": ["finance"]},
            ],
            "actor": "owner",
        },
        headers=DEFAULT_HEADERS,
    )

    client.put(
        f"/api/collaboration/access-policies/{child_id}",
        json={
            "assignments": [
                {
                    "user_id": "bob",
                    "role": "editor",
                    "folders": ["dashboards"],
                }
            ],
            "actor": "owner",
        },
        headers=DEFAULT_HEADERS,
    )

    allowed_response = client.post(
        f"/api/collaboration/access-policies/{child_id}/evaluate",
        json={
            "user_id": "alice",
            "required_role": "viewer",
            "resource_tags": ["finance"],
        },
        headers=DEFAULT_HEADERS,
    )
    assert allowed_response.status_code == 200
    allowed_payload = allowed_response.json()
    assert allowed_payload["allowed"] is True
    assert allowed_payload["resolved_role"] == "owner"
    assert allowed_payload["matched_assignments"][0]["user_id"] == "alice"

    denied_tags = client.post(
        f"/api/collaboration/access-policies/{child_id}/evaluate",
        json={
            "user_id": "alice",
            "required_role": "viewer",
            "resource_tags": ["hr"],
        },
        headers=DEFAULT_HEADERS,
    )
    assert denied_tags.status_code == 200
    assert denied_tags.json()["allowed"] is False
    assert denied_tags.json()["matched_assignments"] == []

    insufficient_role = client.post(
        f"/api/collaboration/access-policies/{child_id}/evaluate",
        json={
            "user_id": "bob",
            "required_role": "owner",
            "resource_folders": ["dashboards"],
        },
        headers=DEFAULT_HEADERS,
    )
    assert insufficient_role.status_code == 200
    payload = insufficient_role.json()
    assert payload["allowed"] is False
    assert payload["resolved_role"] == "editor"
    assert payload["matched_assignments"][0]["role"] == "editor"
    assert "insufficient" in payload["reason"]

    audit_events = client.get(
        "/api/collaboration/audit-log",
        params={"limit": 20},
        headers=DEFAULT_HEADERS,
    )
    assert audit_events.status_code == 200
    actions = [event["action"] for event in audit_events.json()["items"]]
    assert "access_policy.evaluated" in actions

    audit_events = _read_audit_events(collaboration_api.AUDIT_LOG_PATH)
    actions = [event["action"] for event in audit_events]
    assert "access_policy.updated" in actions
    assert "workspace.created" in actions
