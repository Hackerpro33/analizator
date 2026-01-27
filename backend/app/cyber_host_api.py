from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from .config import get_settings
from .security import require_private_lab_access, require_roles
from .services.host_protection import get_host_protection_service
from .services.security_event_store import DEFAULT_SEVERITY, EventFilters, get_security_event_store


router = APIRouter(
    prefix="/cyber/host",
    tags=["host-protection"],
    dependencies=[Depends(require_roles("admin", "security", "security_viewer"))],
)


class HostStatusPayload(BaseModel):
    tool: str = Field(..., pattern="^[a-zA-Z0-9_-]+$")
    status: str = Field(..., pattern="^(ok|drift|alert|error|unknown)$")
    details: Dict[str, str] = Field(default_factory=dict)
    message: Optional[str] = None
    severity: str = Field("medium", pattern="^(low|medium|high|critical)$")


@router.get("")
def get_host_status(limit_events: int = 50):
    service = get_host_protection_service()
    status = service.list_statuses()
    store = get_security_event_store()
    filters = EventFilters(
        time_from=_default_time_from(),
        time_to=_now(),
        severities=DEFAULT_SEVERITY,
        segments=(),
        sources=("host_protection",),
        event_types=(),
        attack_phases=(),
        scenario_ids=(),
        run_ids=(),
        search=None,
    )
    events = store.recent_events(filters, limit=limit_events)
    return {"status": status, "events": events}


@router.post(
    "",
    dependencies=[Depends(require_private_lab_access)],
)
def update_host_status(
    payload: List[HostStatusPayload],
    agent_token: Optional[str] = Header(default=None, alias="X-Host-Agent-Token"),
):
    settings = get_settings()
    if settings.host_agent_token:
        if not agent_token or agent_token != settings.host_agent_token:
            raise HTTPException(status_code=401, detail="Invalid host agent token")
    service = get_host_protection_service()
    results = []
    for item in payload:
        status = service.upsert_status(tool=item.tool, status=item.status, details=item.details)
        if item.message:
            service.ingest_event(
                tool=item.tool,
                message=item.message,
                severity=item.severity,
                details=item.details,
            )
        results.append(status)
    return {"status": results}


def _now():
    return datetime.now(timezone.utc)


def _default_time_from():
    return _now() - timedelta(days=7)
