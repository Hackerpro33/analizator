from __future__ import annotations

from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .security import require_roles
from .services.cybersecurity import (
    Asset,
    CONTROL_LIBRARY,
    ServiceProfile,
    Telemetry,
    evaluate_posture,
    plan_moving_target_defense,
)


router = APIRouter(
    prefix="/cybersecurity",
    tags=["cybersecurity"],
    dependencies=[Depends(require_roles("admin", "security", "security_viewer"))],
)


class AssetModel(BaseModel):
    asset_id: str = Field(..., description="Уникальный идентификатор актива")
    asset_type: str = Field(..., description="Тип актива: workload, data, endpoint и т.п.")
    criticality: Literal["low", "medium", "high", "mission"] = "medium"
    exposure: float = Field(..., ge=0.0, le=1.0, description="Доля открытой поверхности атаки")
    last_patch_days: int = Field(30, ge=0, le=3650)
    contains_pii: bool = False
    internet_exposed: bool = False
    quantum_ready: bool = Field(False, description="Использует ли квантово-устойчивые протоколы")
    runtime: str = Field("kubernetes", description="kubernetes | vm | service-mesh | edge | data-plane")
    identities: List[str] = Field(default_factory=list)

    def to_entity(self) -> Asset:
        return Asset(
            asset_id=self.asset_id,
            asset_type=self.asset_type,
            criticality=self.criticality,
            exposure=self.exposure,
            last_patch_days=self.last_patch_days,
            contains_pii=self.contains_pii,
            internet_exposed=self.internet_exposed,
            quantum_ready=self.quantum_ready,
            runtime=self.runtime,
            identities=self.identities,
        )


class TelemetryModel(BaseModel):
    source: str
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    vector: str = Field(..., description="TTP или тактика MITRE ATT&CK")
    signal_type: str = Field(..., description="edr | ndr | siem | identity | ml")
    detected_by_ai: bool = Field(False, description="Определено ли событие ML/LLM-агентом")

    def to_entity(self) -> Telemetry:
        return Telemetry(
            source=self.source,
            severity=self.severity,
            vector=self.vector,
            signal_type=self.signal_type,
            detected_by_ai=self.detected_by_ai,
        )


class PostureRequest(BaseModel):
    assets: List[AssetModel]
    telemetry: List[TelemetryModel] = Field(default_factory=list)
    threat_level: Literal["low", "elevated", "imminent"] = "low"
    privacy_budget_spent: float = Field(0.12, ge=0.0, le=1.0)


class PostureResponse(BaseModel):
    resilience_index: float
    exposure_index: float
    quantum_safe_score: float
    privacy_budget_remaining: float
    zero_trust_segments: List[dict]
    recommended_controls: List[dict]
    detections: dict
    active_controls: List[dict]


class MovingTargetService(BaseModel):
    name: str
    attack_surface: float = Field(..., ge=0.0, le=1.0)
    runtime: str = Field("kubernetes")
    supports_chaos: bool = False

    def to_entity(self) -> ServiceProfile:
        return ServiceProfile(
            name=self.name,
            attack_surface=self.attack_surface,
            runtime=self.runtime,
            supports_chaos=self.supports_chaos,
        )


class MovingTargetRequest(BaseModel):
    services: List[MovingTargetService]
    base_rotation_minutes: int = Field(45, ge=5, le=720)


@router.post("/posture", summary="Анализ киберустойчивости", response_model=PostureResponse)
def api_posture(payload: PostureRequest) -> PostureResponse:
    try:
        response = evaluate_posture(
            assets=[asset.to_entity() for asset in payload.assets],
            telemetry=[event.to_entity() for event in payload.telemetry],
            threat_level=payload.threat_level,
            privacy_budget_spent=payload.privacy_budget_spent,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PostureResponse(**response)


@router.post("/moving-target", summary="Планирование moving target defense")
def api_moving_target(payload: MovingTargetRequest) -> dict:
    try:
        return plan_moving_target_defense(
            services=[service.to_entity() for service in payload.services],
            base_rotation_minutes=payload.base_rotation_minutes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/controls", summary="Каталог передовых защитных технологий")
def api_controls() -> dict:
    return {"items": CONTROL_LIBRARY, "count": len(CONTROL_LIBRARY)}
