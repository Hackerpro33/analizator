"""Unified series provider for the AI Laboratory."""
from __future__ import annotations

import calendar
import csv
import json
import logging
import math
import re
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import pandas as pd
from pandas.api.types import is_numeric_dtype

from .dataset_store import get_dataset, get_dataset_file
from ..utils.files import load_dataframe_from_identifier
from .time_series_registry import registry

SERIES_CACHE_TTL = 180  # seconds
_cache_lock = threading.Lock()
_series_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
logger = logging.getLogger(__name__)

_MONTH_LOOKUP = {
    name.lower(): idx
    for idx, name in enumerate(calendar.month_name)
    if name
}
_MONTH_LOOKUP.update(
    {
        abbr.lower(): idx
        for idx, abbr in enumerate(calendar.month_abbr)
        if abbr
    }
)


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    value = value.strip()
    layouts = ["%Y-%m-%d", "%Y-%m", "%Y/%m/%d"]
    for layout in layouts:
        try:
            dt = datetime.strptime(value, layout)
            return date(dt.year, dt.month, 1)
        except ValueError:
            continue
    return None


def _normalize_month(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, 1)


def _parse_human_month(value: Any) -> Optional[datetime]:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None

    def _match_month(fragment: str) -> Optional[int]:
        return _MONTH_LOOKUP.get(fragment.lower())

    range_match = re.search(r"([A-Za-z]+)\s*[-–]\s*([A-Za-z]+)\s+(\d{4})", text)
    if range_match:
        month = _match_month(range_match.group(2))
        year = int(range_match.group(3))
        if month:
            return datetime(year, month, 1)

    single_match = re.search(r"([A-Za-z]+)\s+(\d{4})", text)
    if single_match:
        month = _match_month(single_match.group(1))
        year = int(single_match.group(2))
        if month:
            return datetime(year, month, 1)

    year_match = re.search(r"(\d{4})", text)
    if year_match:
        year = int(year_match.group(1))
        return datetime(year, 1, 1)

    return None


@dataclass
class SeriesRequest:
    dataset_id: str
    date_column: str
    value_column: str
    sef_columns: Sequence[str]
    start: Optional[date]
    end: Optional[date]
    horizon: int


class SeriesProvider:
    """Loads aligned actual/forecast series plus SEF matrices."""

    def __init__(self) -> None:
        self._cache_ttl = SERIES_CACHE_TTL

    def _cache_key(self, payload: SeriesRequest) -> str:
        key = {
            "dataset": payload.dataset_id,
            "date": payload.date_column,
            "value": payload.value_column,
            "sef": list(payload.sef_columns),
            "start": payload.start.isoformat() if payload.start else None,
            "end": payload.end.isoformat() if payload.end else None,
            "horizon": payload.horizon,
        }
        return json.dumps(key, sort_keys=True)

    def _load_dataframe(self, payload: SeriesRequest) -> pd.DataFrame:
        return load_monthly_dataframe(
            dataset_id=payload.dataset_id,
            date_column=payload.date_column,
            value_column=payload.value_column,
            sef_columns=payload.sef_columns,
            start=payload.start,
            end=payload.end,
        )

    def _build_actual(self, df: pd.DataFrame, value_column: str) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        for row in df.itertuples():
            records.append(
                {
                    "date": row.date.strftime("%Y-%m-01"),
                    "value": float(getattr(row, value_column)),
                }
            )
        return records

    def _build_sef(self, df: pd.DataFrame, sef_columns: Sequence[str]) -> List[Dict[str, Any]]:
        if not sef_columns:
            return []
        output: List[Dict[str, Any]] = []
        for row in df.itertuples():
            entry = {"date": row.date.strftime("%Y-%m-01"), "values": {}}
            for column in sef_columns:
                if hasattr(row, column):
                    value = getattr(row, column)
                    entry["values"][column] = None if value is None or (isinstance(value, float) and math.isnan(value)) else float(value)
            output.append(entry)
        return output

    def _load_forecast(self, dataset_id: str, horizon: int) -> List[Dict[str, Any]]:
        model = registry.get_active_model(dataset_id)
        if not model:
            return []
        artifact_dir = Path(model.get("artifact_dir", ""))
        forecast_path = artifact_dir / "forecast.csv"
        if not forecast_path.exists():
            return []
        records: List[Dict[str, Any]] = []
        with forecast_path.open("r", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                records.append(
                    {
                        "date": row.get("date"),
                        "yhat": float(row.get("yhat")) if row.get("yhat") else None,
                        "lower": float(row.get("lower")) if row.get("lower") else None,
                        "upper": float(row.get("upper")) if row.get("upper") else None,
                        "scenario": row.get("scenario") or "baseline",
                        "model_id": model.get("id"),
                    }
                )
                if len(records) >= horizon:
                    break
        return records

    def _meta(self, payload: SeriesRequest) -> Dict[str, Any]:
        dataset = get_dataset(payload.dataset_id) or {}
        return {
            "dataset_id": payload.dataset_id,
            "dataset_name": dataset.get("name"),
            "date_column": payload.date_column,
            "value_column": payload.value_column,
            "sef_columns": list(payload.sef_columns),
            "row_count": dataset.get("row_count"),
        }

    def _build(self, payload: SeriesRequest) -> Dict[str, Any]:
        df = self._load_dataframe(payload)
        actual = self._build_actual(df, payload.value_column)
        sef_matrix = self._build_sef(df, payload.sef_columns)
        forecast = self._load_forecast(payload.dataset_id, payload.horizon)
        return {
            "actual": actual,
            "forecast": forecast,
            "sef": sef_matrix,
            "meta": self._meta(payload),
        }

    def get_series(self, payload: SeriesRequest) -> Dict[str, Any]:
        key = self._cache_key(payload)
        with _cache_lock:
            cached = _series_cache.get(key)
            now = time.time()
            if cached and now - cached[0] < self._cache_ttl:
                return cached[1]
        built = self._build(payload)
        with _cache_lock:
            _series_cache[key] = (time.time(), built)
        return built

    def invalidate_dataset(self, dataset_id: str) -> None:
        with _cache_lock:
            keys_to_delete = [key for key in _series_cache if f"\"dataset\": \"{dataset_id}\"" in key]
            for key in keys_to_delete:
                _series_cache.pop(key, None)


def _normalize_months(series: pd.Series) -> pd.Series:
    return series.dt.to_period("M").dt.to_timestamp()


def load_monthly_dataframe(
    dataset_id: str,
    date_column: str,
    value_column: str,
    sef_columns: Sequence[str],
    start: Optional[date],
    end: Optional[date],
    *,
    file_identifier: Optional[str] = None,
) -> pd.DataFrame:
    reference = file_identifier or get_dataset_file(dataset_id, None)
    if not reference:
        dataset = get_dataset(dataset_id)
        reference = dataset.get("file_url") if dataset else None
    if not reference:
        raise ValueError("Не удалось определить файл набора данных")
    df = load_dataframe_from_identifier(reference)
    if date_column not in df.columns:
        raise ValueError(f"Колонка дат {date_column} отсутствует")
    if value_column not in df.columns:
        raise ValueError(f"Колонка значений {value_column} отсутствует")
    normalized = pd.to_datetime(df[date_column], errors="coerce")
    if normalized.isna().any():
        fallback = df[date_column].apply(_parse_human_month)
        normalized = normalized.fillna(fallback)
    if normalized.isna().all():
        raise ValueError("Не удалось распознать даты в выбранном столбце")
    df = df.assign(__month=_normalize_months(normalized))
    df = df.dropna(subset=["__month"])
    aggregates = {value_column: "sum"}
    invalid_sef: List[str] = []
    for column in sef_columns:
        if column in df.columns:
            if is_numeric_dtype(df[column]):
                aggregates[column] = "mean"
            else:
                invalid_sef.append(column)
    if invalid_sef:
        raise ValueError(
            "Колонки факторов должны содержать числовые значения: "
            + ", ".join(invalid_sef)
        )
    grouped = df.groupby("__month", as_index=False).agg(aggregates)
    grouped = grouped.sort_values("__month")
    if grouped.empty:
        raise ValueError("После агрегирования не осталось значений для временного ряда")
    if start:
        grouped = grouped[grouped["__month"] >= datetime(start.year, start.month, 1)]
    if end:
        grouped = grouped[grouped["__month"] <= datetime(end.year, end.month, 1)]
    grouped = grouped.rename(columns={"__month": "date"})
    if grouped["date"].nunique() < 2:
        raise ValueError("Недостаточно исторических данных: выберите столбец даты с минимум двумя месяцами")
    return grouped


def build_request(params: Dict[str, Any]) -> SeriesRequest:
    dataset_id = params.get("dataset_id") or params.get("target")
    if not dataset_id:
        raise ValueError("Не указан слой данных (target)")
    date_column = params.get("date_column") or "month"
    value_column = params.get("value_column") or "target_value"
    sef_value = params.get("sef_columns") or ""
    if isinstance(sef_value, str):
        sef_columns = [item.strip() for item in sef_value.split(",") if item.strip()]
    else:
        sef_columns = list(sef_value or [])
    start = _parse_date(params.get("from"))
    end = _parse_date(params.get("to"))
    horizon = int(params.get("horizon") or 12)
    return SeriesRequest(
        dataset_id=dataset_id,
        date_column=date_column,
        value_column=value_column,
        sef_columns=sef_columns,
        start=start,
        end=end,
        horizon=horizon,
    )


provider = SeriesProvider()


__all__ = ["SeriesProvider", "provider", "build_request", "load_monthly_dataframe"]
