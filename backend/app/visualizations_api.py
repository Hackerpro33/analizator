from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import json
import os
import tempfile
import shutil
import os
import time
import uuid


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
VISUALIZATIONS_JSON = STORE_DIR / "visualizations.json"


def _atomic_write_json(path: Path, data: Any):
    fd, tmp_name = tempfile.mkstemp(prefix="visualizations_", suffix=".json", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    os.close(fd)
    fd, tmp_path = tempfile.mkstemp(prefix="visualizations_", suffix=".json", dir=str(path.parent))
    tmp = Path(tmp_path)
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
        candidate = directory / "visualizations.json"
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return []
    return []


def _save_all(items: List[Dict[str, Any]]):
    _atomic_write_json(VISUALIZATIONS_JSON, items)


class VisualizationBase(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = "chart"
    dataset_id: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    summary: Optional[Dict[str, Any]] = None
    tags: List[str] = Field(default_factory=list)
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    z_axis: Optional[str] = None
    insights: Optional[List[str]] = None


class VisualizationCreate(VisualizationBase):
    title: str
    type: str = "chart"


class VisualizationUpdate(VisualizationBase):
    pass


class VisualizationFilterRequest(BaseModel):
    filters: Dict[str, Any] = Field(default_factory=dict)
    order_by: Optional[str] = "-created_at"


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


def _sort_items(items: List[Dict[str, Any]], order_by: Optional[str]) -> List[Dict[str, Any]]:
    if not order_by:
        return items
    reverse = order_by.startswith("-")
    key = order_by.lstrip("-")
    return sorted(items, key=lambda x: x.get(key, 0), reverse=reverse)


@router.get("/list")
def list_visualizations(order_by: Optional[str] = "-created_at"):
    items = [_ensure_dates(item) for item in _load_all()]
    return _sort_items(items, order_by)


@router.post("/create")
def create_visualization(payload: VisualizationCreate):
    items = _load_all()
    viz = payload.model_dump()
    viz["id"] = str(uuid.uuid4())
    viz["created_at"] = int(time.time())
    viz["created_date"] = datetime.utcfromtimestamp(viz["created_at"]).isoformat() + "Z"
    items.append(viz)
    _save_all(items)
    return {"status": "created", "id": viz["id"], "visualization": _ensure_dates(viz)}


@router.get("/{viz_id}")
def get_visualization(viz_id: str):
    for item in _load_all():
        if item.get("id") == viz_id:
            return _ensure_dates(item)
    raise HTTPException(status_code=404, detail="Visualization not found")


@router.put("/{viz_id}")
def update_visualization(viz_id: str, payload: VisualizationUpdate):
    items = _load_all()
    for index, item in enumerate(items):
        if item.get("id") == viz_id:
            updated = item.copy()
            updated.update(payload.model_dump(exclude_unset=True))
            updated["id"] = viz_id
            updated["updated_at"] = int(time.time())
            updated["updated_date"] = datetime.utcfromtimestamp(updated["updated_at"]).isoformat() + "Z"
            if not updated.get("created_at"):
                updated["created_at"] = int(time.time())
            updated["created_date"] = updated.get("created_date") or datetime.utcfromtimestamp(updated["created_at"]).isoformat() + "Z"
            items[index] = updated
            _save_all(items)
            return {"status": "updated", "visualization": _ensure_dates(updated)}
    raise HTTPException(status_code=404, detail="Visualization not found")


@router.delete("/{viz_id}")
def delete_visualization(viz_id: str):
    items = _load_all()
    remaining = [item for item in items if item.get("id") != viz_id]
    if len(remaining) == len(items):
        raise HTTPException(status_code=404, detail="Visualization not found")
    _save_all(remaining)
    return {"status": "deleted", "id": viz_id}


@router.post("/filter")
def filter_visualizations(request: VisualizationFilterRequest):
    items = [_ensure_dates(item) for item in _load_all()]
    result = []
    for item in items:
        match = True
        for key, expected in request.filters.items():
            if item.get(key) != expected:
                match = False
                break
        if match:
            result.append(item)
    return _sort_items(result, request.order_by)
