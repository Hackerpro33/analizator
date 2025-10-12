from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
import json
import uuid
import time
import tempfile
import shutil
import os

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
    try:
        with tmp_path.open("w", encoding="utf-8") as tmp_file:
            json.dump(data, tmp_file, ensure_ascii=False, indent=2)
        shutil.move(str(tmp_path), str(path))
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)


def _load_all() -> List[Dict[str, Any]]:
    for directory in CANDIDATE_DIRS:
        candidate = directory / "visualizations.json"
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as handle:
                    return json.load(handle)
            except Exception:
                return []
    return []


def _save_all(items: List[Dict[str, Any]]):
    _atomic_write_json(VISUALIZATIONS_JSON, items)


class VisualizationConfig(BaseModel):
    color: Optional[str] = None
    filterConfig: Dict[str, Any] = Field(default_factory=dict)
    crossDataset: Optional[bool] = False
    x_dataset_id: Optional[str] = None
    y_dataset_id: Optional[str] = None
    z_dataset_id: Optional[str] = None
    z_axis: Optional[str] = None

    class Config:
        extra = "allow"


class VisualizationCreate(BaseModel):
    title: str = Field(..., description="Название визуализации")
    type: str = Field("chart", description="Тип визуализации")
    dataset_id: Optional[str] = None
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    description: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    config: VisualizationConfig = Field(default_factory=VisualizationConfig)


class VisualizationUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    dataset_id: Optional[str] = None
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    config: Optional[VisualizationConfig] = None


@router.get("/list")
def list_visualizations():
    items = _load_all()
    items.sort(key=lambda item: item.get("created_at", 0), reverse=True)
    return items


@router.post("/create")
def create_visualization(payload: VisualizationCreate):
    items = _load_all()
    data = payload.dict()
    data["id"] = str(uuid.uuid4())
    data["created_at"] = int(time.time())
    items.append(data)
    _save_all(items)
    return {"status": "created", "id": data["id"], "visualization": data}


@router.put("/{visualization_id}")
def update_visualization(visualization_id: str, payload: VisualizationUpdate):
    items = _load_all()
    for index, item in enumerate(items):
        if item.get("id") == visualization_id:
            update_data = payload.dict(exclude_unset=True)
            if "config" in update_data and isinstance(update_data["config"], VisualizationConfig):
                update_data["config"] = update_data["config"].dict(exclude_unset=True)
            items[index] = {**item, **update_data, "id": visualization_id}
            _save_all(items)
            return {"status": "updated", "id": visualization_id, "visualization": items[index]}
    raise HTTPException(status_code=404, detail="Visualization not found")


@router.delete("/{visualization_id}")
def delete_visualization(visualization_id: str):
    items = _load_all()
    new_items = [item for item in items if item.get("id") != visualization_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Visualization not found")
    _save_all(new_items)
    return {"status": "deleted", "id": visualization_id}
