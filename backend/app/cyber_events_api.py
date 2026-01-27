from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field

from .security import require_roles
from .services.security_event_store import EventFilters, SecurityEventStore, get_security_event_store


router = APIRouter(
    prefix="/cyber",
    tags=["cyber-analytics"],
    dependencies=[Depends(require_roles("admin", "security", "security_viewer"))],
)


def _parse_datetime(value: Optional[str], *, default: datetime) -> datetime:
    if not value:
        return default
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid datetime format") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _flatten(values: Optional[Sequence[str]]) -> Tuple[str, ...]:
    if not values:
        return ()
    result: List[str] = []
    for value in values:
        if not value:
            continue
        for token in value.split(","):
            token = token.strip()
            if token:
                result.append(token.lower())
    return tuple(dict.fromkeys(result))


def _resolve_event_filters(
    *,
    raw_from: Optional[str],
    raw_to: Optional[str],
    range_key: Optional[str],
    severity: Tuple[str, ...],
    segments: Tuple[str, ...],
    sources: Tuple[str, ...],
    event_types: Tuple[str, ...],
    phases: Tuple[str, ...],
    scenarios: Tuple[str, ...],
    runs: Tuple[str, ...],
    search: Optional[str],
) -> EventFilters:
    now = datetime.now(timezone.utc)
    default_span = timedelta(hours=1)
    range_map = {
        "15m": timedelta(minutes=15),
        "1h": timedelta(hours=1),
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
    }
    span = range_map.get((range_key or "").lower(), default_span)
    if raw_from and raw_to:
        time_from = _parse_datetime(raw_from, default=now - span)
        time_to = _parse_datetime(raw_to, default=now)
    else:
        time_to = now
        time_from = now - span

    if time_to <= time_from:
        raise HTTPException(status_code=400, detail="Time range must be positive")

    allowed_severity = {"low", "medium", "high", "critical"}
    filtered_severities = tuple(sev for sev in severity if sev in allowed_severity)
    if not filtered_severities:
        filtered_severities = tuple(sorted(allowed_severity))

    return EventFilters(
        time_from=time_from,
        time_to=time_to,
        severities=filtered_severities,
        segments=segments,
        sources=sources,
        event_types=event_types,
        attack_phases=phases,
        scenario_ids=scenarios,
        run_ids=runs,
        search=search.lower() if search else None,
    )


def _filters_from_params(params: Mapping[str, Sequence[str]]) -> EventFilters:
    def first(key: str) -> Optional[str]:
        values = params.get(key)
        if not values:
            return None
        return values[0]

    event_types: List[str] = []
    for key in ("event_type", "source_type"):
        values = params.get(key)
        if values:
            event_types.extend(values)

    return _resolve_event_filters(
        raw_from=first("from"),
        raw_to=first("to"),
        range_key=first("range"),
        severity=_flatten(params.get("severity")),
        segments=_flatten(params.get("segment")),
        sources=_flatten(params.get("source")),
        event_types=_flatten(event_types),
        phases=_flatten(params.get("phase") or []),
        scenarios=_flatten(params.get("scenario")),
        runs=_flatten(params.get("run_id")),
        search=first("q"),
    )


def build_event_filters(
    raw_from: Optional[str] = Query(None, alias="from"),
    raw_to: Optional[str] = Query(None, alias="to"),
    range_key: Optional[str] = Query(None, alias="range"),
    severity: Optional[List[str]] = Query(None),
    segment: Optional[List[str]] = Query(None),
    source: Optional[List[str]] = Query(None),
    event_type: Optional[List[str]] = Query(None),
    phase: Optional[List[str]] = Query(None),
    scenario: Optional[List[str]] = Query(None),
    run_id: Optional[List[str]] = Query(None),
    q: Optional[str] = Query(None),
) -> EventFilters:
    return _resolve_event_filters(
        raw_from=raw_from,
        raw_to=raw_to,
        range_key=range_key,
        severity=_flatten(severity),
        segments=_flatten(segment),
        sources=_flatten(source),
        event_types=_flatten(event_type),
        phases=_flatten(phase),
        scenarios=_flatten(scenario),
        runs=_flatten(run_id),
        search=q,
    )


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)


def get_pagination(page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)) -> PaginationParams:
    return PaginationParams(page=page, page_size=min(page_size, 200))


class GraphLimiter(BaseModel):
    limit_nodes: int = Field(default=80, ge=10, le=400)
    limit_edges: int = Field(default=120, ge=20, le=600)


def get_graph_limits(
    limit_nodes: int = Query(80, ge=10, le=400, alias="limitNodes"),
    limit_edges: int = Query(120, ge=20, le=600, alias="limitEdges"),
) -> GraphLimiter:
    return GraphLimiter(limit_nodes=limit_nodes, limit_edges=limit_edges)


@router.get("/summary")
def api_cyber_summary(
    filters: EventFilters = Depends(build_event_filters),
    store: SecurityEventStore = Depends(get_security_event_store),
) -> dict:
    return store.summary(filters)


@router.get("/events")
def api_cyber_events(
    pagination: PaginationParams = Depends(get_pagination),
    filters: EventFilters = Depends(build_event_filters),
    store: SecurityEventStore = Depends(get_security_event_store),
) -> dict:
    return store.list_events(filters, page=pagination.page, page_size=pagination.page_size)


@router.get("/map")
def api_cyber_map(
    filters: EventFilters = Depends(build_event_filters),
    store: SecurityEventStore = Depends(get_security_event_store),
    limit: int = Query(80, ge=10, le=200),
) -> dict:
    return store.map_aggregates(filters, limit=limit)


@router.get("/graph")
def api_cyber_graph(
    limits: GraphLimiter = Depends(get_graph_limits),
    filters: EventFilters = Depends(build_event_filters),
    store: SecurityEventStore = Depends(get_security_event_store),
) -> dict:
    return store.graph(filters, limit_nodes=limits.limit_nodes, limit_edges=limits.limit_edges)


@router.get("/heatmap")
def api_cyber_heatmap(
    filters: EventFilters = Depends(build_event_filters),
    store: SecurityEventStore = Depends(get_security_event_store),
    mode: str = Query("segment_time", pattern="^(segment_time|technique_segment)$"),
) -> dict:
    return store.heatmap(filters, mode=mode)


@router.get("/event/{event_id}")
def api_event_detail(
    event_id: str,
    store: SecurityEventStore = Depends(get_security_event_store),
) -> dict:
    event = store.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


class LiveSession:
    def __init__(self, websocket: WebSocket, store: SecurityEventStore, filters: EventFilters):
        self.websocket = websocket
        self.store = store
        self.filters = filters
        self._seen: Dict[str, datetime] = {}

    async def stream(self) -> None:
        await self.websocket.accept()
        try:
            while True:
                payload = self._build_payload()
                if payload["events"]:
                    await self.websocket.send_json(jsonable_encoder(payload))
                await asyncio.sleep(5)
        except WebSocketDisconnect:
            return

    def _build_payload(self) -> Dict[str, Any]:
        events = self.store.recent_events(self.filters, limit=20)
        fresh = []
        for event in events:
            if event["id"] in self._seen:
                continue
            fresh.append(event)
            self._seen[event["id"]] = datetime.now(timezone.utc)
        self._evict_seen()
        summary = self.store.summary(self.filters)
        return {"channel": "cyber:event", "events": fresh, "summary": summary}

    def _evict_seen(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        stale = [event_id for event_id, ts in self._seen.items() if ts < cutoff]
        for event_id in stale:
            self._seen.pop(event_id, None)


@router.websocket("/cyber/live")
async def cyber_live(
    websocket: WebSocket,
    store: SecurityEventStore = Depends(get_security_event_store),
) -> None:
    params = {}
    for key in websocket.query_params.keys():
        params.setdefault(key, [])
        params[key].extend(websocket.query_params.getlist(key))
    filters = _filters_from_params(params)
    session = LiveSession(websocket, store, filters)
    await session.stream()


__all__ = ["router"]
