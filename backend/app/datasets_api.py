from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import json
import os
import time
import uuid
import tempfile
import shutil


router = APIRouter()

APP_DIR = Path(__file__).resolve().parent
CANDIDATE_DIRS = [APP_DIR.parent / "data", APP_DIR / "data"]


def _ensure_store_dir() -> Path:
    for directory in CANDIDATE_DIRS:
        try:
            directory.mkdir(parents=True, exist_ok=True)
            return directory
        except Exception:
            continue
    APP_DIR.mkdir(parents=True, exist_ok=True)
    return APP_DIR


STORE_DIR = _ensure_store_dir()
DATASETS_JSON = STORE_DIR / "datasets.json"


def _atomic_write_json(path: Path, data: Any):
    fd, tmp_path = tempfile.mkstemp(prefix="datasets_", suffix=".json", dir=str(path.parent))
    tmp = Path(tmp_path)
    # close the descriptor immediately, we'll reopen via Path
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        shutil.move(str(tmp), str(path))
    finally:
        try:
            tmp.unlink()
        except FileNotFoundError:
            pass


def _load_all() -> List[Dict[str, Any]]:
    for directory in CANDIDATE_DIRS:
        candidate = directory / "datasets.json"
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
    return []


def _save_all(items: List[Dict[str, Any]]):
    _atomic_write_json(DATASETS_JSON, items)


class ColumnInfo(BaseModel):
    name: str
    type: str = "string"
    selected: Optional[bool] = True


class DatasetBase(BaseModel):
    name: Optional[str] = Field(None, description="Название набора")
    description: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    columns: List[ColumnInfo] = Field(default_factory=list)
    file_url: Optional[str] = None
    row_count: Optional[int] = None
    sample_data: Optional[List[Dict[str, Any]]] = None


class DatasetCreate(DatasetBase):
    name: str = Field(..., description="Название набора")


class DatasetUpdate(DatasetBase):
    pass


def _ensure_dates(item: Dict[str, Any]) -> Dict[str, Any]:
    created_at = item.get("created_at")
    if not created_at:
        created_date = item.get("created_date")
        if created_date:
            try:
                created_at = int(datetime.fromisoformat(created_date.replace("Z", "+00:00")).timestamp())
            except Exception:
                created_at = int(time.time())
        else:
            created_at = int(time.time())
    item["created_at"] = created_at
    if not item.get("created_date"):
        item["created_date"] = datetime.utcfromtimestamp(created_at).isoformat() + "Z"

    updated_at = item.get("updated_at")
    if updated_at and not item.get("updated_date"):
        item["updated_date"] = datetime.utcfromtimestamp(updated_at).isoformat() + "Z"
    return item


@router.get("/list")
def list_datasets(order_by: Optional[str] = "-created_at"):
    items = [_ensure_dates(item) for item in _load_all()]
    if order_by:
        reverse = order_by.startswith("-")
        key = order_by.lstrip("-")
        items.sort(key=lambda x: x.get(key, 0), reverse=reverse)
    return items


@router.post("/create")
def create_dataset(payload: DatasetCreate):
    items = _load_all()
    dataset = payload.model_dump()
    dataset["id"] = str(uuid.uuid4())
    dataset["created_at"] = int(time.time())
    dataset["created_date"] = datetime.utcfromtimestamp(dataset["created_at"]).isoformat() + "Z"
    items.append(dataset)
    _save_all(items)
    return {"status": "created", "id": dataset["id"], "dataset": _ensure_dates(dataset)}


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    for item in _load_all():
        if item.get("id") == dataset_id:
            return _ensure_dates(item)
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.put("/{dataset_id}")
def update_dataset(dataset_id: str, payload: DatasetUpdate):
    items = _load_all()
    for index, item in enumerate(items):
        if item.get("id") == dataset_id:
            updated = item.copy()
            updated.update(payload.model_dump(exclude_unset=True))
            updated["id"] = dataset_id
            updated["updated_at"] = int(time.time())
            updated["updated_date"] = datetime.utcfromtimestamp(updated["updated_at"]).isoformat() + "Z"
            if not updated.get("created_at"):
                updated["created_at"] = int(time.time())
            updated["created_date"] = updated.get("created_date") or datetime.utcfromtimestamp(updated["created_at"]).isoformat() + "Z"
            items[index] = updated
            _save_all(items)
            return {"status": "updated", "dataset": _ensure_dates(updated)}
    raise HTTPException(status_code=404, detail="Dataset not found")


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str):
    items = _load_all()
    remaining = [item for item in items if item.get("id") != dataset_id]
    if len(remaining) == len(items):
        raise HTTPException(status_code=404, detail="Dataset not found")
    _save_all(remaining)
    return {"status": "deleted", "id": dataset_id}


if os.getenv("ENABLE_DATASET_DEBUG_ENDPOINT") == "1":
    @router.get("/debug/paths")
    def debug_paths():
        return {
            "APP_DIR": str(APP_DIR),
            "STORE_DIR": str(STORE_DIR),
            "DATASETS_JSON": str(DATASETS_JSON),
            "exists": DATASETS_JSON.exists(),
            "size": DATASETS_JSON.stat().st_size if DATASETS_JSON.exists() else 0,
        }
