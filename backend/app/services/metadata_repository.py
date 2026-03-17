from __future__ import annotations

import logging
import json
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

try:  # pragma: no cover - optional dependency
    from sqlalchemy import (
        JSON,
        Column,
        DateTime,
        ForeignKey,
        Integer,
        MetaData,
        String,
        Text,
        Table,
        create_engine,
        select,
        update,
        insert,
    )
    from sqlalchemy.engine import Engine
    from sqlalchemy.exc import SQLAlchemyError

    SQLALCHEMY_AVAILABLE = True
except ImportError:  # pragma: no cover
    SQLALCHEMY_AVAILABLE = False
    Engine = Any  # type: ignore[assignment]
    JSONB = None  # type: ignore[assignment]

from ..config import get_settings

if SQLALCHEMY_AVAILABLE:
    try:  # pragma: no cover - optional for sqlite only deployments
        from sqlalchemy.dialects.postgresql import JSONB
    except ImportError:  # pragma: no cover
        JSONB = JSON


logger = logging.getLogger(__name__)
if SQLALCHEMY_AVAILABLE:  # pragma: no cover - exercised in integration environments
    metadata = MetaData()


def _now() -> datetime:
    return datetime.now(timezone.utc)


if SQLALCHEMY_AVAILABLE:  # pragma: no cover
    DATASETS_TABLE = Table(
        "datasets",
        metadata,
        Column("id", String(64), primary_key=True),
        Column("filename", String(512), nullable=False),
        Column("storage_bucket", String(255), nullable=False),
        Column("storage_key", String(1024), nullable=False),
        Column("content_type", String(255), nullable=True),
        Column("size_bytes", Integer, nullable=False),
        Column("checksum", String(128), nullable=False),
        Column("status", String(64), nullable=False, default="uploaded"),
        Column("metadata", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("created_at", DateTime(timezone=True), default=_now, nullable=False),
        Column("updated_at", DateTime(timezone=True), default=_now, onupdate=_now, nullable=False),
    )

    JOBS_TABLE = Table(
        "jobs",
        metadata,
        Column("id", String(128), primary_key=True),
        Column("job_type", String(64), nullable=False),
        Column("dataset_id", String(64), nullable=True),
        Column("status", String(32), nullable=False),
        Column("result", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("error", String(2048), nullable=True),
        Column("created_at", DateTime(timezone=True), default=_now, nullable=False),
        Column("updated_at", DateTime(timezone=True), default=_now, onupdate=_now, nullable=False),
    )

    MODEL_RUNS_TABLE = Table(
        "model_runs",
        metadata,
        Column("id", String(128), primary_key=True),
        Column("user_id", String(128), nullable=True),
        Column("dataset_id", String(128), nullable=True),
        Column("model_type", String(64), nullable=False),
        Column("algorithm", String(128), nullable=False),
        Column("parameters", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("status", String(32), nullable=False, default="queued"),
        Column("error", Text, nullable=True),
        Column("metrics_summary", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("created_at", DateTime(timezone=True), default=_now, nullable=False),
        Column("updated_at", DateTime(timezone=True), default=_now, onupdate=_now, nullable=False),
        Column("started_at", DateTime(timezone=True), nullable=True),
        Column("completed_at", DateTime(timezone=True), nullable=True),
        Column("duration_ms", Integer, nullable=True),
        Column("source_ip", String(64), nullable=True),
        Column("request_id", String(128), nullable=True),
    )

    MODEL_RESULTS_TABLE = Table(
        "model_results",
        metadata,
        Column("id", String(128), primary_key=True),
        Column(
            "run_id",
            String(128),
            ForeignKey("model_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        Column("metrics", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("coefficients", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("residuals", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("diagnostics", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("artifacts_path", String(1024), nullable=True),
        Column("created_at", DateTime(timezone=True), default=_now, nullable=False),
        Column("updated_at", DateTime(timezone=True), default=_now, onupdate=_now, nullable=False),
    )

    ALERTS_TABLE = Table(
        "model_alerts",
        metadata,
        Column("id", String(128), primary_key=True),
        Column("run_id", String(128), ForeignKey("model_runs.id", ondelete="SET NULL"), nullable=True),
        Column("alert_type", String(64), nullable=False),
        Column("severity", String(32), nullable=False, default="info"),
        Column("message", Text, nullable=False),
        Column("threshold", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("payload", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("created_at", DateTime(timezone=True), default=_now, nullable=False),
        Column("resolved_at", DateTime(timezone=True), nullable=True),
    )

    AUDIT_LOGS_TABLE = Table(
        "audit_logs",
        metadata,
        Column("id", String(128), primary_key=True),
        Column("user_id", String(128), nullable=True),
        Column("action", String(64), nullable=False),
        Column("resource", String(255), nullable=False),
        Column("payload", JSONB().with_variant(JSON, "sqlite"), nullable=True),
        Column("ip_address", String(64), nullable=True),
        Column("request_id", String(128), nullable=True),
        Column("created_at", DateTime(timezone=True), default=_now, nullable=False),
    )


@dataclass
class DatasetRecord:
    id: str
    filename: str
    storage_bucket: str
    storage_key: str
    content_type: Optional[str]
    size_bytes: int
    checksum: str
    status: str
    metadata: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime


@dataclass
class ModelRunRecord:
    id: str
    user_id: Optional[str]
    dataset_id: Optional[str]
    model_type: str
    algorithm: str
    parameters: Optional[Dict[str, Any]]
    status: str
    error: Optional[str]
    metrics_summary: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    source_ip: Optional[str]
    request_id: Optional[str]


@dataclass
class ModelResultRecord:
    id: str
    run_id: str
    metrics: Optional[Dict[str, Any]]
    coefficients: Optional[Dict[str, Any]]
    residuals: Optional[Dict[str, Any]]
    diagnostics: Optional[Dict[str, Any]]
    artifacts_path: Optional[str]
    created_at: datetime
    updated_at: datetime


@dataclass
class AlertRecord:
    id: str
    run_id: Optional[str]
    alert_type: str
    severity: str
    message: str
    threshold: Optional[Dict[str, Any]]
    payload: Optional[Dict[str, Any]]
    created_at: datetime
    resolved_at: Optional[datetime]


@dataclass
class AuditLogRecord:
    id: str
    user_id: Optional[str]
    action: str
    resource: str
    payload: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    request_id: Optional[str]
    created_at: datetime


if SQLALCHEMY_AVAILABLE:  # pragma: no cover - relies on optional dependency
    class SqlMetadataRepository:
        """Metadata sink backed by PostgreSQL/SQLite via SQLAlchemy."""

        def __init__(self, engine: Engine) -> None:
            self._engine = engine
            metadata.create_all(self._engine, checkfirst=True)

        def record_dataset_upload(
            self,
            *,
            dataset_id: str,
            filename: str,
            storage_bucket: str,
            storage_key: str,
            content_type: Optional[str],
            size_bytes: int,
            checksum: str,
            quick_extraction: Optional[Dict[str, Any]],
        ) -> DatasetRecord:
            payload = {
                "id": dataset_id,
                "filename": filename,
                "storage_bucket": storage_bucket,
                "storage_key": storage_key,
                "content_type": content_type,
                "size_bytes": size_bytes,
                "checksum": checksum,
                "status": "uploaded",
                "metadata": {"quick_extraction": quick_extraction} if quick_extraction else None,
                "created_at": _now(),
                "updated_at": _now(),
            }
            with self._engine.begin() as connection:
                existing = connection.execute(
                    select(DATASETS_TABLE.c.id).where(DATASETS_TABLE.c.id == dataset_id)
                ).first()
                if existing:
                    connection.execute(
                        update(DATASETS_TABLE)
                        .where(DATASETS_TABLE.c.id == dataset_id)
                        .values(**payload, updated_at=_now())
                    )
                else:
                    connection.execute(insert(DATASETS_TABLE).values(**payload))
            return DatasetRecord(**payload)

        def record_job_event(
            self,
            *,
            job_id: str,
            job_type: str,
            dataset_id: Optional[str],
            status: str,
            result: Optional[Dict[str, Any]] = None,
            error: Optional[str] = None,
        ) -> None:
            payload = {
                "id": job_id,
                "job_type": job_type,
                "dataset_id": dataset_id,
                "status": status,
                "result": result,
                "error": error,
                "updated_at": _now(),
            }
            with self._engine.begin() as connection:
                existing = connection.execute(select(JOBS_TABLE.c.id).where(JOBS_TABLE.c.id == job_id)).first()
                if existing:
                    connection.execute(
                        update(JOBS_TABLE)
                        .where(JOBS_TABLE.c.id == job_id)
                        .values(**payload)
                    )
                else:
                    payload["created_at"] = _now()
                    connection.execute(insert(JOBS_TABLE).values(**payload))


class JsonMetadataRepository:
    """Fallback repository that persists metadata to a local JSON document."""

    def __init__(self, store_path: Path) -> None:
        self._path = Path(store_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        if not self._path.exists():
            self._write({"datasets": {}, "jobs": {}})

    def _read(self) -> Dict[str, Any]:
        try:
            with self._path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            return {"datasets": {}, "jobs": {}}

    def _write(self, payload: Dict[str, Any]) -> None:
        tmp = self._path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        tmp.replace(self._path)

    def record_dataset_upload(
        self,
        *,
        dataset_id: str,
        filename: str,
        storage_bucket: str,
        storage_key: str,
        content_type: Optional[str],
        size_bytes: int,
        checksum: str,
        quick_extraction: Optional[Dict[str, Any]],
    ) -> DatasetRecord:
        now = _now()
        record = {
            "id": dataset_id,
            "filename": filename,
            "storage_bucket": storage_bucket,
            "storage_key": storage_key,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "checksum": checksum,
            "status": "uploaded",
            "metadata": {"quick_extraction": quick_extraction} if quick_extraction else None,
            "created_at": now,
            "updated_at": now,
        }
        persistable = {**record, "created_at": now.isoformat(), "updated_at": now.isoformat()}
        with self._lock:
            state = self._read()
            state.setdefault("datasets", {})[dataset_id] = persistable
            self._write(state)
        return DatasetRecord(**record)

    def record_job_event(
        self,
        *,
        job_id: str,
        job_type: str,
        dataset_id: Optional[str],
        status: str,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
    ) -> None:
        now = _now()
        record = {
            "id": job_id,
            "job_type": job_type,
            "dataset_id": dataset_id,
            "status": status,
            "result": result,
            "error": error,
            "updated_at": now,
        }
        with self._lock:
            state = self._read()
            jobs = state.setdefault("jobs", {})
            existing = jobs.get(job_id)
            if existing:
                created_at = existing.get("created_at")
                record["created_at"] = datetime.fromisoformat(created_at) if isinstance(created_at, str) else now
            else:
                record["created_at"] = now
            jobs[job_id] = {
                **record,
                "created_at": record["created_at"].isoformat(),
                "updated_at": record["updated_at"].isoformat(),
            }
            self._write(state)


class JsonModelTrackingRepository:
    """Fallback tracker storing model runs/results/audits in a JSON document."""

    def __init__(self, store_path: Path) -> None:
        self._path = Path(store_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        if not self._path.exists():
            self._write({"runs": {}, "results": {}, "alerts": {}, "audit_logs": []})

    def _read(self) -> Dict[str, Any]:
        try:
            with self._path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            return {"runs": {}, "results": {}, "alerts": {}, "audit_logs": []}

    def _write(self, payload: Dict[str, Any]) -> None:
        tmp = self._path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        tmp.replace(self._path)

    def _run_from_entry(self, entry: Dict[str, Any]) -> ModelRunRecord:
        def _parse(value: Optional[str]) -> Optional[datetime]:
            if value is None:
                return None
            return datetime.fromisoformat(value)

        return ModelRunRecord(
            id=entry["id"],
            user_id=entry.get("user_id"),
            dataset_id=entry.get("dataset_id"),
            model_type=entry["model_type"],
            algorithm=entry["algorithm"],
            parameters=entry.get("parameters"),
            status=entry["status"],
            error=entry.get("error"),
            metrics_summary=entry.get("metrics_summary"),
            created_at=_parse(entry["created_at"]),
            updated_at=_parse(entry["updated_at"]),
            started_at=_parse(entry.get("started_at")),
            completed_at=_parse(entry.get("completed_at")),
            duration_ms=entry.get("duration_ms"),
            source_ip=entry.get("source_ip"),
            request_id=entry.get("request_id"),
        )

    def _result_from_entry(self, entry: Dict[str, Any]) -> ModelResultRecord:
        def _parse(value: Optional[str]) -> Optional[datetime]:
            if value is None:
                return None
            return datetime.fromisoformat(value)

        return ModelResultRecord(
            id=entry["id"],
            run_id=entry["run_id"],
            metrics=entry.get("metrics"),
            coefficients=entry.get("coefficients"),
            residuals=entry.get("residuals"),
            diagnostics=entry.get("diagnostics"),
            artifacts_path=entry.get("artifacts_path"),
            created_at=_parse(entry["created_at"]),
            updated_at=_parse(entry["updated_at"]),
        )

    def create_model_run(
        self,
        *,
        model_type: str,
        algorithm: str,
        parameters: Optional[Dict[str, Any]],
        dataset_id: Optional[str],
        user_id: Optional[str],
        source_ip: Optional[str],
        request_id: Optional[str],
    ) -> ModelRunRecord:
        now = _now()
        record = {
            "id": uuid.uuid4().hex,
            "model_type": model_type,
            "algorithm": algorithm,
            "parameters": parameters,
            "dataset_id": dataset_id,
            "user_id": user_id,
            "status": "queued",
            "error": None,
            "metrics_summary": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "started_at": None,
            "completed_at": None,
            "duration_ms": None,
            "source_ip": source_ip,
            "request_id": request_id,
        }
        with self._lock:
            state = self._read()
            state["runs"][record["id"]] = record
            self._write(state)
        return self._run_from_entry(record)

    def get_model_run(self, run_id: str) -> Optional[ModelRunRecord]:
        with self._lock:
            state = self._read()
            entry = state["runs"].get(run_id)
            if not entry:
                return None
            return self._run_from_entry(entry)

    def update_model_run(
        self,
        run_id: str,
        *,
        status: Optional[str] = None,
        error: Optional[str] = None,
        metrics_summary: Optional[Dict[str, Any]] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        duration_ms: Optional[int] = None,
    ) -> Optional[ModelRunRecord]:
        with self._lock:
            state = self._read()
            record = state["runs"].get(run_id)
            if not record:
                return None
            if status:
                record["status"] = status
            if error is not None:
                record["error"] = error
            if metrics_summary is not None:
                record["metrics_summary"] = metrics_summary
            if started_at:
                record["started_at"] = started_at.isoformat()
            if completed_at:
                record["completed_at"] = completed_at.isoformat()
            if duration_ms is not None:
                record["duration_ms"] = duration_ms
            record["updated_at"] = _now().isoformat()
            state["runs"][run_id] = record
            self._write(state)
            return self._run_from_entry(record)

    def list_model_runs(self, limit: int = 50) -> List[ModelRunRecord]:
        with self._lock:
            state = self._read()
        records = sorted(
            state["runs"].values(),
            key=lambda entry: entry["created_at"],
            reverse=True,
        )
        return [self._run_from_entry(entry) for entry in records[:limit]]

    def save_model_result(
        self,
        *,
        run_id: str,
        metrics: Optional[Dict[str, Any]],
        coefficients: Optional[Dict[str, Any]],
        residuals: Optional[Dict[str, Any]],
        diagnostics: Optional[Dict[str, Any]],
        artifacts_path: Optional[str],
    ) -> ModelResultRecord:
        now = _now().isoformat()
        record = {
            "id": uuid.uuid4().hex,
            "run_id": run_id,
            "metrics": metrics,
            "coefficients": coefficients,
            "residuals": residuals,
            "diagnostics": diagnostics,
            "artifacts_path": artifacts_path,
            "created_at": now,
            "updated_at": now,
        }
        with self._lock:
            state = self._read()
            state["results"][record["id"]] = record
            self._write(state)
        return self._result_from_entry(record)

    def list_model_results(self, run_id: str) -> List[ModelResultRecord]:
        with self._lock:
            state = self._read()
            entries = [
                entry
                for entry in state["results"].values()
                if entry.get("run_id") == run_id
            ]
        entries.sort(key=lambda entry: entry["created_at"])
        return [self._result_from_entry(entry) for entry in entries]

    def record_alert(
        self,
        *,
        run_id: Optional[str],
        alert_type: str,
        severity: str,
        message: str,
        threshold: Optional[Dict[str, Any]],
        payload: Optional[Dict[str, Any]],
    ) -> AlertRecord:
        now = _now().isoformat()
        record = {
            "id": uuid.uuid4().hex,
            "run_id": run_id,
            "alert_type": alert_type,
            "severity": severity,
            "message": message,
            "threshold": threshold,
            "payload": payload,
            "created_at": now,
            "resolved_at": None,
        }
        with self._lock:
            state = self._read()
            state["alerts"][record["id"]] = record
            self._write(state)
        return AlertRecord(
            id=record["id"],
            run_id=run_id,
            alert_type=alert_type,
            severity=severity,
            message=message,
            threshold=threshold,
            payload=payload,
            created_at=datetime.fromisoformat(now),
            resolved_at=None,
        )

    def resolve_alert(self, alert_id: str) -> None:
        with self._lock:
            state = self._read()
            record = state["alerts"].get(alert_id)
            if not record:
                return
            record["resolved_at"] = _now().isoformat()
            self._write(state)

    def list_alerts(self, run_id: Optional[str] = None, limit: int = 50) -> List[AlertRecord]:
        with self._lock:
            state = self._read()
            alerts = list(state.get("alerts", {}).values())
        if run_id:
            alerts = [entry for entry in alerts if entry.get("run_id") == run_id]
        alerts.sort(key=lambda entry: entry["created_at"], reverse=True)
        sliced = alerts[:limit]
        return [
            AlertRecord(
                id=entry["id"],
                run_id=entry.get("run_id"),
                alert_type=entry["alert_type"],
                severity=entry["severity"],
                message=entry["message"],
                threshold=entry.get("threshold"),
                payload=entry.get("payload"),
                created_at=datetime.fromisoformat(entry["created_at"]),
                resolved_at=datetime.fromisoformat(entry["resolved_at"]) if entry.get("resolved_at") else None,
            )
            for entry in sliced
        ]

    def record_audit_event(
        self,
        *,
        user_id: Optional[str],
        action: str,
        resource: str,
        payload: Optional[Dict[str, Any]],
        ip_address: Optional[str],
        request_id: Optional[str],
    ) -> AuditLogRecord:
        now = _now().isoformat()
        entry = {
            "id": uuid.uuid4().hex,
            "user_id": user_id,
            "action": action,
            "resource": resource,
            "payload": payload,
            "ip_address": ip_address,
            "request_id": request_id,
            "created_at": now,
        }
        with self._lock:
            state = self._read()
            audit_logs = state.get("audit_logs", [])
            audit_logs.append(entry)
            # keep last 2000 records to avoid unbounded growth
            state["audit_logs"] = audit_logs[-2000:]
            self._write(state)
        return AuditLogRecord(
            id=entry["id"],
            user_id=user_id,
            action=action,
            resource=resource,
            payload=payload,
            ip_address=ip_address,
            request_id=request_id,
            created_at=datetime.fromisoformat(now),
        )


if SQLALCHEMY_AVAILABLE:  # pragma: no cover
    class SqlModelTrackingRepository:
        """SQL-backed storage for model runs, results, alerts, and audit records."""

        def __init__(self, engine: Engine) -> None:
            self._engine = engine
            metadata.create_all(self._engine, checkfirst=True)

        def _run_from_row(self, row) -> ModelRunRecord:
            data = row._mapping  # type: ignore[attr-defined]
            return ModelRunRecord(
                id=data["id"],
                user_id=data.get("user_id"),
                dataset_id=data.get("dataset_id"),
                model_type=data["model_type"],
                algorithm=data["algorithm"],
                parameters=data.get("parameters"),
                status=data["status"],
                error=data.get("error"),
                metrics_summary=data.get("metrics_summary"),
                created_at=data["created_at"],
                updated_at=data["updated_at"],
                started_at=data.get("started_at"),
                completed_at=data.get("completed_at"),
                duration_ms=data.get("duration_ms"),
                source_ip=data.get("source_ip"),
                request_id=data.get("request_id"),
            )

        def create_model_run(
            self,
            *,
            model_type: str,
            algorithm: str,
            parameters: Optional[Dict[str, Any]],
            dataset_id: Optional[str],
            user_id: Optional[str],
            source_ip: Optional[str],
            request_id: Optional[str],
        ) -> ModelRunRecord:
            run_id = uuid.uuid4().hex
            now = _now()
            payload = {
                "id": run_id,
                "model_type": model_type,
                "algorithm": algorithm,
                "parameters": parameters,
                "dataset_id": dataset_id,
                "user_id": user_id,
                "status": "queued",
                "error": None,
                "metrics_summary": None,
                "created_at": now,
                "updated_at": now,
                "started_at": None,
                "completed_at": None,
                "duration_ms": None,
                "source_ip": source_ip,
                "request_id": request_id,
            }
            with self._engine.begin() as connection:
                connection.execute(insert(MODEL_RUNS_TABLE).values(**payload))
            return ModelRunRecord(**payload)

        def get_model_run(self, run_id: str) -> Optional[ModelRunRecord]:
            with self._engine.begin() as connection:
                row = connection.execute(
                    select(MODEL_RUNS_TABLE).where(MODEL_RUNS_TABLE.c.id == run_id)
                ).first()
            if not row:
                return None
            return self._run_from_row(row)

        def update_model_run(
            self,
            run_id: str,
            *,
            status: Optional[str] = None,
            error: Optional[str] = None,
            metrics_summary: Optional[Dict[str, Any]] = None,
            started_at: Optional[datetime] = None,
            completed_at: Optional[datetime] = None,
            duration_ms: Optional[int] = None,
        ) -> Optional[ModelRunRecord]:
            values: Dict[str, Any] = {"updated_at": _now()}
            if status:
                values["status"] = status
            if error is not None:
                values["error"] = error
            if metrics_summary is not None:
                values["metrics_summary"] = metrics_summary
            if started_at:
                values["started_at"] = started_at
            if completed_at:
                values["completed_at"] = completed_at
            if duration_ms is not None:
                values["duration_ms"] = duration_ms
            with self._engine.begin() as connection:
                result = connection.execute(
                    update(MODEL_RUNS_TABLE)
                    .where(MODEL_RUNS_TABLE.c.id == run_id)
                    .values(**values)
                    .returning(MODEL_RUNS_TABLE)
                ).first()
            if not result:
                return None
            return self._run_from_row(result)

        def list_model_runs(self, limit: int = 50) -> List[ModelRunRecord]:
            with self._engine.begin() as connection:
                rows = connection.execute(
                    select(MODEL_RUNS_TABLE).order_by(MODEL_RUNS_TABLE.c.created_at.desc()).limit(limit)
                ).fetchall()
            return [self._run_from_row(row) for row in rows]

        def save_model_result(
            self,
            *,
            run_id: str,
            metrics: Optional[Dict[str, Any]],
            coefficients: Optional[Dict[str, Any]],
            residuals: Optional[Dict[str, Any]],
            diagnostics: Optional[Dict[str, Any]],
            artifacts_path: Optional[str],
        ) -> ModelResultRecord:
            record = {
                "id": uuid.uuid4().hex,
                "run_id": run_id,
                "metrics": metrics,
                "coefficients": coefficients,
                "residuals": residuals,
                "diagnostics": diagnostics,
                "artifacts_path": artifacts_path,
                "created_at": _now(),
                "updated_at": _now(),
            }
            with self._engine.begin() as connection:
                connection.execute(insert(MODEL_RESULTS_TABLE).values(**record))
            return ModelResultRecord(**record)

        def list_model_results(self, run_id: str) -> List[ModelResultRecord]:
            with self._engine.begin() as connection:
                rows = connection.execute(
                    select(MODEL_RESULTS_TABLE)
                    .where(MODEL_RESULTS_TABLE.c.run_id == run_id)
                    .order_by(MODEL_RESULTS_TABLE.c.created_at.asc())
                ).fetchall()
            return [
                ModelResultRecord(
                    id=row.id,
                    run_id=row.run_id,
                    metrics=row.metrics,
                    coefficients=row.coefficients,
                    residuals=row.residuals,
                    diagnostics=row.diagnostics,
                    artifacts_path=row.artifacts_path,
                    created_at=row.created_at,
                    updated_at=row.updated_at,
                )
                for row in rows
            ]

        def record_alert(
            self,
            *,
            run_id: Optional[str],
            alert_type: str,
            severity: str,
            message: str,
            threshold: Optional[Dict[str, Any]],
            payload: Optional[Dict[str, Any]],
        ) -> AlertRecord:
            record = {
                "id": uuid.uuid4().hex,
                "run_id": run_id,
                "alert_type": alert_type,
                "severity": severity,
                "message": message,
                "threshold": threshold,
                "payload": payload,
                "created_at": _now(),
                "resolved_at": None,
            }
            with self._engine.begin() as connection:
                connection.execute(insert(ALERTS_TABLE).values(**record))
            return AlertRecord(**record)

        def resolve_alert(self, alert_id: str) -> None:
            with self._engine.begin() as connection:
                connection.execute(
                    update(ALERTS_TABLE)
                    .where(ALERTS_TABLE.c.id == alert_id)
                    .values(resolved_at=_now())
                )

        def list_alerts(self, run_id: Optional[str] = None, limit: int = 50) -> List[AlertRecord]:
            stmt = select(ALERTS_TABLE).order_by(ALERTS_TABLE.c.created_at.desc()).limit(limit)
            if run_id:
                stmt = stmt.where(ALERTS_TABLE.c.run_id == run_id)
            with self._engine.begin() as connection:
                rows = connection.execute(stmt).fetchall()
            return [
                AlertRecord(
                    id=row.id,
                    run_id=row.run_id,
                    alert_type=row.alert_type,
                    severity=row.severity,
                    message=row.message,
                    threshold=row.threshold,
                    payload=row.payload,
                    created_at=row.created_at,
                    resolved_at=row.resolved_at,
                )
                for row in rows
            ]

        def record_audit_event(
            self,
            *,
            user_id: Optional[str],
            action: str,
            resource: str,
            payload: Optional[Dict[str, Any]],
            ip_address: Optional[str],
            request_id: Optional[str],
        ) -> AuditLogRecord:
            record = {
                "id": uuid.uuid4().hex,
                "user_id": user_id,
                "action": action,
                "resource": resource,
                "payload": payload,
                "ip_address": ip_address,
                "request_id": request_id,
                "created_at": _now(),
            }
            with self._engine.begin() as connection:
                connection.execute(insert(AUDIT_LOGS_TABLE).values(**record))
            return AuditLogRecord(**record)
else:  # pragma: no cover
    SqlModelTrackingRepository = None  # type: ignore[assignment]


def _ensure_sqlite_path(url: str) -> None:
    if url.startswith("sqlite"):
        location = url.split("///")[-1]
        candidate = Path(location).parent
        try:
            candidate.mkdir(parents=True, exist_ok=True)
        except OSError:
            fallback = Path(__file__).resolve().parent.parent / "data"
            fallback.mkdir(parents=True, exist_ok=True)


def _safe_local_sqlite_url(candidate: Path, filename: str) -> str:
    try:
        candidate.mkdir(parents=True, exist_ok=True)
        target = (candidate / filename).resolve()
    except OSError:
        fallback = Path(__file__).resolve().parent.parent / "data"
        fallback.mkdir(parents=True, exist_ok=True)
        target = (fallback / filename).resolve()
    return f"sqlite:///{target.as_posix()}"


def _build_sql_repository(database_url: str) -> SqlMetadataRepository:
    _ensure_sqlite_path(database_url)
    engine = create_engine(database_url, future=True)
    return SqlMetadataRepository(engine)


@lru_cache()
def get_metadata_repository():
    settings = get_settings()
    if SQLALCHEMY_AVAILABLE:
        database_url = settings.database_url
        try:
            return _build_sql_repository(database_url)
        except SQLAlchemyError as exc:  # pragma: no cover
            logger.warning(
                "metadata_repository_init_failed for %s: %s",
                database_url,
                exc,
            )
            if not database_url.startswith("sqlite"):
                sqlite_url = _safe_local_sqlite_url(
                    Path(settings.object_storage_local_root).parent,
                    "metadata_local.db",
                )
                try:
                    logger.info(
                        "Falling back to local SQLite metadata repository at %s",
                        sqlite_url,
                    )
                    return _build_sql_repository(sqlite_url)
                except SQLAlchemyError as sqlite_exc:  # pragma: no cover
                    logger.warning(
                        "sqlite_metadata_fallback_failed for %s: %s",
                        sqlite_url,
                        sqlite_exc,
                    )
    fallback_path = Path(settings.object_storage_local_root).parent / "metadata_registry.json"
    logger.info(
        "Using JSON metadata repository",
        extra={"event": "metadata_fallback", "path": str(fallback_path)},
    )
    return JsonMetadataRepository(fallback_path)


def _build_tracking_repository(database_url: str):
    _ensure_sqlite_path(database_url)
    engine = create_engine(database_url, future=True)
    return SqlModelTrackingRepository(engine)


@lru_cache()
def get_model_tracking_repository():
    settings = get_settings()
    if SQLALCHEMY_AVAILABLE:
        database_url = settings.database_url
        try:
            return _build_tracking_repository(database_url)
        except SQLAlchemyError as exc:  # pragma: no cover
            logger.warning(
                "model_tracking_repository_init_failed for %s: %s",
                database_url,
                exc,
            )
            if not database_url.startswith("sqlite"):
                sqlite_url = _safe_local_sqlite_url(
                    Path(settings.object_storage_local_root).parent,
                    "model_tracking_local.db",
                )
                try:
                    return _build_tracking_repository(sqlite_url)
                except SQLAlchemyError as sqlite_exc:  # pragma: no cover
                    logger.warning(
                        "model_tracking_sqlite_fallback_failed for %s: %s",
                        sqlite_url,
                        sqlite_exc,
                    )
    fallback_path = Path(settings.object_storage_local_root).parent / "model_tracking.json"
    logger.info(
        "Using JSON model tracking repository",
        extra={"event": "model_tracking_fallback", "path": str(fallback_path)},
    )
    return JsonModelTrackingRepository(fallback_path)
