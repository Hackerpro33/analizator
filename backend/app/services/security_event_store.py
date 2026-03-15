"""Persistence, normalization and analytics for cybersecurity events."""
from __future__ import annotations

import json
import logging
import math
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:  # pragma: no cover - optional dependency in minimal installs
    from redis import Redis
    from redis.exceptions import RedisError
except Exception:  # pragma: no cover
    Redis = None  # type: ignore
    RedisError = Exception  # type: ignore

from sqlalchemy import JSON, Column, DateTime, Integer, MetaData, String, Table, Text, and_, case, create_engine, func, insert, inspect, or_, select, text, update

try:  # pragma: no cover - optional for sqlite
    from sqlalchemy.dialects.postgresql import JSONB
except Exception:  # pragma: no cover
    JSONB = JSON  # type: ignore

from ..config import get_settings


logger = logging.getLogger(__name__)

security_metadata = MetaData()


def _now() -> datetime:
    return datetime.now(timezone.utc)


SEVERITY_ORDER: Dict[str, int] = {"low": 0, "medium": 1, "high": 2, "critical": 3}
SEVERITY_BY_RANK = {rank: name for name, rank in SEVERITY_ORDER.items()}
DEFAULT_SEVERITY = tuple(SEVERITY_ORDER.keys())
INCIDENT_MIN_SEVERITY_RANK = SEVERITY_ORDER["medium"]


security_events_table = Table(
    "security_events",
    security_metadata,
    Column("id", String(64), primary_key=True),
    Column("ts", DateTime(timezone=True), index=True, nullable=False),
    Column("source", String(32), index=True, nullable=False),
    Column("event_type", String(32), index=True, nullable=True),
    Column("segment", String(64), index=True, nullable=True),
    Column("severity", String(16), index=True, nullable=False),
    Column("src_ip", String(64), index=True, nullable=True),
    Column("dst_ip", String(64), index=True, nullable=True),
    Column("dst_host", String(255), index=True, nullable=True),
    Column("dst_service", String(128), index=True, nullable=True),
    Column("user", String(255), index=True, nullable=True),
    Column("action", String(64), nullable=True),
    Column("technique_category", String(64), index=True, nullable=True),
    Column("attack_phase", String(64), index=True, nullable=True),
    Column("message", Text, nullable=True),
    Column("src_geo_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("dst_geo_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("iocs_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("scenario_id", String(64), index=True, nullable=True),
    Column("run_id", String(64), index=True, nullable=True),
    Column("architecture_version_id", String(64), index=True, nullable=True),
    Column("explanation_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("raw_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("ingested_at", DateTime(timezone=True), default=_now, nullable=False, index=True),
)


security_entities_table = Table(
    "entities",
    security_metadata,
    Column("id", String(64), primary_key=True),
    Column("type", String(32), nullable=False, index=True),
    Column("value", String(255), nullable=False, index=True),
    Column("first_seen", DateTime(timezone=True), nullable=False),
    Column("last_seen", DateTime(timezone=True), nullable=False),
    Column("meta_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
)


security_entity_edges_table = Table(
    "entity_edges",
    security_metadata,
    Column("id", String(64), primary_key=True),
    Column("ts_bucket", DateTime(timezone=True), index=True, nullable=False),
    Column("src_entity_id", String(64), index=True, nullable=False),
    Column("dst_entity_id", String(64), index=True, nullable=False),
    Column("edge_type", String(32), index=True, nullable=False),
    Column("count", Integer, nullable=False, default=0),
    Column("severity_max", String(16), nullable=False, default="low"),
)


security_incidents_table = Table(
    "incidents",
    security_metadata,
    Column("id", String(64), primary_key=True),
    Column("created_at", DateTime(timezone=True), nullable=False, default=_now),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=_now),
    Column("title", String(255), nullable=False),
    Column("severity", String(16), nullable=False),
    Column("status", String(32), nullable=False),
    Column("related_entities_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("summary_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("detected_at", DateTime(timezone=True), nullable=True),
    Column("resolved_at", DateTime(timezone=True), nullable=True),
)


@dataclass(frozen=True)
class EventFilters:
    time_from: datetime
    time_to: datetime
    severities: Tuple[str, ...] = DEFAULT_SEVERITY
    segments: Tuple[str, ...] = ()
    sources: Tuple[str, ...] = ()
    event_types: Tuple[str, ...] = ()
    attack_phases: Tuple[str, ...] = ()
    scenario_ids: Tuple[str, ...] = ()
    run_ids: Tuple[str, ...] = ()
    search: Optional[str] = None

    def cache_key(self) -> Tuple[Any, ...]:
        return (
            self.time_from.isoformat(),
            self.time_to.isoformat(),
            self.severities,
            self.segments,
            self.sources,
            self.event_types,
            self.attack_phases,
            self.scenario_ids,
            self.run_ids,
            (self.search or "").lower(),
        )


@dataclass
class SecurityEvent:
    id: str
    ts: datetime
    source: str
    severity: str
    segment: Optional[str]
    event_type: Optional[str]
    src_ip: Optional[str]
    src_geo: Optional[Dict[str, Any]]
    dst_ip: Optional[str]
    dst_host: Optional[str]
    dst_service: Optional[str]
    dst_geo: Optional[Dict[str, Any]]
    user: Optional[str]
    action: Optional[str]
    technique_category: Optional[str]
    attack_phase: Optional[str]
    iocs: Optional[List[Dict[str, Any]]]
    message: Optional[str]
    scenario_id: Optional[str]
    run_id: Optional[str]
    architecture_version_id: Optional[str]
    explanation: Optional[List[str]]
    raw: Optional[Dict[str, Any]]


def _normalize_geo(value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not value or not isinstance(value, dict):
        return None
    result: Dict[str, Any] = {}
    for key in ("country", "city", "asn"):
        if value.get(key):
            result[key] = str(value[key])
    for key in ("lat", "lon"):
        coord = value.get(key)
        if coord is None:
            continue
        try:
            result[key] = float(coord)
        except (TypeError, ValueError):
            continue
    return result or None


class _RedisCache:
    def __init__(self, url: Optional[str]) -> None:
        self._url = url
        self._client: Optional[Redis] = None
        self._disabled = False

    def _ensure(self) -> Optional[Redis]:
        if self._disabled or not self._url or Redis is None:
            return None
        if self._client is not None:
            return self._client
        try:
            self._client = Redis.from_url(self._url, decode_responses=True)
        except Exception as exc:  # pragma: no cover - network specific
            logger.warning("redis_connect_failed", error=str(exc))
            self._disabled = True
            return None
        return self._client

    def get(self, key: str) -> Optional[Any]:
        client = self._ensure()
        if not client:
            return None
        try:
            raw = client.get(key)
        except RedisError as exc:  # pragma: no cover - infra
            logger.warning("redis_read_failed", error=str(exc))
            self._disabled = True
            return None
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    def set(self, key: str, value: Any, ttl: int = 30) -> None:
        client = self._ensure()
        if not client:
            return
        try:
            client.setex(key, ttl, json.dumps(value, default=str))
        except RedisError as exc:  # pragma: no cover - infra
            logger.warning("redis_write_failed", error=str(exc))
            self._disabled = True


class SecurityEventStore:
    """Stores normalized events and exposes analytics-friendly aggregations."""

    def __init__(self, database_url: str, redis_url: Optional[str] = None) -> None:
        self._engine = create_engine(database_url, future=True)
        security_metadata.create_all(self._engine, checkfirst=True)
        self._ensure_event_columns()
        self._cache = _RedisCache(redis_url)

    # Normalization -----------------------------------------------------------------
    @staticmethod
    def normalize_event(payload: Dict[str, Any]) -> SecurityEvent:
        ts = payload.get("ts")
        if isinstance(ts, str):
            try:
                value = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                value = _now()
        elif isinstance(ts, datetime):
            value = ts
        else:
            value = _now()
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        raw_json = None
        raw_payload = payload.get("raw")
        if isinstance(raw_payload, dict):
            raw_json = json.loads(json.dumps(raw_payload))
            encoded = json.dumps(raw_json, ensure_ascii=False)
            while len(encoded) > 4096 and raw_json:
                raw_json.pop(next(iter(raw_json)))
                encoded = json.dumps(raw_json, ensure_ascii=False)

        event = SecurityEvent(
            id=str(payload.get("id") or uuid.uuid4()),
            ts=value,
            source=str(payload.get("source") or payload.get("event_type") or "custom"),
            severity=(str(payload.get("severity")) or "medium").lower(),
            segment=payload.get("segment"),
            event_type=(payload.get("event_type") or payload.get("source") or "custom").lower(),
            src_ip=payload.get("src_ip"),
            src_geo=_normalize_geo(payload.get("src_geo")),
            dst_ip=payload.get("dst_ip"),
            dst_host=payload.get("dst_host"),
            dst_service=payload.get("dst_service"),
            dst_geo=_normalize_geo(payload.get("dst_geo")),
            user=payload.get("user"),
            action=payload.get("action"),
            technique_category=payload.get("technique_category"),
            attack_phase=payload.get("attack_phase"),
            iocs=payload.get("iocs"),
            message=payload.get("message"),
            scenario_id=payload.get("scenario_id"),
            run_id=payload.get("run_id"),
            architecture_version_id=payload.get("architecture_version_id"),
            explanation=payload.get("explanation_controls"),
            raw=raw_json,
        )
        return event

    # CRUD -------------------------------------------------------------------------
    def ingest_event(self, payload: Dict[str, Any]) -> SecurityEvent:
        event = self.normalize_event(payload)
        with self._engine.begin() as connection:
            connection.execute(
                insert(security_events_table).values(
                    id=event.id,
                    ts=event.ts,
                    source=event.source,
                    severity=event.severity,
                    segment=event.segment,
                    event_type=event.event_type,
                    src_ip=event.src_ip,
                    dst_ip=event.dst_ip,
                    dst_host=event.dst_host,
                    dst_service=event.dst_service,
                    user=event.user,
                    action=event.action,
                    technique_category=event.technique_category,
                    attack_phase=event.attack_phase,
                    message=event.message,
                    src_geo_json=event.src_geo,
                    dst_geo_json=event.dst_geo,
                    iocs_json=event.iocs,
                    scenario_id=event.scenario_id,
                    run_id=event.run_id,
                    architecture_version_id=event.architecture_version_id,
                    explanation_json=event.explanation,
                    raw_json=event.raw,
                    ingested_at=_now(),
                )
            )
            self._upsert_entities(connection, event)
            self._maybe_record_incident(connection, event)
        return event

    def bulk_ingest(self, events: Sequence[Dict[str, Any]]) -> List[SecurityEvent]:
        normalized = [self.normalize_event(payload) for payload in events]
        if not normalized:
            return []
        rows = [
            {
                "id": event.id,
                "ts": event.ts,
                "source": event.source,
                "severity": event.severity,
                "segment": event.segment,
                "event_type": event.event_type,
                "src_ip": event.src_ip,
                "dst_ip": event.dst_ip,
                "dst_host": event.dst_host,
                "dst_service": event.dst_service,
                "user": event.user,
                "action": event.action,
                "technique_category": event.technique_category,
                "attack_phase": event.attack_phase,
                "message": event.message,
                "src_geo_json": event.src_geo,
                "dst_geo_json": event.dst_geo,
                "iocs_json": event.iocs,
                "scenario_id": event.scenario_id,
                "run_id": event.run_id,
                "architecture_version_id": event.architecture_version_id,
                "explanation_json": event.explanation,
                "raw_json": event.raw,
                "ingested_at": _now(),
            }
            for event in normalized
        ]
        with self._engine.begin() as connection:
            connection.execute(insert(security_events_table), rows)
            for event in normalized:
                self._upsert_entities(connection, event)
                self._maybe_record_incident(connection, event)
        return normalized

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        with self._engine.begin() as connection:
            result = connection.execute(
                select(security_events_table).where(security_events_table.c.id == event_id)
            ).mappings().first()
        if not result:
            return None
        return self._serialize_event(result)

    def list_events(
        self,
        filters: EventFilters,
        *,
        page: int,
        page_size: int,
    ) -> Dict[str, Any]:
        conditions = self._filters_to_clause(filters)
        offset = max(page - 1, 0) * page_size
        with self._engine.begin() as connection:
            stmt = (
                select(security_events_table)
                .where(and_(*conditions))
                .order_by(security_events_table.c.ts.desc())
                .offset(offset)
                .limit(page_size)
            )
            rows = connection.execute(stmt).mappings().all()
            count_stmt = select(func.count()).select_from(security_events_table).where(and_(*conditions))
            total = connection.execute(count_stmt).scalar_one()
        items = [self._serialize_event(row) for row in rows]
        return {
            "items": items,
            "page": page,
            "pageSize": page_size,
            "total": total,
            "pages": math.ceil(total / page_size) if page_size else 0,
        }

    # Aggregations -----------------------------------------------------------------
    def summary(self, filters: EventFilters) -> Dict[str, Any]:
        def builder() -> Dict[str, Any]:
            with self._engine.begin() as connection:
                conditions = self._filters_to_clause(filters)
                bucket = self._resolve_bucket(filters)
                bucket_expr = self._bucket_expression(bucket)
                eps_stmt = (
                    select(bucket_expr.label("bucket"), func.count().label("count"))
                    .where(and_(*conditions))
                    .group_by(bucket_expr)
                    .order_by(bucket_expr)
                )
                eps = connection.execute(eps_stmt).all()

                severity_stmt = (
                    select(security_events_table.c.severity, func.count())
                    .where(and_(*conditions))
                    .group_by(security_events_table.c.severity)
                )
                severity = connection.execute(severity_stmt).all()

                attack_stmt = (
                    select(security_events_table.c.attack_phase, func.count())
                    .where(and_(*conditions))
                    .group_by(security_events_table.c.attack_phase)
                )
                attacks = connection.execute(attack_stmt).all()

                sources_stmt = (
                    select(security_events_table.c.src_ip, func.count())
                    .where(and_(*conditions, security_events_table.c.src_ip.is_not(None)))
                    .group_by(security_events_table.c.src_ip)
                    .order_by(func.count().desc())
                    .limit(6)
                )
                top_sources = connection.execute(sources_stmt).all()

                targets_stmt = (
                    select(security_events_table.c.dst_host, func.count())
                    .where(and_(*conditions, security_events_table.c.dst_host.is_not(None)))
                    .group_by(security_events_table.c.dst_host)
                    .order_by(func.count().desc())
                    .limit(6)
                )
                top_targets = connection.execute(targets_stmt).all()

                incident_stmt = (
                    select(func.count())
                    .select_from(security_incidents_table)
                    .where(
                        and_(
                            security_incidents_table.c.created_at >= filters.time_from,
                            security_incidents_table.c.created_at <= filters.time_to,
                        )
                    )
                )
                incidents_total = connection.execute(incident_stmt).scalar_one()

                mttr_stmt = (
                    select(
                        func.avg(
                            func.extract("epoch", security_incidents_table.c.resolved_at)
                            - func.extract("epoch", security_incidents_table.c.detected_at)
                        )
                    )
                    .where(
                        and_(
                            security_incidents_table.c.detected_at.is_not(None),
                            security_incidents_table.c.resolved_at.is_not(None),
                        )
                    )
                )
                mttd_stmt = (
                    select(
                        func.avg(
                            func.extract("epoch", security_incidents_table.c.detected_at)
                            - func.extract("epoch", security_incidents_table.c.created_at)
                        )
                    )
                    .where(security_incidents_table.c.detected_at.is_not(None))
                )
                mttr = connection.execute(mttr_stmt).scalar()
                mttd = connection.execute(mttd_stmt).scalar()

            def _format_duration(value: Optional[float]) -> Optional[Dict[str, Any]]:
                if value is None:
                    return None
                minutes = value / 60.0
                return {"minutes": round(minutes, 2)}

            payload = {
                "range": {"from": filters.time_from.isoformat(), "to": filters.time_to.isoformat()},
                "eps": {
                    "bucket": bucket,
                    "trend": [
                        {"bucket": row.bucket.isoformat() if isinstance(row.bucket, datetime) else row.bucket, "value": row.count}
                        for row in eps
                    ],
                },
                "severity": {row.severity or "unknown": row.count for row in severity},
                "attack_phases": [
                    {"phase": row.attack_phase or "unknown", "count": row.count} for row in attacks
                ],
                "top_sources": [
                    {"label": row.src_ip or "unknown", "count": row.count} for row in top_sources
                ],
                "top_targets": [
                    {"label": row.dst_host or "unknown", "count": row.count} for row in top_targets
                ],
                "incidents": {
                    "count": incidents_total,
                    "mttd": _format_duration(mttd),
                    "mttr": _format_duration(mttr),
                },
            }
            return payload

        cache_key = self._cache_key("summary", filters)
        cached = self._cache.get(cache_key)
        if cached:
            return cached
        payload = builder()
        self._cache.set(cache_key, payload, ttl=30)
        return payload

    def map_aggregates(self, filters: EventFilters, *, limit: int = 80) -> Dict[str, Any]:
        def builder() -> Dict[str, Any]:
            with self._engine.begin() as connection:
                conditions = self._filters_to_clause(filters)
                conditions.append(security_events_table.c.src_geo_json.is_not(None))
                conditions.append(security_events_table.c.dst_geo_json.is_not(None))
                severity_expr = self._severity_rank_expression()
                stmt = (
                    select(
                        security_events_table.c.src_geo_json,
                        security_events_table.c.dst_geo_json,
                        func.max(severity_expr).label("severity_rank"),
                        func.max(security_events_table.c.ts).label("last_seen"),
                        func.count().label("count"),
                    )
                    .where(and_(*conditions))
                    .group_by(security_events_table.c.src_geo_json, security_events_table.c.dst_geo_json)
                    .order_by(func.count().desc())
                    .limit(limit)
                )
                rows = connection.execute(stmt).all()
            return {
                "generatedAt": _now().isoformat(),
                "connections": [
                    {
                        "id": f"{idx}",
                        "count": row.count,
                        "severity": SEVERITY_BY_RANK.get(row.severity_rank, "low"),
                        "last_seen": row.last_seen.isoformat() if isinstance(row.last_seen, datetime) else row.last_seen,
                        "source": row.src_geo_json,
                        "target": row.dst_geo_json,
                    }
                    for idx, row in enumerate(rows)
                ],
            }

        cache_key = self._cache_key("map", filters)
        cached = self._cache.get(cache_key)
        if cached:
            return cached
        payload = builder()
        self._cache.set(cache_key, payload, ttl=20)
        return payload

    def heatmap(self, filters: EventFilters, *, mode: str) -> Dict[str, Any]:
        def builder() -> Dict[str, Any]:
            with self._engine.begin() as connection:
                conditions = self._filters_to_clause(filters)
                if mode == "technique_segment":
                    row_field = security_events_table.c.attack_phase
                    col_field = security_events_table.c.segment
                else:
                    row_field = security_events_table.c.segment
                    bucket = self._bucket_expression(self._resolve_bucket(filters, prefer_hour=True))
                    col_field = bucket
                stmt = (
                    select(row_field.label("row"), col_field.label("col"), func.count().label("value"))
                    .where(and_(*conditions))
                    .group_by(row_field, col_field)
                )
                rows = connection.execute(stmt).all()
            matrix = [
                {
                    "row": (row.row.isoformat() if isinstance(row.row, datetime) else row.row) or "unknown",
                    "col": (row.col.isoformat() if isinstance(row.col, datetime) else row.col) or "unknown",
                    "value": row.value,
                }
                for row in rows
            ]
            return {"mode": mode, "matrix": matrix}

        cache_key = self._cache_key(f"heatmap:{mode}", filters)
        cached = self._cache.get(cache_key)
        if cached:
            return cached
        payload = builder()
        self._cache.set(cache_key, payload, ttl=45)
        return payload

    def graph(
        self,
        filters: EventFilters,
        *,
        limit_nodes: int = 80,
        limit_edges: int = 120,
    ) -> Dict[str, Any]:
        def builder() -> Dict[str, Any]:
            with self._engine.begin() as connection:
                conditions = [
                    security_entity_edges_table.c.ts_bucket >= filters.time_from,
                    security_entity_edges_table.c.ts_bucket <= filters.time_to,
                ]
                edge_stmt = (
                    select(security_entity_edges_table)
                    .where(and_(*conditions))
                    .order_by(security_entity_edges_table.c.count.desc())
                    .limit(limit_edges)
                )
                edges = connection.execute(edge_stmt).mappings().all()
                entity_ids = {edge["src_entity_id"] for edge in edges} | {edge["dst_entity_id"] for edge in edges}
                if not entity_ids:
                    return {"nodes": [], "edges": []}
                node_stmt = (
                    select(security_entities_table)
                    .where(security_entities_table.c.id.in_(list(entity_ids)))
                    .limit(limit_nodes)
                )
                nodes = connection.execute(node_stmt).mappings().all()
            node_map = {node["id"]: node for node in nodes}
            serialized_edges = [
                {
                    "id": edge["id"],
                    "source": edge["src_entity_id"],
                    "target": edge["dst_entity_id"],
                    "type": edge["edge_type"],
                    "count": edge["count"],
                    "severity": edge["severity_max"],
                }
                for edge in edges
                if edge["src_entity_id"] in node_map and edge["dst_entity_id"] in node_map
            ]
            serialized_nodes = [
                {
                    "id": node["id"],
                    "type": node["type"],
                    "label": node["value"],
                    "meta": node.get("meta_json") or {},
                }
                for node in nodes
            ]
            return {"nodes": serialized_nodes, "edges": serialized_edges}

        cache_key = self._cache_key("graph", filters, extra=(limit_nodes, limit_edges))
        cached = self._cache.get(cache_key)
        if cached:
            return cached
        payload = builder()
        self._cache.set(cache_key, payload, ttl=25)
        return payload

    # Helpers ----------------------------------------------------------------------
    def _filters_to_clause(self, filters: EventFilters) -> List[Any]:
        conditions: List[Any] = [
            security_events_table.c.ts >= filters.time_from,
            security_events_table.c.ts <= filters.time_to,
        ]
        if filters.severities:
            conditions.append(security_events_table.c.severity.in_(filters.severities))
        if filters.segments:
            conditions.append(security_events_table.c.segment.in_(filters.segments))
        if filters.sources:
            conditions.append(security_events_table.c.source.in_(filters.sources))
        if filters.event_types:
            conditions.append(security_events_table.c.event_type.in_(filters.event_types))
        if filters.attack_phases:
            conditions.append(security_events_table.c.attack_phase.in_(filters.attack_phases))
        if filters.scenario_ids:
            conditions.append(security_events_table.c.scenario_id.in_(filters.scenario_ids))
        if filters.run_ids:
            conditions.append(security_events_table.c.run_id.in_(filters.run_ids))
        if filters.search:
            term = f"%{filters.search.lower()}%"
            conditions.append(
                or_(
                    func.lower(security_events_table.c.src_ip).like(term),
                    func.lower(security_events_table.c.dst_ip).like(term),
                    func.lower(security_events_table.c.dst_host).like(term),
                    func.lower(security_events_table.c.user).like(term),
                )
            )
        return conditions

    def recent_events(self, filters: EventFilters, *, limit: int = 10) -> List[Dict[str, Any]]:
        with self._engine.begin() as connection:
            stmt = (
                select(security_events_table)
                .where(and_(*self._filters_to_clause(filters)))
                .order_by(security_events_table.c.ts.desc())
                .limit(limit)
            )
            rows = connection.execute(stmt).mappings().all()
        return [self._serialize_event(row) for row in rows]

    def _bucket_expression(self, bucket: str):
        if self._engine.dialect.name == "sqlite":
            fmt = {
                "minute": "%Y-%m-%dT%H:%M:00",
                "hour": "%Y-%m-%dT%H:00:00",
                "day": "%Y-%m-%dT00:00:00",
            }.get(bucket, "%Y-%m-%dT%H:%M:00")
            return func.strftime(fmt, security_events_table.c.ts)
        return func.date_trunc(bucket, security_events_table.c.ts)

    def _resolve_bucket(self, filters: EventFilters, *, prefer_hour: bool = False) -> str:
        span = filters.time_to - filters.time_from
        if span <= timedelta(minutes=30):
            return "minute"
        if span <= timedelta(days=2) or prefer_hour:
            return "hour"
        return "day"

    def _serialize_event(self, row: Any) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "ts": row["ts"].isoformat() if isinstance(row["ts"], datetime) else row["ts"],
            "source": row["source"],
            "severity": row["severity"],
            "segment": row["segment"],
            "event_type": row["event_type"],
            "src_ip": row["src_ip"],
            "dst_ip": row["dst_ip"],
            "dst_host": row["dst_host"],
            "dst_service": row["dst_service"],
            "user": row["user"],
            "action": row["action"],
            "technique_category": row.get("technique_category"),
            "attack_phase": row["attack_phase"],
            "message": row["message"],
            "src_geo": row["src_geo_json"],
            "dst_geo": row["dst_geo_json"],
            "iocs": row["iocs_json"],
            "scenario_id": row.get("scenario_id"),
            "run_id": row.get("run_id"),
            "architecture_version_id": row.get("architecture_version_id"),
            "explanation_controls": row.get("explanation_json"),
        }

    def _cache_key(self, prefix: str, filters: EventFilters, extra: Optional[Tuple[Any, ...]] = None) -> str:
        base = list(filters.cache_key())
        if extra:
            base.extend(extra)
        return f"cyber:{prefix}:" + ":".join(str(item) for item in base)

    def _ensure_event_columns(self) -> None:
        inspector = inspect(self._engine)
        try:
            columns = {column["name"] for column in inspector.get_columns("security_events")}
        except Exception:  # pragma: no cover - table missing handled by metadata.create_all
            return
        column_definitions = [
            ("technique_category", "VARCHAR(64)"),
            ("scenario_id", "VARCHAR(64)"),
            ("run_id", "VARCHAR(64)"),
            ("architecture_version_id", "VARCHAR(64)"),
            ("explanation_json", "TEXT"),
        ]
        for name, ddl in column_definitions:
            if name in columns:
                continue
            statement = f"ALTER TABLE security_events ADD COLUMN {name} {ddl}"
            with self._engine.begin() as connection:  # pragma: no cover - executed on first start
                connection.execute(text(statement))

    def _severity_rank_expression(self):
        return case(
            (security_events_table.c.severity == "critical", SEVERITY_ORDER["critical"]),
            (security_events_table.c.severity == "high", SEVERITY_ORDER["high"]),
            (security_events_table.c.severity == "medium", SEVERITY_ORDER["medium"]),
            else_=SEVERITY_ORDER["low"],
        )

    def _upsert_entities(self, connection, event: SecurityEvent) -> None:
        def _touch(entity_type: str, value: Optional[str], meta: Optional[Dict[str, Any]] = None) -> Optional[str]:
            if not value:
                return None
            existing = connection.execute(
                select(security_entities_table.c.id).where(
                    and_(
                        security_entities_table.c.type == entity_type,
                        security_entities_table.c.value == value,
                    )
                )
            ).scalar()
            now = _now()
            if existing:
                connection.execute(
                    update(security_entities_table)
                    .where(security_entities_table.c.id == existing)
                    .values(last_seen=now)
                )
                return existing
            entity_id = uuid.uuid4().hex
            connection.execute(
                insert(security_entities_table).values(
                    id=entity_id,
                    type=entity_type,
                    value=value,
                    first_seen=now,
                    last_seen=now,
                    meta_json=meta,
                )
            )
            return entity_id

        src_id = _touch("ip", event.src_ip, event.src_geo)
        dst_id = _touch("host", event.dst_host or event.dst_ip, {"service": event.dst_service})
        user_id = _touch("user", event.user)

        bucket = event.ts.replace(second=0, microsecond=0)
        if src_id and dst_id:
            self._touch_edge(connection, bucket, src_id, dst_id, "network_connection", event.severity)
        if user_id and dst_id:
            self._touch_edge(connection, bucket, user_id, dst_id, "auth", event.severity)

    def _maybe_record_incident(self, connection, event: SecurityEvent) -> None:
        if not self._should_create_incident(event):
            return
        payload = self._incident_payload_from_event(event)
        if not payload:
            return
        connection.execute(insert(security_incidents_table).values(**payload))

    def _should_create_incident(self, event: Optional[SecurityEvent]) -> bool:
        if not event:
            return False
        severity_rank = SEVERITY_ORDER.get(event.severity or "", 0)
        if severity_rank < INCIDENT_MIN_SEVERITY_RANK:
            return False
        if event.attack_phase and event.attack_phase.lower() == "recon":
            return False
        return True

    def _incident_payload_from_event(self, event: SecurityEvent) -> Optional[Dict[str, Any]]:
        detection_delay, resolution_delay = _incident_delays(event)
        detected_at = event.ts
        created_at = detected_at - detection_delay
        resolved_at = detected_at + resolution_delay
        title = _incident_title(event)
        if not title:
            return None
        summary = {
            "segment": event.segment,
            "dst_host": event.dst_host or event.dst_ip,
            "source": event.source,
            "fingerprint": _incident_fingerprint(event),
            "source_event_id": event.id,
            "attack_phase": event.attack_phase,
        }
        return {
            "id": uuid.uuid4().hex,
            "created_at": created_at,
            "updated_at": _now(),
            "title": title,
            "severity": event.severity,
            "status": "resolved",
            "related_entities_json": _incident_related_entities(event),
            "summary_json": summary,
            "detected_at": detected_at,
            "resolved_at": resolved_at,
        }

    def _touch_edge(
        self,
        connection,
        bucket: datetime,
        src_id: str,
        dst_id: str,
        edge_type: str,
        severity: str,
    ) -> None:
        result = connection.execute(
            select(security_entity_edges_table)
            .where(
                and_(
                    security_entity_edges_table.c.ts_bucket == bucket,
                    security_entity_edges_table.c.src_entity_id == src_id,
                    security_entity_edges_table.c.dst_entity_id == dst_id,
                    security_entity_edges_table.c.edge_type == edge_type,
                )
            )
        ).mappings().first()
        if result:
            new_count = (result["count"] or 0) + 1
            current_rank = SEVERITY_ORDER.get(result["severity_max"], 0)
            new_rank = SEVERITY_ORDER.get(severity, 0)
            update_values = {"count": new_count}
            if new_rank > current_rank:
                update_values["severity_max"] = severity
            connection.execute(
                update(security_entity_edges_table)
                .where(security_entity_edges_table.c.id == result["id"])
                .values(**update_values)
            )
            return
        connection.execute(
            insert(security_entity_edges_table).values(
                id=uuid.uuid4().hex,
                ts_bucket=bucket,
                src_entity_id=src_id,
                dst_entity_id=dst_id,
                edge_type=edge_type,
                count=1,
                severity_max=severity,
            )
        )


def _incident_delays(event: SecurityEvent) -> Tuple[timedelta, timedelta]:
    severity = (event.severity or "medium").lower()
    detection_base = {"low": 9, "medium": 6, "high": 4, "critical": 2}.get(severity, 6)
    resolution_base = {"low": 40, "medium": 28, "high": 20, "critical": 12}.get(severity, 24)
    jitter_seed = _incident_seed(event.id)
    detection_minutes = max(1, detection_base + (jitter_seed % 3) - 1)
    resolution_minutes = max(detection_minutes + 5, resolution_base + ((jitter_seed // 3) % 5) - 2)
    return timedelta(minutes=detection_minutes), timedelta(minutes=resolution_minutes)


def _incident_seed(identifier: Optional[str]) -> int:
    if not identifier:
        return 0
    safe = identifier.replace("-", "")
    try:
        return int(safe[:8], 16)
    except ValueError:
        return sum(ord(char) for char in safe)


def _incident_title(event: SecurityEvent) -> str:
    phase = (event.attack_phase or event.event_type or "activity").replace("_", " ").strip().title()
    target = event.dst_host or event.dst_ip or event.segment or "environment"
    return f"{phase} на {target}"


def _incident_related_entities(event: SecurityEvent) -> List[Dict[str, str]]:
    related: List[Dict[str, str]] = []
    if event.dst_host or event.dst_ip:
        related.append({"type": "host", "value": event.dst_host or event.dst_ip})
    if event.segment:
        related.append({"type": "segment", "value": event.segment})
    if event.user:
        related.append({"type": "user", "value": event.user})
    return related


def _incident_fingerprint(event: SecurityEvent) -> str:
    parts = [
        event.run_id,
        event.scenario_id,
        event.segment,
        event.dst_host or event.dst_ip,
        event.attack_phase,
    ]
    return "|".join(part for part in parts if part)


@lru_cache()
def get_security_event_store() -> SecurityEventStore:
    settings = get_settings()
    return SecurityEventStore(settings.database_url, redis_url=settings.redis_url)


__all__ = [
    "SecurityEvent",
    "SecurityEventStore",
    "EventFilters",
    "get_security_event_store",
]
