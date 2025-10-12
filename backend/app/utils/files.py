"""Shared helpers for working with uploaded datasets and tabular files."""
from __future__ import annotations

import io
import json
import re
from pathlib import Path
from typing import Dict

import pandas as pd
from fastapi import HTTPException

APP_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_DIR = APP_ROOT / "uploads"
DATA_DIR = APP_ROOT / "data"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

_FILE_REGISTRY: Dict[str, str] = {}


def safe_filename(name: str) -> str:
    """Return a safe representation of ``name`` for filesystem usage."""
    if not name:
        return "file"
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", name)


def register_uploaded_file(file_id: str, path: Path) -> None:
    """Remember the absolute ``path`` for the uploaded ``file_id``."""
    _FILE_REGISTRY[file_id] = str(Path(path).resolve())


def resolve_file_path(identifier: str) -> Path:
    """Resolve an uploaded file identifier to an on-disk path.

    Parameters
    ----------
    identifier:
        Either the internal file identifier returned by the upload endpoint,
        a sanitized file name that already exists inside ``UPLOAD_DIR`` or an
        absolute/relative path to a file on disk.
    """

    if not identifier:
        raise HTTPException(status_code=400, detail="File identifier is required")

    if identifier in _FILE_REGISTRY:
        path = Path(_FILE_REGISTRY[identifier])
        if path.exists():
            return path

    candidate = UPLOAD_DIR / safe_filename(identifier)
    if candidate.exists():
        return candidate

    generic = Path(identifier)
    if generic.exists():
        return generic.resolve()

    raise HTTPException(status_code=404, detail="File not found")


def read_table_bytes(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Read ``file_bytes`` into a :class:`pandas.DataFrame` based on ``filename``."""
    ext = Path(filename).suffix.lower()
    if ext in {".xlsx", ".xls"}:
        return pd.read_excel(io.BytesIO(file_bytes))
    if ext in {".csv", ".tsv"}:
        sep = "\t" if ext == ".tsv" else None
        read_kwargs = {"sep": sep}
        if sep is None:
            read_kwargs["engine"] = "python"
        return pd.read_csv(io.BytesIO(file_bytes), **read_kwargs)
    raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")


def load_dataframe_from_identifier(identifier: str) -> pd.DataFrame:
    """Load a dataframe for the given ``identifier``."""
    path = resolve_file_path(identifier)
    with path.open("rb") as handle:
        data = handle.read()
    return read_table_bytes(data, path.name)


def export_json_atomic(path: Path, payload) -> None:
    """Atomically persist JSON payload to disk."""
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2)
    tmp_path.replace(path)


def get_file_registry() -> Dict[str, str]:
    """Expose the in-memory file registry for inspection/testing."""
    return dict(_FILE_REGISTRY)
