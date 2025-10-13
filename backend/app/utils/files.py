"""Shared helpers for working with uploaded datasets and tabular files."""
from __future__ import annotations

import io
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List

import pandas as pd
import pdfplumber
import pytesseract
from PIL import Image
from fastapi import HTTPException

APP_ROOT = Path(__file__).resolve().parent.parent
UPLOAD_DIR = APP_ROOT / "uploads"
DATA_DIR = APP_ROOT / "data"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

_FILE_REGISTRY: Dict[str, str] = {}


def _normalize_table_rows(rows: Iterable[Iterable[str]]) -> List[List[str]]:
    """Return a normalized representation of ``rows``.

    Empty rows and trailing whitespace are stripped. The resulting list will
    always contain at least one non-empty row or raise an :class:`HTTPException`.
    """

    normalized: List[List[str]] = []
    max_len = 0
    for raw_row in rows:
        if not raw_row:
            continue
        cleaned = ["" if cell is None else str(cell).strip() for cell in raw_row]
        if not any(cleaned):
            continue
        normalized.append(cleaned)
        max_len = max(max_len, len(cleaned))

    if not normalized:
        raise HTTPException(status_code=400, detail="Table does not contain any values")

    for idx, row in enumerate(normalized):
        if len(row) < max_len:
            normalized[idx] = row + [""] * (max_len - len(row))
        elif len(row) > max_len:
            normalized[idx] = row[:max_len]

    return normalized


def _rows_to_dataframe(rows: Iterable[Iterable[str]]) -> pd.DataFrame:
    """Convert ``rows`` into a :class:`pandas.DataFrame`.

    The first row is treated as the header. Missing header values are replaced
    with automatically generated column names. Remaining rows are interpreted as
    data records. Duplicate header rows are skipped.
    """

    normalized = _normalize_table_rows(rows)

    header = list(normalized[0])
    for idx, value in enumerate(header):
        if not value:
            header[idx] = f"column_{idx + 1}"

    data_rows: List[List[str]] = []
    for row in normalized[1:]:
        if tuple(row) == tuple(header):
            continue
        data_rows.append(list(row))

    if not data_rows:
        return pd.DataFrame(columns=header)

    return pd.DataFrame(data_rows, columns=header)


def _split_text_lines(lines: Iterable[str]) -> List[List[str]]:
    """Split textual ``lines`` into table rows.

    Delimiters are detected automatically with a preference for commas, tabs,
    semicolons and pipes. When no delimiter is found we fall back to separating
    by groups of whitespace characters.
    """

    cleaned_lines = [line.strip() for line in lines if line and line.strip()]
    if not cleaned_lines:
        raise HTTPException(status_code=400, detail="Table does not contain any values")

    delimiters = [",", "\t", ";", "|"]
    delimiter = None
    for line in cleaned_lines:
        for candidate in delimiters:
            if candidate in line:
                delimiter = candidate
                break
        if delimiter:
            break

    rows = []
    for line in cleaned_lines:
        if delimiter:
            values = [part.strip() for part in line.split(delimiter)]
        else:
            values = [part.strip() for part in re.split(r"\s{2,}", line) if part.strip()]
        rows.append(values)

    return rows


def _read_pdf_bytes(file_bytes: bytes) -> pd.DataFrame:
    """Extract tabular data from ``file_bytes`` representing a PDF document."""

    handle = io.BytesIO(file_bytes)
    with pdfplumber.open(handle) as pdf:
        frames: List[pd.DataFrame] = []
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for table in tables:
                try:
                    frame = _rows_to_dataframe(table)
                except HTTPException:
                    continue
                frames.append(frame)

        if frames:
            combined = pd.concat(frames, ignore_index=True, sort=False)
            return combined

        text_lines: List[str] = []
        for page in pdf.pages:
            extracted = page.extract_text() or ""
            text_lines.extend(extracted.splitlines())

    rows = _split_text_lines(text_lines)
    return _rows_to_dataframe(rows)


def _read_image_bytes(file_bytes: bytes) -> pd.DataFrame:
    """Extract tabular data from an image containing a table."""

    image = Image.open(io.BytesIO(file_bytes))
    grayscale = image.convert("L")
    try:
        text = pytesseract.image_to_string(grayscale)
    except pytesseract.pytesseract.TesseractNotFoundError as exc:  # type: ignore[attr-defined]
        raise HTTPException(status_code=500, detail="Tesseract OCR engine is not available") from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="Unable to extract text from image")

    rows = _split_text_lines(text.splitlines())
    return _rows_to_dataframe(rows)


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
    if ext == ".tsv":
        return pd.read_csv(io.BytesIO(file_bytes), sep="\t")
    if ext == ".csv":
        return pd.read_csv(io.BytesIO(file_bytes))
    if ext == ".pdf":
        return _read_pdf_bytes(file_bytes)
    if ext in {".png", ".jpg", ".jpeg"}:
        return _read_image_bytes(file_bytes)
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
    return _FILE_REGISTRY


@dataclass
class TablePayload:
    """Container bundling common representations of tabular uploads."""

    dataframe: pd.DataFrame

    @property
    def records(self) -> List[Dict[str, Any]]:
        """Return the table as a list of dictionaries."""

        return self.dataframe.to_dict(orient="records")

    def to_excel_bytes(self) -> bytes:
        """Serialize the table into an Excel spreadsheet stored in memory."""

        output = io.BytesIO()
        # index=False keeps parity with CSV style tabular representations
        self.dataframe.to_excel(output, index=False)
        return output.getvalue()


def read_table_payload(file_bytes: bytes, filename: str) -> TablePayload:
    """Read ``file_bytes`` into a :class:`TablePayload` for downstream usage."""

    dataframe = read_table_bytes(file_bytes, filename)
    return TablePayload(dataframe=dataframe)
