"""Collaboration-centric endpoints for comments, access control, and workspaces."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import (
    BaseModel,
    Field,
    ConfigDict,
    computed_field,
    field_validator,
    model_validator,
)

from .utils.files import DATA_DIR, export_json_atomic

COLLAB_DATA_DIR = DATA_DIR / "collaboration"
COLLAB_DATA_DIR.mkdir(parents=True, exist_ok=True)

COMMENTS_PATH = COLLAB_DATA_DIR / "comments.json"
WORKSPACES_PATH = COLLAB_DATA_DIR / "workspaces.json"
ACCESS_POLICIES_PATH = COLLAB_DATA_DIR / "access_policies.json"
AUDIT_LOG_PATH = COLLAB_DATA_DIR / "audit.log"

MENTION_PATTERN = re.compile(r"@([\w.-]+)")

ROLE_ORDER = {"viewer": 0, "editor": 1, "owner": 2}


router = APIRouter(prefix="/collaboration", tags=["Collaboration"])


class CommentTarget(BaseModel):
    """Precise anchor within a workspace/dataset for a comment."""

    workspace_id: Optional[str] = Field(
        default=None, description="Workspace identifier that the comment belongs to"
    )
    dataset_id: Optional[str] = Field(
        default=None, description="Dataset identifier if the comment references a dataset"
    )
    widget_id: Optional[str] = Field(
        default=None, description="Specific widget identifier in the UI"
    )
    row: Optional[int] = Field(
        default=None,
        ge=0,
        description="Row index within the dataset table",
    )
    column: Optional[str] = Field(
        default=None, description="Column name for pinpointing table cells"
    )
    data_point_path: Optional[List[str]] = Field(
        default=None,
        description=(
            "Hierarchical path to a data point (for nested visualisations or JSON data)."
        ),
    )

    @model_validator(mode="after")
    def ensure_scope(self) -> "CommentTarget":
        if not self.workspace_id and not self.dataset_id:
            raise ValueError("Either workspace_id or dataset_id must be provided")
        return self


class Comment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    text: str
    created_by: str
    created_at: datetime
    mentions: List[str]
    target: CommentTarget
    thread_id: Optional[str] = None
    resolved: bool = False
    updated_at: Optional[datetime] = None

    def _build_anchor(self) -> str:
        parts: List[str] = []
        if self.target.workspace_id:
            parts.append(f"workspace:{self.target.workspace_id}")
        if self.target.dataset_id:
            parts.append(f"dataset:{self.target.dataset_id}")
        if self.target.widget_id:
            parts.append(f"widget:{self.target.widget_id}")
        if self.target.row is not None:
            parts.append(f"row:{self.target.row}")
        if self.target.column:
            parts.append(f"column:{self.target.column}")
        if self.target.data_point_path:
            path_value = "/".join(self.target.data_point_path)
            parts.append(f"path:{path_value}")
        return "#".join(parts)

    @computed_field(return_type=str)
    def anchor(self) -> str:
        return self._build_anchor()


class CommentCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    created_by: str = Field(..., min_length=1, max_length=128)
    target: CommentTarget
    mentions: Optional[List[str]] = Field(default=None, description="Explicit mention list")
    thread_id: Optional[str] = Field(default=None, description="Optional thread identifier")

    @model_validator(mode="after")
    def populate_mentions(self) -> "CommentCreate":
        base_text = self.text or ""
        inferred = {match.group(1) for match in MENTION_PATTERN.finditer(base_text)}
        explicit = {value for value in (self.mentions or []) if value}
        self.mentions = sorted(explicit | inferred)
        return self


class CommentUpdate(BaseModel):
    resolved: Optional[bool] = None
    text: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    mentions: Optional[List[str]] = None
    actor: Optional[str] = Field(default=None, min_length=1, max_length=128)

    @field_validator("mentions")
    @classmethod
    def clean_mentions(cls, mentions: Optional[List[str]]) -> Optional[List[str]]:
        if mentions is None:
            return None
        return sorted({value for value in mentions if value})


class AccessAssignmentInput(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    role: str = Field(..., description="Role granted to the user")
    tags: List[str] = Field(default_factory=list)
    folders: List[str] = Field(default_factory=list)
    id: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        allowed = {"viewer", "editor", "owner"}
        if value not in allowed:
            raise ValueError(f"Role must be one of: {', '.join(sorted(allowed))}")
        return value


class AccessAssignment(AccessAssignmentInput):
    id: str
    created_at: datetime
    updated_at: datetime


class AccessPolicy(BaseModel):
    workspace_id: str
    assignments: List[AccessAssignment]


class AccessPolicyResponse(BaseModel):
    workspace_id: str
    assignments: List[AccessAssignment]
    effective_assignments: List[AccessAssignment]
    roles_summary: Dict[str, int]


class AccessEvaluationRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=128)
    required_role: str = Field(...)
    resource_tags: List[str] = Field(default_factory=list)
    resource_folders: List[str] = Field(default_factory=list)

    @field_validator("required_role")
    @classmethod
    def validate_required_role(cls, value: str) -> str:
        if value not in ROLE_ORDER:
            raise ValueError(f"Role must be one of: {', '.join(sorted(ROLE_ORDER))}")
        return value


class AccessEvaluationResponse(BaseModel):
    allowed: bool
    resolved_role: Optional[str]
    matched_assignments: List[AccessAssignment]
    reason: str


class AccessPolicyUpdate(BaseModel):
    assignments: List[AccessAssignmentInput]
    actor: str = Field(..., min_length=1, max_length=128)


class Workspace(BaseModel):
    id: str
    name: str
    created_by: str
    created_at: datetime
    description: Optional[str] = None
    parent_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    inherit_permissions: bool = True


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    created_by: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None
    parent_id: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    inherit_permissions: bool = True


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=256)
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    inherit_permissions: Optional[bool] = None


class WorkspaceResponse(BaseModel):
    workspace: Workspace
    breadcrumbs: List[Dict[str, str]]
    effective_assignments: List[AccessAssignment]


class WorkspaceListResponse(BaseModel):
    count: int
    items: List[WorkspaceResponse]


class CommentListResponse(BaseModel):
    count: int
    items: List[Comment]


class AuditEvent(BaseModel):
    timestamp: datetime
    action: str
    actor: str
    details: Dict[str, Any]


class AuditLogResponse(BaseModel):
    count: int
    items: List[AuditEvent]


def _log_audit_event(action: str, actor: str, details: Dict[str, Any]) -> None:
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "actor": actor,
        "details": details,
    }
    with AUDIT_LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        return default


def _read_comments() -> List[Comment]:
    payload = _load_json(COMMENTS_PATH, {"items": []})
    comments = []
    for raw in payload.get("items", []):
        try:
            comments.append(Comment(**raw))
        except Exception:
            continue
    return comments


def _persist_comments(comments: Iterable[Comment]) -> None:
    export_json_atomic(
        COMMENTS_PATH,
        {"items": [comment.model_dump(mode="json") for comment in comments]},
    )


def _read_workspaces() -> List[Workspace]:
    payload = _load_json(WORKSPACES_PATH, {"items": []})
    workspaces: List[Workspace] = []
    for raw in payload.get("items", []):
        try:
            workspaces.append(Workspace(**raw))
        except Exception:
            continue
    return workspaces


def _persist_workspaces(workspaces: Iterable[Workspace]) -> None:
    export_json_atomic(
        WORKSPACES_PATH,
        {"items": [ws.model_dump(mode="json") for ws in workspaces]},
    )


def _read_policies() -> Dict[str, List[AccessAssignment]]:
    payload = _load_json(ACCESS_POLICIES_PATH, {"items": {}})
    raw_items = payload.get("items", {})
    policies: Dict[str, List[AccessAssignment]] = {}
    for workspace_id, assignments in raw_items.items():
        items: List[AccessAssignment] = []
        for raw in assignments or []:
            try:
                items.append(AccessAssignment(**raw))
            except Exception:
                continue
        policies[workspace_id] = items
    return policies


def _persist_policies(policies: Dict[str, List[AccessAssignment]]) -> None:
    serialised = {
        "items": {
            workspace_id: [assignment.model_dump(mode="json") for assignment in assignments]
            for workspace_id, assignments in policies.items()
        }
    }
    export_json_atomic(ACCESS_POLICIES_PATH, serialised)


def _load_audit_events(limit: Optional[int] = 100) -> List[AuditEvent]:
    if not AUDIT_LOG_PATH.exists():
        return []
    events: List[AuditEvent] = []
    with AUDIT_LOG_PATH.open("r", encoding="utf-8") as handle:
        lines = handle.readlines()
    if limit is not None:
        lines = lines[-limit:]
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            raw = json.loads(line)
            events.append(
                AuditEvent(
                    timestamp=datetime.fromisoformat(raw["timestamp"]),
                    action=raw["action"],
                    actor=raw.get("actor", ""),
                    details=raw.get("details", {}),
                )
            )
        except Exception:
            continue
    return events


def _build_breadcrumbs(workspace: Workspace, lookup: Dict[str, Workspace]) -> List[Dict[str, str]]:
    breadcrumbs: List[Dict[str, str]] = []
    current = workspace
    while current:
        breadcrumbs.append({"id": current.id, "name": current.name})
        if current.parent_id:
            current = lookup.get(current.parent_id)
            continue
        break
    return list(reversed(breadcrumbs))


def _collect_inherited_assignments(
    workspace: Workspace,
    lookup: Dict[str, Workspace],
    policies: Dict[str, List[AccessAssignment]],
) -> List[AccessAssignment]:
    collected: List[AccessAssignment] = []
    current = workspace
    while current:
        collected.extend(policies.get(current.id, []))
        if not current.inherit_permissions or not current.parent_id:
            break
        current = lookup.get(current.parent_id)
    return collected


def _summarise_roles(assignments: List[AccessAssignment]) -> Dict[str, int]:
    summary: Dict[str, int] = {"viewer": 0, "editor": 0, "owner": 0}
    for assignment in assignments:
        summary[assignment.role] = summary.get(assignment.role, 0) + 1
    return summary


def _role_allows(actual: Optional[str], required: str) -> bool:
    if actual is None:
        return False
    return ROLE_ORDER[actual] >= ROLE_ORDER[required]


def _assignment_applies(
    assignment: AccessAssignment,
    resource_tags: List[str],
    resource_folders: List[str],
) -> bool:
    if assignment.tags:
        if not set(assignment.tags) & set(resource_tags):
            return False
    if assignment.folders:
        if not set(assignment.folders) & set(resource_folders):
            return False
    return True


@router.get("/comments", response_model=CommentListResponse)
def list_comments(
    workspace_id: Optional[str] = Query(default=None),
    dataset_id: Optional[str] = Query(default=None),
    thread_id: Optional[str] = Query(default=None),
    widget_id: Optional[str] = Query(default=None),
    resolved: Optional[bool] = Query(default=None),
    mentioned_user: Optional[str] = Query(default=None, min_length=1, max_length=128),
) -> CommentListResponse:
    comments = _read_comments()
    filtered: List[Comment] = []
    for comment in comments:
        if workspace_id and comment.target.workspace_id != workspace_id:
            continue
        if dataset_id and comment.target.dataset_id != dataset_id:
            continue
        if thread_id and comment.thread_id != thread_id:
            continue
        if widget_id and comment.target.widget_id != widget_id:
            continue
        if resolved is not None and comment.resolved != resolved:
            continue
        if mentioned_user and mentioned_user not in comment.mentions:
            continue
        filtered.append(comment)
    return CommentListResponse(count=len(filtered), items=filtered)


@router.post("/comments", response_model=Comment)
def create_comment(payload: CommentCreate) -> Comment:
    comments = _read_comments()
    now = datetime.now(timezone.utc)
    comment = Comment(
        id=str(uuid.uuid4()),
        text=payload.text,
        created_by=payload.created_by,
        created_at=now,
        updated_at=now,
        mentions=payload.mentions or [],
        target=payload.target,
        thread_id=payload.thread_id,
        resolved=False,
    )
    comments.append(comment)
    _persist_comments(comments)
    _log_audit_event(
        action="comment.created",
        actor=payload.created_by,
        details={
            "comment_id": comment.id,
            "workspace_id": payload.target.workspace_id,
            "dataset_id": payload.target.dataset_id,
            "mentions": comment.mentions,
        },
    )
    return comment


@router.get("/comments/{comment_id}", response_model=Comment)
def get_comment(comment_id: str) -> Comment:
    comments = _read_comments()
    for comment in comments:
        if comment.id == comment_id:
            return comment
    raise HTTPException(status_code=404, detail="Comment not found")


@router.patch("/comments/{comment_id}", response_model=Comment)
def update_comment(comment_id: str, payload: CommentUpdate) -> Comment:
    comments = _read_comments()
    updated_comment: Optional[Comment] = None
    updated_list: List[Comment] = []

    actor: Optional[str] = None

    for comment in comments:
        if comment.id != comment_id:
            updated_list.append(comment)
            continue

        data = comment.model_dump()
        if payload.text is not None:
            data["text"] = payload.text
        if payload.resolved is not None:
            data["resolved"] = payload.resolved
        if payload.mentions is not None:
            data["mentions"] = payload.mentions
        else:
            # if text changed recompute mentions automatically
            if payload.text is not None:
                inferred = {
                    match.group(1) for match in MENTION_PATTERN.finditer(payload.text)
                }
                data["mentions"] = sorted(set(comment.mentions) | inferred)
        data["updated_at"] = datetime.now(timezone.utc)
        updated_comment = Comment(**data)
        updated_list.append(updated_comment)
        actor = payload.actor or comment.created_by

    if not updated_comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    _persist_comments(updated_list)
    _log_audit_event(
        action="comment.updated",
        actor=actor or updated_comment.created_by,
        details={
            "comment_id": updated_comment.id,
            "resolved": updated_comment.resolved,
            "mentions": updated_comment.mentions,
        },
    )
    return updated_comment


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: str, actor: str = Query(..., min_length=1, max_length=128)) -> Response:
    comments = _read_comments()
    remaining: List[Comment] = []
    removed: Optional[Comment] = None
    for comment in comments:
        if comment.id == comment_id:
            removed = comment
            continue
        remaining.append(comment)

    if removed is None:
        raise HTTPException(status_code=404, detail="Comment not found")

    _persist_comments(remaining)
    _log_audit_event(
        action="comment.deleted",
        actor=actor,
        details={
            "comment_id": comment_id,
            "workspace_id": removed.target.workspace_id,
            "dataset_id": removed.target.dataset_id,
        },
    )
    return Response(status_code=204)


@router.get("/workspaces", response_model=WorkspaceListResponse)
def list_workspaces() -> WorkspaceListResponse:
    workspaces = _read_workspaces()
    policies = _read_policies()
    lookup = {workspace.id: workspace for workspace in workspaces}

    responses: List[WorkspaceResponse] = []
    for workspace in workspaces:
        effective = _collect_inherited_assignments(workspace, lookup, policies)
        responses.append(
            WorkspaceResponse(
                workspace=workspace,
                breadcrumbs=_build_breadcrumbs(workspace, lookup),
                effective_assignments=effective,
            )
        )
    return WorkspaceListResponse(count=len(responses), items=responses)


@router.post("/workspaces", response_model=WorkspaceResponse)
def create_workspace(payload: WorkspaceCreate) -> WorkspaceResponse:
    workspaces = _read_workspaces()
    lookup = {workspace.id: workspace for workspace in workspaces}

    if payload.parent_id and payload.parent_id not in lookup:
        raise HTTPException(status_code=404, detail="Parent workspace not found")

    workspace = Workspace(
        id=str(uuid.uuid4()),
        name=payload.name,
        created_by=payload.created_by,
        created_at=datetime.now(timezone.utc),
        description=payload.description,
        parent_id=payload.parent_id,
        tags=payload.tags,
        inherit_permissions=payload.inherit_permissions,
    )

    workspaces.append(workspace)
    _persist_workspaces(workspaces)

    policies = _read_policies()
    effective = _collect_inherited_assignments(workspace, {**lookup, workspace.id: workspace}, policies)
    _log_audit_event(
        action="workspace.created",
        actor=payload.created_by,
        details={
            "workspace_id": workspace.id,
            "name": workspace.name,
            "parent_id": workspace.parent_id,
        },
    )
    return WorkspaceResponse(
        workspace=workspace,
        breadcrumbs=_build_breadcrumbs(workspace, {**lookup, workspace.id: workspace}),
        effective_assignments=effective,
    )


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(workspace_id: str, payload: WorkspaceUpdate) -> WorkspaceResponse:
    workspaces = _read_workspaces()
    updated: Optional[Workspace] = None
    updated_list: List[Workspace] = []

    for workspace in workspaces:
        if workspace.id != workspace_id:
            updated_list.append(workspace)
            continue

        data = workspace.dict()
        if payload.name is not None:
            data["name"] = payload.name
        if payload.description is not None:
            data["description"] = payload.description
        if payload.tags is not None:
            data["tags"] = payload.tags
        if payload.inherit_permissions is not None:
            data["inherit_permissions"] = payload.inherit_permissions
        updated = Workspace(**data)
        updated_list.append(updated)

    if not updated:
        raise HTTPException(status_code=404, detail="Workspace not found")

    _persist_workspaces(updated_list)
    lookup = {workspace.id: workspace for workspace in updated_list}
    policies = _read_policies()
    effective = _collect_inherited_assignments(updated, lookup, policies)
    _log_audit_event(
        action="workspace.updated",
        actor=updated.created_by,
        details={
            "workspace_id": updated.id,
            "name": updated.name,
            "inherit_permissions": updated.inherit_permissions,
        },
    )
    return WorkspaceResponse(
        workspace=updated,
        breadcrumbs=_build_breadcrumbs(updated, lookup),
        effective_assignments=effective,
    )


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(workspace_id: str) -> WorkspaceResponse:
    workspaces = _read_workspaces()
    lookup = {workspace.id: workspace for workspace in workspaces}
    workspace = lookup.get(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    policies = _read_policies()
    effective = _collect_inherited_assignments(workspace, lookup, policies)
    return WorkspaceResponse(
        workspace=workspace,
        breadcrumbs=_build_breadcrumbs(workspace, lookup),
        effective_assignments=effective,
    )


@router.get("/access-policies", response_model=List[AccessPolicyResponse])
def list_access_policies() -> List[AccessPolicyResponse]:
    workspaces = _read_workspaces()
    lookup = {workspace.id: workspace for workspace in workspaces}
    policies = _read_policies()
    responses: List[AccessPolicyResponse] = []

    for workspace in workspaces:
        assignments = policies.get(workspace.id, [])
        effective = _collect_inherited_assignments(workspace, lookup, policies)
        responses.append(
            AccessPolicyResponse(
                workspace_id=workspace.id,
                assignments=assignments,
                effective_assignments=effective,
                roles_summary=_summarise_roles(effective),
            )
        )
    return responses


@router.get("/access-policies/{workspace_id}", response_model=AccessPolicyResponse)
def get_access_policy(workspace_id: str) -> AccessPolicyResponse:
    workspaces = _read_workspaces()
    lookup = {workspace.id: workspace for workspace in workspaces}
    workspace = lookup.get(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    policies = _read_policies()
    assignments = policies.get(workspace_id, [])
    effective = _collect_inherited_assignments(workspace, lookup, policies)
    return AccessPolicyResponse(
        workspace_id=workspace_id,
        assignments=assignments,
        effective_assignments=effective,
        roles_summary=_summarise_roles(effective),
    )


@router.put("/access-policies/{workspace_id}", response_model=AccessPolicyResponse)
def update_access_policy(workspace_id: str, payload: AccessPolicyUpdate) -> AccessPolicyResponse:
    workspaces = _read_workspaces()
    lookup = {workspace.id: workspace for workspace in workspaces}
    if workspace_id not in lookup:
        raise HTTPException(status_code=404, detail="Workspace not found")

    existing = _read_policies()
    assignments: List[AccessAssignment] = []
    now = datetime.now(timezone.utc)
    for item in payload.assignments:
        identifier = item.id or str(uuid.uuid4())
        previous = next(
            (
                assignment
                for assignment in existing.get(workspace_id, [])
                if assignment.id == identifier
            ),
            None,
        )
        created_at = previous.created_at if previous else now
        assignments.append(
            AccessAssignment(
                id=identifier,
                user_id=item.user_id,
                role=item.role,
                tags=item.tags,
                folders=item.folders,
                created_at=created_at,
                updated_at=now,
            )
        )

    existing[workspace_id] = assignments
    _persist_policies(existing)

    effective = _collect_inherited_assignments(lookup[workspace_id], lookup, existing)
    _log_audit_event(
        action="access_policy.updated",
        actor=payload.actor,
        details={
            "workspace_id": workspace_id,
            "assignment_count": len(assignments),
        },
    )
    return AccessPolicyResponse(
        workspace_id=workspace_id,
        assignments=assignments,
        effective_assignments=effective,
        roles_summary=_summarise_roles(effective),
    )


@router.post(
    "/access-policies/{workspace_id}/evaluate",
    response_model=AccessEvaluationResponse,
)
def evaluate_access_policy(
    workspace_id: str, payload: AccessEvaluationRequest
) -> AccessEvaluationResponse:
    workspaces = _read_workspaces()
    lookup = {workspace.id: workspace for workspace in workspaces}
    workspace = lookup.get(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    policies = _read_policies()
    effective = _collect_inherited_assignments(workspace, lookup, policies)
    matched = [
        assignment
        for assignment in effective
        if assignment.user_id == payload.user_id
        and _assignment_applies(assignment, payload.resource_tags, payload.resource_folders)
    ]

    resolved_role: Optional[str] = None
    if matched:
        resolved_role = max(matched, key=lambda item: ROLE_ORDER[item.role]).role

    allowed = _role_allows(resolved_role, payload.required_role)
    if allowed:
        reason = (
            f"Granted via role '{resolved_role}' inherited within workspace hierarchy"
        )
    elif matched:
        reason = (
            f"Highest role '{resolved_role}' is insufficient for required "
            f"role '{payload.required_role}'"
        )
    else:
        reason = "No matching assignments for user and attributes"

    _log_audit_event(
        action="access_policy.evaluated",
        actor=payload.user_id,
        details={
            "workspace_id": workspace_id,
            "required_role": payload.required_role,
            "resolved_role": resolved_role,
            "allowed": allowed,
        },
    )

    return AccessEvaluationResponse(
        allowed=allowed,
        resolved_role=resolved_role,
        matched_assignments=matched,
        reason=reason,
    )


@router.get("/audit-log", response_model=AuditLogResponse)
def list_audit_events(limit: int = Query(100, ge=1, le=500)) -> AuditLogResponse:
    events = _load_audit_events(limit=limit)
    return AuditLogResponse(count=len(events), items=events)


__all__ = ["router"]
