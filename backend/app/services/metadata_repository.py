from __future__ import annotations

import logging
import json
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

try:  # pragma: no cover - optional dependency
    from sqlalchemy import (
        JSON,
        Column,
        DateTime,
        Integer,
        MetaData,
        String,
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


def _ensure_sqlite_path(url: str) -> None:
    if url.startswith("sqlite"):
        location = url.split("///")[-1]
        Path(location).parent.mkdir(parents=True, exist_ok=True)


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
                fallback_sqlite = (
                    Path(settings.object_storage_local_root).parent / "metadata_local.db"
                ).resolve()
                sqlite_url = f"sqlite:///{fallback_sqlite.as_posix()}"
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
