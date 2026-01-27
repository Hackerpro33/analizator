from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .security import require_private_lab_access, require_roles
from .services.security_architecture import ArchitectureVersion, AttackScenario, get_security_architecture_manager


router = APIRouter(
    prefix="/cyber",
    tags=["cyber-architecture"],
    dependencies=[Depends(require_roles("admin", "security", "security_viewer"))],
)


class ArchitecturePayload(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    topology_preset: str = Field("microservices", pattern="^(monolith|microservices|mesh|segmented)$")
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    segments: List[Dict[str, Any]] = Field(default_factory=list)
    placement: Dict[str, str] = Field(default_factory=dict)
    enabled_flags: Dict[str, Any] = Field(default_factory=dict)
    policies: List[Dict[str, Any]] = Field(default_factory=list)


class ScenarioPayload(BaseModel):
    id: Optional[str] = None
    name: str
    description: Optional[str] = None
    stages: List[Dict[str, Any]]
    tags: List[str] = Field(default_factory=list)
    intensity: str = Field("medium", pattern="^(low|medium|high)$")
    duration_seconds: int = Field(60, ge=10, le=3600)
    success_criteria: Optional[Dict[str, Any]] = None


class RunRequest(BaseModel):
    architecture_version_id: str


def serialize_architecture(item: ArchitectureVersion) -> Dict[str, Any]:
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "topology_preset": item.topology_preset,
        "nodes": item.nodes,
        "edges": item.edges,
        "segments": item.segments,
        "placement": item.placement,
        "enabled_flags": item.enabled_flags,
        "policies": item.policies,
        "cloned_from_id": item.cloned_from_id,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def serialize_scenario(item: AttackScenario) -> Dict[str, Any]:
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "stages": item.stages,
        "tags": item.tags,
        "intensity": item.intensity,
        "duration_seconds": item.duration_seconds,
        "success_criteria": item.success_criteria,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


@router.get("/architecture/versions")
def list_architecture_versions():
    manager = get_security_architecture_manager()
    items = [serialize_architecture(item) for item in manager.list_versions()]
    return {"items": items, "count": len(items)}


@router.post(
    "/architecture/versions",
    dependencies=[Depends(require_roles("admin", "security")), Depends(require_private_lab_access)],
)
def upsert_architecture(payload: ArchitecturePayload):
    manager = get_security_architecture_manager()
    saved = manager.save_version(payload.model_dump(), author="api")
    return {"version": serialize_architecture(saved)}


@router.post(
    "/architecture/versions/{version_id}/clone",
    dependencies=[Depends(require_roles("admin", "security")), Depends(require_private_lab_access)],
)
def clone_architecture(version_id: str, name: Optional[str] = None):
    manager = get_security_architecture_manager()
    try:
        clone = manager.clone_version(version_id, name=name, author="api")
    except ValueError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"version": serialize_architecture(clone)}


@router.get("/architecture/versions/{version_id}")
def get_architecture(version_id: str):
    manager = get_security_architecture_manager()
    version = manager.get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Architecture not found")
    return {"version": serialize_architecture(version)}


@router.get("/architecture/diff")
def diff_architecture(left: str = Query(...), right: str = Query(...)):
    manager = get_security_architecture_manager()
    try:
        diff = manager.diff_versions(left, right)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"diff": diff}


@router.get("/scenarios")
def list_scenarios():
    manager = get_security_architecture_manager()
    return {"items": [serialize_scenario(item) for item in manager.list_scenarios()]}


@router.post(
    "/scenarios",
    dependencies=[Depends(require_roles("admin", "security")), Depends(require_private_lab_access)],
)
def upsert_scenario(payload: ScenarioPayload):
    manager = get_security_architecture_manager()
    saved = manager.save_scenario(payload.model_dump())
    return {"scenario": serialize_scenario(saved)}


@router.post(
    "/scenarios/{scenario_id}/run",
    dependencies=[Depends(require_private_lab_access)],
)
def run_scenario(
    scenario_id: str,
    payload: RunRequest,
    current_user=Depends(require_roles("admin", "security")),
):
    manager = get_security_architecture_manager()
    try:
        result = manager.run_scenario(
            scenario_id=scenario_id,
            architecture_version_id=payload.architecture_version_id,
            initiated_by=current_user.get("email"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"run": result}


@router.get("/runs")
def list_runs(limit: int = Query(20, ge=1, le=100)):
    manager = get_security_architecture_manager()
    return {"items": manager.list_runs(limit=limit)}


@router.get("/runs/{run_id}")
def get_run(run_id: str):
    manager = get_security_architecture_manager()
    run = manager.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run": run}
