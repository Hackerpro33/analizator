from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, Column, DateTime, MetaData, String, Table, create_engine, insert, select, update

try:  # pragma: no cover
    from sqlalchemy.dialects.postgresql import JSONB
except Exception:  # pragma: no cover
    JSONB = JSON  # type: ignore

from ..config import get_settings
from .security_event_store import SecurityEventStore, get_security_event_store


metadata = MetaData()


host_status_table = Table(
    "host_protection_status",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("tool", String(64), nullable=False, unique=True),
    Column("status", String(32), nullable=False),
    Column("details_json", JSONB().with_variant(JSON, "sqlite"), nullable=True),
    Column("updated_at", DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)),
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


class HostProtectionService:
    def __init__(self, event_store: SecurityEventStore):
        settings = get_settings()
        self._engine = create_engine(settings.database_url, future=True)
        self._event_store = event_store
        metadata.create_all(self._engine, checkfirst=True)

    def upsert_status(self, *, tool: str, status: str, details: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        now = _now()
        payload = {
            "tool": tool,
            "status": status,
            "details_json": details or {},
            "updated_at": now,
        }
        with self._engine.begin() as connection:
            existing = connection.execute(select(host_status_table.c.id).where(host_status_table.c.tool == tool)).scalar()
            if existing:
                connection.execute(
                    update(host_status_table).where(host_status_table.c.tool == tool).values(**payload)
                )
            else:
                payload["id"] = uuid.uuid4().hex
                connection.execute(insert(host_status_table).values(**payload))
        return self.get_status(tool)

    def list_statuses(self) -> List[Dict[str, Any]]:
        with self._engine.begin() as connection:
            rows = connection.execute(select(host_status_table)).mappings()
            return [
                {
                    "tool": row["tool"],
                    "status": row["status"],
                    "details": row.get("details_json") or {},
                    "updated_at": row.get("updated_at"),
                }
                for row in rows
            ]

    def get_status(self, tool: str) -> Dict[str, Any]:
        with self._engine.begin() as connection:
            row = connection.execute(select(host_status_table).where(host_status_table.c.tool == tool)).mappings().first()
            if not row:
                return {"tool": tool, "status": "unknown", "details": {}, "updated_at": None}
            return {
                "tool": row["tool"],
                "status": row["status"],
                "details": row.get("details_json") or {},
                "updated_at": row.get("updated_at"),
            }

    def ingest_event(self, *, tool: str, message: str, severity: str = "medium", details: Optional[Dict[str, Any]] = None) -> None:
        event = {
            "ts": _now().isoformat(),
            "source": "host_protection",
            "severity": severity,
            "segment": "host",
            "event_type": "host_integrity",
            "dst_host": "host",
            "attack_phase": "impact",
            "technique_category": f"host_{tool}",
            "action": "detected" if severity in {"high", "critical"} else "allowed",
            "message": message,
            "explanation_controls": [tool],
            "raw": {"tool": tool, "details": details or {}},
        }
        self._event_store.ingest_event(event)


host_service_instance: Optional[HostProtectionService] = None


def get_host_protection_service() -> HostProtectionService:
    global host_service_instance
    if host_service_instance is None:
        host_service_instance = HostProtectionService(get_security_event_store())
    return host_service_instance


__all__ = ["get_host_protection_service", "HostProtectionService"]
