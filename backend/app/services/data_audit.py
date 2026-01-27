"""Data audit helpers for completeness, continuity, and outlier checks."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

from .dataset_store import get_dataset, get_dataset_file
from ..utils.files import load_dataframe_from_identifier

APP_DIR = Path(__file__).resolve().parent.parent
AUDIT_STORE = APP_DIR / "data" / "data_audit_reports.json"
AUDIT_STORE.parent.mkdir(parents=True, exist_ok=True)


def _load_store() -> Dict[str, Any]:
    if not AUDIT_STORE.exists():
        return {}
    try:
        with AUDIT_STORE.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, dict):
            return payload
    except json.JSONDecodeError:
        return {}
    return {}


def _save_store(store: Dict[str, Any]) -> None:
    tmp = AUDIT_STORE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(store, handle, ensure_ascii=False, indent=2)
    tmp.replace(AUDIT_STORE)


def _load_dataset(dataset_id: str, file_identifier: Optional[str] = None) -> pd.DataFrame:
    reference = file_identifier or get_dataset_file(dataset_id, None)
    if not reference:
        dataset = get_dataset(dataset_id)
        reference = dataset.get("file_url") if dataset else None
    if not reference:
        raise ValueError("Не удалось найти файл набора данных")
    df = load_dataframe_from_identifier(reference)
    df = df.replace({"": np.nan})
    return df


def _detect_date_column(df: pd.DataFrame) -> Optional[str]:
    best_column: Optional[str] = None
    best_count = 0
    for column in df.columns:
        series = pd.to_datetime(df[column], errors="coerce")
        non_null = series.notna().sum()
        if non_null > best_count and non_null >= len(series) * 0.4:
            best_count = non_null
            best_column = column
    return best_column


def _detect_numeric_columns(df: pd.DataFrame) -> List[str]:
    numeric_cols: List[str] = []
    for column in df.columns:
        series = pd.to_numeric(df[column], errors="coerce")
        filled = series.notna().sum()
        if filled >= len(series) * 0.5:
            numeric_cols.append(column)
    return numeric_cols


def _detect_target(df: pd.DataFrame, numeric_cols: Sequence[str]) -> Optional[str]:
    best = None
    best_variance = -1.0
    for column in numeric_cols:
        series = pd.to_numeric(df[column], errors="coerce").dropna()
        if series.empty:
            continue
        variance = float(series.var())
        if variance > best_variance:
            best_variance = variance
            best = column
    return best


def _completeness(df: pd.DataFrame) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for column in df.columns:
        missing = df[column].isna().mean()
        results.append({"column": column, "missing_ratio": float(missing)})
    return results


def _duplicates(df: pd.DataFrame) -> Dict[str, Any]:
    total = int(df.duplicated().sum())
    return {"count": total, "ratio": total / len(df) if len(df) else 0}


def _date_continuity(df: pd.DataFrame, date_column: Optional[str]) -> Dict[str, Any]:
    if not date_column or date_column not in df.columns:
        return {"status": "unknown", "missing_months": []}
    dates = pd.to_datetime(df[date_column], errors="coerce").dropna().sort_values()
    if dates.empty:
        return {"status": "unknown", "missing_months": []}
    start = dates.min().to_period("M")
    end = dates.max().to_period("M")
    expected = pd.period_range(start, end, freq="M")
    present = set(dates.dt.to_period("M"))
    missing = [str(period.to_timestamp())[:10] for period in expected if period not in present]
    status = "pass" if not missing else ("warn" if len(missing) <= 2 else "fail")
    return {"status": status, "missing_months": missing}


def _outliers(df: pd.DataFrame, numeric_cols: Sequence[str]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for column in numeric_cols:
        series = pd.to_numeric(df[column], errors="coerce").dropna()
        if len(series) < 8:
            continue
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        mask = (series < lower) | (series > upper)
        count = int(mask.sum())
        if count:
            records.append(
                {
                    "column": column,
                    "count": count,
                    "ratio": count / len(series),
                    "lower_bound": float(lower),
                    "upper_bound": float(upper),
                }
            )
    return records


def _type_issues(df: pd.DataFrame) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    for column in df.columns:
        sample = df[column].dropna().head(50)
        types = {type(value).__name__ for value in sample}
        if len(types) > 1:
            issues.append({"column": column, "types": sorted(types)})
    return issues


def _stationarity_hint(series: pd.Series) -> str:
    rolling_mean = series.rolling(window=6, min_periods=3).mean()
    if rolling_mean.isna().all():
        return "unknown"
    trend = rolling_mean.iloc[-1] - rolling_mean.iloc[0]
    if abs(trend) < 1e-6:
        return "stationary"
    return "non-stationary" if abs(trend) > abs(series.mean()) * 0.05 else "weak-trend"


def run_data_audit(
    dataset_id: str,
    *,
    date_column: Optional[str] = None,
    target_column: Optional[str] = None,
    file_identifier: Optional[str] = None,
) -> Dict[str, Any]:
    df = _load_dataset(dataset_id, file_identifier=file_identifier)
    detected_date = date_column or _detect_date_column(df)
    numeric_cols = _detect_numeric_columns(df)
    detected_target = target_column or _detect_target(df, numeric_cols)
    sef_candidates = [col for col in numeric_cols if col != detected_target]

    completeness = _completeness(df)
    duplicates = _duplicates(df)
    continuity = _date_continuity(df, detected_date)
    outliers = _outliers(df, numeric_cols)
    type_issues = _type_issues(df)

    status = "pass"
    reasons: List[str] = []
    max_missing = max((item["missing_ratio"] for item in completeness), default=0)
    if max_missing > 0.2 or duplicates["ratio"] > 0.1 or continuity["status"] == "fail":
        status = "fail"
        if max_missing > 0.2:
            reasons.append("Высокая доля пропусков в отдельных столбцах.")
        if duplicates["ratio"] > 0.1:
            reasons.append("Более 10% дублей по строкам.")
        if continuity["status"] == "fail":
            reasons.append("Нарушена помесячная непрерывность дат.")
    elif max_missing > 0.05 or duplicates["count"] > 0 or continuity["status"] == "warn" or outliers:
        status = "warn"
        if max_missing > 0.05:
            reasons.append("Обнаружены пропуски, требующие очистки.")
        if duplicates["count"] > 0:
            reasons.append("Встречаются дублирующиеся строки.")
        if continuity["status"] == "warn":
            reasons.append("Есть пропущенные месяцы.")
        if outliers:
            reasons.append("Обнаружены выбросы в числовых столбцах.")

    target_series = pd.to_numeric(df[detected_target], errors="coerce") if detected_target else pd.Series(dtype=float)
    stationarity = _stationarity_hint(target_series.dropna()) if not target_series.empty else "unknown"

    report = {
        "dataset_id": dataset_id,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "date_column": detected_date,
        "target_column": detected_target,
        "sef_candidates": sef_candidates,
        "completeness": completeness,
        "missing_by_month": [],
        "duplicates": duplicates,
        "continuity": continuity,
        "outliers": outliers,
        "type_issues": type_issues,
        "status": status,
        "reasons": reasons,
        "stationarity": stationarity,
    }
    if detected_date and detected_date in df.columns:
        grouped = df.groupby(pd.to_datetime(df[detected_date], errors="coerce").dt.to_period("M")).size()
        report["missing_by_month"] = [
            {"month": str(period.to_timestamp())[:10], "count": int(count)}
            for period, count in grouped.items()
            if pd.notna(period)
        ]
    store = _load_store()
    store[dataset_id] = report
    _save_store(store)
    return report


def get_latest_audit(dataset_id: str) -> Optional[Dict[str, Any]]:
    store = _load_store()
    return store.get(dataset_id)


__all__ = ["run_data_audit", "get_latest_audit"]
