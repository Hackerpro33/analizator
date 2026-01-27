"""Persistent storage for Линейка dataset версий и пайплайнов."""
from __future__ import annotations

import json
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd
from pandas.api.types import is_datetime64_any_dtype, is_numeric_dtype

from ..utils.files import DATA_DIR, export_json_atomic, load_dataframe_from_identifier
from .dataset_store import get_dataset, get_dataset_file

# NOTE: Наборы данных по умолчанию лежат в uploads/data и идентифицируются dataset_id
# из datasets.json. Для Линейки мы сохраняем материализованные версии рядом
# в app/data/lineyka/versions/{dataset_id}.csv, чтобы не переписывать исходные файлы.
# Этого достаточно при объеме до ~250k строк и 150 колонок, что соответствует текущим
# ограничениям UI (виртуализированная таблица подгружает страницы по 2k строк).

LINEYKA_ROOT = DATA_DIR / "lineyka"
VERSIONS_DIR = LINEYKA_ROOT / "versions"
META_PATH = LINEYKA_ROOT / "metadata.json"

RESERVED_COLUMNS = {"__lineyka_row_id"}


class DatasetNotFound(ValueError):
    """Raised when dataset metadata cannot be located."""


class VersionNotFound(ValueError):
    """Raised when a requested version is missing."""


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _infer_column_type(series: pd.Series) -> str:
    if is_numeric_dtype(series):
        return "number"
    if is_datetime64_any_dtype(series):
        return "date"
    return "string"


def _safe_name(name: Any) -> str:
    return str(name) if name is not None else ""


def _as_serializable(value: Any) -> Any:
    if isinstance(value, (datetime, )):
        return value.isoformat()
    return value


def _normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    normalized = df.copy()
    normalized.columns = [_safe_name(column) for column in normalized.columns]
    if "__lineyka_row_id" not in normalized.columns:
        normalized.insert(0, "__lineyka_row_id", range(1, len(normalized) + 1))
    return normalized


def _date_range(df: pd.DataFrame) -> Optional[Tuple[str, str]]:
    for column in df.columns:
        if column in RESERVED_COLUMNS:
            continue
        series = pd.to_datetime(df[column], errors="coerce")
        if series.notna().sum() >= len(series) * 0.4:
            start = series.min()
            end = series.max()
            if pd.isna(start) or pd.isna(end):
                continue
            return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    return None


def _missing_overview(df: pd.DataFrame) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for column in df.columns:
        if column in RESERVED_COLUMNS:
            continue
        missing_ratio = float(df[column].isna().mean())
        rows.append({"column": column, "missing_ratio": missing_ratio})
    return rows


def _schema(df: pd.DataFrame) -> List[Dict[str, Any]]:
    schema: List[Dict[str, Any]] = []
    for column in df.columns:
        if column in RESERVED_COLUMNS:
            continue
        schema.append(
            {"name": column, "type": _infer_column_type(df[column])}
        )
    return schema


def _build_summary(df: pd.DataFrame) -> Dict[str, Any]:
    summary = {
        "row_count": int(len(df)),
        "column_count": int(len([c for c in df.columns if c not in RESERVED_COLUMNS])),
        "missing": _missing_overview(df),
        "date_range": None,
    }
    drange = _date_range(df)
    if drange:
        summary["date_range"] = {"start": drange[0], "end": drange[1]}
    return summary


@dataclass
class VersionRecord:
    dataset_id: str
    version_id: str
    file_path: Path
    row_count: int
    column_count: int
    created_at: str
    created_by: Optional[str]
    parent_version_id: Optional[str]
    schema: List[Dict[str, Any]]
    summary: Dict[str, Any]
    operation: Dict[str, Any]
    pipeline: List[Dict[str, Any]]


class LineykaStore:
    """Tracks версии наборов для Линейки и обеспечивает материализацию DataFrame."""

    def __init__(self) -> None:
        LINEYKA_ROOT.mkdir(parents=True, exist_ok=True)
        VERSIONS_DIR.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _load_meta(self) -> Dict[str, Any]:
        if not META_PATH.exists():
            return {"datasets": {}}
        try:
            with META_PATH.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
            if isinstance(payload, dict) and "datasets" in payload:
                return payload
        except json.JSONDecodeError:
            return {"datasets": {}}
        return {"datasets": {}}

    def _save_meta(self, payload: Dict[str, Any]) -> None:
        export_json_atomic(META_PATH, payload)

    def _dataset_entry(self, dataset_id: str) -> Dict[str, Any]:
        meta = self._load_meta()
        entry = meta["datasets"].get(dataset_id)
        if entry:
            return entry
        dataset = get_dataset(dataset_id)
        if not dataset:
            raise DatasetNotFound(f"Dataset {dataset_id} not found")
        entry = {
            "dataset_id": dataset_id,
            "dataset_name": dataset.get("name") or dataset_id,
            "versions": [],
            "audits": {},
        }
        meta["datasets"][dataset_id] = entry
        self._save_meta(meta)
        return entry

    def _write_version_file(self, dataset_id: str, version_id: str, df: pd.DataFrame) -> Path:
        dataset_dir = VERSIONS_DIR / dataset_id
        dataset_dir.mkdir(parents=True, exist_ok=True)
        target = dataset_dir / f"{version_id}.csv"
        df.to_csv(target, index=False)
        return target

    def _version_from_entry(self, dataset_id: str, payload: Dict[str, Any]) -> VersionRecord:
        file_path = Path(payload["file_path"])
        return VersionRecord(
            dataset_id=dataset_id,
            version_id=payload["version_id"],
            file_path=file_path,
            row_count=payload["row_count"],
            column_count=payload["column_count"],
            created_at=payload["created_at"],
            created_by=payload.get("created_by"),
            parent_version_id=payload.get("parent_version_id"),
            schema=payload.get("schema", []),
            summary=payload.get("summary", {}),
            operation=payload.get("operation", {}),
            pipeline=payload.get("pipeline", []),
        )

    def ensure_base_version(self, dataset_id: str, *, user_id: Optional[str]) -> VersionRecord:
        """Materialize первый снапшот, если он отсутствует."""
        with self._lock:
            meta = self._load_meta()
            entry = meta["datasets"].get(dataset_id)
            if entry and entry.get("versions"):
                latest = entry["versions"][-1]
                return self._version_from_entry(dataset_id, latest)

        dataset = get_dataset(dataset_id)
        if not dataset:
            raise DatasetNotFound(f"Dataset {dataset_id} not found")
        file_reference = get_dataset_file(dataset_id, dataset.get("file_url"))
        if not file_reference:
            raise DatasetNotFound(f"Dataset {dataset_id} is missing file reference")
        df = load_dataframe_from_identifier(file_reference)
        df = _normalize_dataframe(df)
        version_id = f"v-{uuid.uuid4().hex}"
        file_path = self._write_version_file(dataset_id, version_id, df)
        schema = _schema(df)
        summary = _build_summary(df)
        version_entry = {
            "version_id": version_id,
            "parent_version_id": None,
            "file_path": str(file_path),
            "row_count": summary["row_count"],
            "column_count": summary["column_count"],
            "created_at": _utcnow(),
            "created_by": user_id,
            "schema": schema,
            "summary": summary,
            "operation": {"type": "initial", "params": {"source": dataset.get("file_url")}},
            "pipeline": [],
        }
        with self._lock:
            meta = self._load_meta()
            entry = meta["datasets"].setdefault(
                dataset_id,
                {
                    "dataset_id": dataset_id,
                    "dataset_name": dataset.get("name") or dataset_id,
                    "versions": [],
                    "audits": {},
                },
            )
            entry["versions"].append(version_entry)
            self._save_meta(meta)
        return self._version_from_entry(dataset_id, version_entry)

    def list_datasets(self) -> List[Dict[str, Any]]:
        meta = self._load_meta()
        items: List[Dict[str, Any]] = []
        for dataset_id, entry in meta.get("datasets", {}).items():
            versions = entry.get("versions", [])
            latest = versions[-1] if versions else None
            dataset = get_dataset(dataset_id) or {}
            items.append(
                {
                    "dataset_id": dataset_id,
                    "dataset_name": entry.get("dataset_name") or dataset.get("name") or dataset_id,
                    "versions": len(versions),
                    "latest_version": latest["version_id"] if latest else None,
                    "row_count": latest["row_count"] if latest else dataset.get("row_count"),
                    "column_count": latest["column_count"] if latest else len(dataset.get("columns") or []),
                    "updated_at": latest["created_at"] if latest else dataset.get("updated_date"),
                }
            )
        return items

    def get_versions(self, dataset_id: str) -> List[VersionRecord]:
        entry = self._dataset_entry(dataset_id)
        return [self._version_from_entry(dataset_id, payload) for payload in entry.get("versions", [])]

    def get_version(self, dataset_id: str, version_id: str) -> VersionRecord:
        entry = self._dataset_entry(dataset_id)
        for payload in entry.get("versions", []):
            if payload["version_id"] == version_id:
                return self._version_from_entry(dataset_id, payload)
        raise VersionNotFound(f"{dataset_id}:{version_id} missing")

    def load_dataframe(self, dataset_id: str, version_id: str) -> pd.DataFrame:
        record = self.get_version(dataset_id, version_id)
        if not record.file_path.exists():
            raise VersionNotFound(f"Файл версии {version_id} отсутствует")
        df = pd.read_csv(record.file_path)
        return _normalize_dataframe(df)

    def _persist_version(
        self,
        dataset_id: str,
        df: pd.DataFrame,
        *,
        parent_version_id: Optional[str],
        user_id: Optional[str],
        operation: Dict[str, Any],
        pipeline: Iterable[Dict[str, Any]],
    ) -> VersionRecord:
        normalized = _normalize_dataframe(df)
        summary = _build_summary(normalized)
        version_id = f"v-{uuid.uuid4().hex}"
        file_path = self._write_version_file(dataset_id, version_id, normalized)
        schema = _schema(normalized)
        entry = {
            "version_id": version_id,
            "parent_version_id": parent_version_id,
            "file_path": str(file_path),
            "row_count": summary["row_count"],
            "column_count": summary["column_count"],
            "created_at": _utcnow(),
            "created_by": user_id,
            "schema": schema,
            "summary": summary,
            "operation": operation,
            "pipeline": list(pipeline),
        }
        with self._lock:
            meta = self._load_meta()
            dataset_entry = meta["datasets"].setdefault(
                dataset_id,
                {
                    "dataset_id": dataset_id,
                    "dataset_name": dataset_id,
                    "versions": [],
                    "audits": {},
                },
            )
            dataset_entry["versions"].append(entry)
            self._save_meta(meta)
        return self._version_from_entry(dataset_id, entry)

    def create_version(
        self,
        dataset_id: str,
        parent_version_id: str,
        df: pd.DataFrame,
        *,
        user_id: Optional[str],
        operation: Dict[str, Any],
    ) -> VersionRecord:
        parent = self.get_version(dataset_id, parent_version_id)
        pipeline = list(parent.pipeline)
        operation_event = {
            "id": f"op-{uuid.uuid4().hex}",
            "timestamp": _utcnow(),
            "user_id": user_id,
            "type": operation.get("type"),
            "params": operation.get("params"),
            "summary": operation.get("summary"),
        }
        pipeline.append(operation_event)
        return self._persist_version(
            dataset_id,
            df,
            parent_version_id=parent.version_id,
            user_id=user_id,
            operation=operation,
            pipeline=pipeline,
        )

    def duplicate_version(
        self,
        dataset_id: str,
        source_version_id: str,
        *,
        user_id: Optional[str],
        reason: str,
    ) -> VersionRecord:
        source = self.load_dataframe(dataset_id, source_version_id)
        operation = {"type": "revert", "params": {"source_version_id": source_version_id, "reason": reason}}
        return self.create_version(dataset_id, source_version_id, source, user_id=user_id, operation=operation)

    def record_audit(self, dataset_id: str, version_id: str, report: Dict[str, Any]) -> None:
        with self._lock:
            meta = self._load_meta()
            entry = meta["datasets"].setdefault(
                dataset_id,
                {"dataset_id": dataset_id, "dataset_name": dataset_id, "versions": [], "audits": {}},
            )
            entry.setdefault("audits", {})[version_id] = report
            self._save_meta(meta)

    def get_audit(self, dataset_id: str, version_id: str) -> Optional[Dict[str, Any]]:
        entry = self._dataset_entry(dataset_id)
        audits = entry.get("audits") or {}
        return audits.get(version_id)

    def export_history(self, dataset_id: str) -> Dict[str, Any]:
        entry = self._dataset_entry(dataset_id)
        return {
            "dataset_id": dataset_id,
            "versions": [
                {
                    "version_id": ver["version_id"],
                    "parent_version_id": ver.get("parent_version_id"),
                    "created_at": ver["created_at"],
                    "created_by": ver.get("created_by"),
                    "operation": ver.get("operation"),
                    "row_count": ver["row_count"],
                    "column_count": ver["column_count"],
                    "summary": ver.get("summary"),
                    "pipeline": ver.get("pipeline"),
                }
                for ver in entry.get("versions", [])
            ],
        }


store = LineykaStore()


__all__ = ["store", "LineykaStore", "DatasetNotFound", "VersionNotFound", "VersionRecord", "RESERVED_COLUMNS"]
