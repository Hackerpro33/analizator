from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional


APP_DIR = Path(__file__).resolve().parent.parent
_CANDIDATE_DIRS = [
    APP_DIR.parent / "data",
    APP_DIR / "data",
]


def _dataset_store_path() -> Path:
    for directory in _CANDIDATE_DIRS:
        candidate = directory / "datasets.json"
        if candidate.exists():
            return candidate
    fallback_dir = _CANDIDATE_DIRS[0]
    fallback_dir.mkdir(parents=True, exist_ok=True)
    return fallback_dir / "datasets.json"


DATASETS_PATH = _dataset_store_path()
DATASET_ROOT = DATASETS_PATH.parent


def list_datasets() -> List[Dict[str, Any]]:
    try:
        with DATASETS_PATH.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, list):
            return payload
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        return []
    return []


def get_dataset(dataset_id: str) -> Optional[Dict[str, Any]]:
    if not dataset_id:
        return None
    for item in list_datasets():
        if item.get("id") == dataset_id:
            return item
    return None


def get_dataset_file(dataset_id: Optional[str], file_url: Optional[str]) -> Optional[str]:
    reference = file_url
    if not reference and dataset_id:
        dataset = get_dataset(dataset_id)
        if dataset:
            reference = dataset.get("file_url")
    if not reference:
        return None
    resolved = _resolve_reference(reference)
    return resolved or reference


def _resolve_reference(reference: str) -> Optional[str]:
    """Return an absolute path for ``reference`` when it points to a repo file."""

    path = Path(reference)
    if path.is_absolute() and path.exists():
        return str(path)

    relative_candidates = [
        DATASET_ROOT / path,
        APP_DIR / path,
        APP_DIR.parent / path,
    ]
    for candidate in relative_candidates:
        if candidate.exists():
            return str(candidate.resolve())
    return None
