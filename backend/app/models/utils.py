from __future__ import annotations

import math
import re
from statistics import mean
from typing import Iterable, List, Sequence

import numpy as np

_TOKEN_PATTERN = re.compile(r"[^\wа-яА-ЯёЁ]+", re.UNICODE)


def normalize_text(text: str) -> str:
    """Lowercase text and strip punctuation so tiny datasets still work."""

    if not text:
        return ""
    collapsed = _TOKEN_PATTERN.sub(" ", text.lower())
    return re.sub(r"\s+", " ", collapsed).strip()


def deduplicate_preserve_order(items: Iterable[str], limit: int | None = None) -> List[str]:
    """Return items without duplicates while preserving the initial order."""

    seen: set[str] = set()
    result: List[str] = []
    for item in items:
        if not item or item in seen:
            continue
        result.append(item)
        seen.add(item)
        if limit is not None and len(result) >= limit:
            break
    return result


def safe_ratio(numerator: float, denominator: float, default: float = 0.0) -> float:
    if denominator == 0:
        return default
    return numerator / denominator


def slope(values: Sequence[float]) -> float:
    """Estimate direction of change via linear regression slope."""

    if len(values) < 2:
        return 0.0
    x = np.arange(len(values))
    y = np.asarray(values, dtype=float)
    coeffs = np.polyfit(x, y, 1)
    return float(coeffs[0])


def volatility(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    return float(np.std(values))


def moving_average(values: Sequence[float], window: int) -> List[float]:
    if window <= 1 or len(values) <= window:
        return list(values)
    return [
        mean(values[idx : idx + window])
        for idx in range(0, len(values) - window + 1)
    ]


def smape(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    if len(y_true) != len(y_pred) or not y_true:
        return math.nan
    numerator = np.abs(np.asarray(y_true) - np.asarray(y_pred))
    denominator = (np.abs(y_true) + np.abs(y_pred)) / 2
    mask = denominator != 0
    if not np.any(mask):
        return 0.0
    return float(np.mean(numerator[mask] / denominator[mask]))


__all__ = [
    "deduplicate_preserve_order",
    "moving_average",
    "normalize_text",
    "safe_ratio",
    "slope",
    "smape",
    "volatility",
]
