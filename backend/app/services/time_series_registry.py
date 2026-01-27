"""Registry and artifact management for time-series models used in the AI Laboratory."""
from __future__ import annotations

import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

APP_DIR = Path(__file__).resolve().parent.parent
MODEL_ROOT = APP_DIR / "data" / "models"
TS_MODEL_DIR = MODEL_ROOT / "time_series"
TS_MODEL_DIR.mkdir(parents=True, exist_ok=True)
REGISTRY_PATH = TS_MODEL_DIR / "time_series_registry.json"

_LOCK = threading.Lock()


def _now_ts() -> int:
    return int(time.time())


def _read_registry() -> List[Dict[str, Any]]:
    if not REGISTRY_PATH.exists():
        return []
    try:
        with REGISTRY_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, list):
            return payload
    except json.JSONDecodeError:
        return []
    return []


def _write_registry(items: List[Dict[str, Any]]) -> None:
    tmp = REGISTRY_PATH.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(items, handle, ensure_ascii=False, indent=2)
    tmp.replace(REGISTRY_PATH)


@dataclass
class ModelMetadata:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    dataset_id: str = ""
    dataset_name: Optional[str] = None
    date_column: str = ""
    value_column: str = ""
    sef_columns: List[str] = field(default_factory=list)
    methods: List[str] = field(default_factory=list)
    horizon: int = 12
    trained_from: Optional[str] = None
    trained_to: Optional[str] = None
    score: Optional[float] = None
    metrics: Dict[str, Any] = field(default_factory=dict)
    status: str = "ready"
    is_active: bool = True
    artifact_dir: str = ""
    ensemble_mode: Optional[str] = None
    created_at: int = field(default_factory=_now_ts)
    updated_at: int = field(default_factory=_now_ts)

    def to_dict(self) -> Dict[str, Any]:
        payload = self.__dict__.copy()
        payload["sef_columns"] = list(self.sef_columns)
        payload["methods"] = list(self.methods)
        return payload


class TimeSeriesModelRegistry:
    """Simple JSON-backed registry for trained time-series models."""

    def list_models(self) -> List[Dict[str, Any]]:
        items = _read_registry()
        return sorted(items, key=lambda entry: entry.get("updated_at", 0), reverse=True)

    def get(self, model_id: str) -> Optional[Dict[str, Any]]:
        if not model_id:
            return None
        for item in self.list_models():
            if item.get("id") == model_id:
                return item
        return None

    def get_active_model(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        if not dataset_id:
            return None
        for item in self.list_models():
            if item.get("dataset_id") == dataset_id and item.get("is_active"):
                return item
        return None

    def save(self, metadata: ModelMetadata) -> Dict[str, Any]:
        record = metadata.to_dict()
        with _LOCK:
            items = _read_registry()
            updated = False
            for idx, existing in enumerate(items):
                if existing.get("id") == record["id"]:
                    items[idx] = record
                    updated = True
                    break
            if not updated:
                items.append(record)
            _write_registry(items)
        return record

    def set_active(self, model_id: str) -> Optional[Dict[str, Any]]:
        with _LOCK:
            items = _read_registry()
            target_dataset: Optional[str] = None
            for entry in items:
                if entry.get("id") == model_id:
                    target_dataset = entry.get("dataset_id")
                    break
            if not target_dataset:
                return None
            for entry in items:
                if entry.get("dataset_id") == target_dataset:
                    entry["is_active"] = entry.get("id") == model_id
            _write_registry(items)
        return self.get(model_id)

    def deactivate(self, model_id: str) -> Optional[Dict[str, Any]]:
        with _LOCK:
            items = _read_registry()
            updated = False
            for entry in items:
                if entry.get("id") == model_id:
                    entry["is_active"] = False
                    updated = True
                    break
            if updated:
                _write_registry(items)
        return self.get(model_id)

    def create_artifact_dir(self, model_id: Optional[str] = None) -> Path:
        mid = model_id or str(uuid.uuid4())
        path = TS_MODEL_DIR / mid
        path.mkdir(parents=True, exist_ok=True)
        return path


registry = TimeSeriesModelRegistry()


__all__ = [
    "ModelMetadata",
    "TimeSeriesModelRegistry",
    "registry",
    "TS_MODEL_DIR",
]
