from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from .utils import moving_average, safe_ratio, slope, volatility


@dataclass
class SeriesSummary:
    direction: str
    slope: float
    growth_rate: float
    volatility: float
    horizon_value: Optional[float]
    horizon_label: Optional[str]
    details: List[str]
    signals: List[str] = field(default_factory=list)


class LocalSeriesInterpreter:
    """Produces lightweight narratives for short time series or context payloads."""

    def __init__(self, smoothing_window: int = 3):
        self.smoothing_window = max(1, smoothing_window)

    def summarize_series(self, values: Sequence[float]) -> SeriesSummary:
        if not values:
            return SeriesSummary("flat", 0.0, 0.0, 0.0, None, None, [], [])
        cleaned = [float(value) for value in values if value is not None]
        if len(cleaned) < 2:
            return SeriesSummary("flat", 0.0, 0.0, 0.0, cleaned[-1] if cleaned else None, None, [], [])

        smoothed = moving_average(cleaned, min(self.smoothing_window, len(cleaned)))
        trend = slope(smoothed)
        direction = "up" if trend > 0 else "down" if trend < 0 else "flat"
        growth = safe_ratio(smoothed[-1] - smoothed[0], max(abs(smoothed[0]), 1e-9))
        vol = volatility(smoothed)
        next_value = smoothed[-1] + trend if smoothed else None
        change_pct = growth * 100

        signal_lines: List[str] = []
        if abs(growth) >= 0.2:
            qualifier = "двузначный рост" if growth > 0 else "заметный спад"
            signal_lines.append(qualifier)

        vol_ratio = safe_ratio(vol, max(abs(smoothed[-1]), 1e-9))
        if vol_ratio >= 0.15:
            signal_lines.append("волатильность >15% от уровня метрики")

        diffs = np.diff(smoothed)
        if diffs.size:
            spike_idx = int(np.argmax(np.abs(diffs)))
            spike = float(diffs[spike_idx])
            threshold = np.std(diffs) + (vol or 0)
            if abs(spike) >= threshold and threshold > 0:
                direction_hint = "рост" if spike > 0 else "падение"
                signal_lines.append(f"резкий {direction_hint} между точками {spike_idx + 1}-{spike_idx + 2}")

        momentum = 0.0
        if len(smoothed) >= 4:
            window = max(2, len(smoothed) // 3)
            early = float(np.mean(smoothed[:window]))
            late = float(np.mean(smoothed[-window:]))
            momentum = safe_ratio(late - early, max(abs(early), 1e-9))
            if abs(momentum) >= 0.15:
                signal_lines.append("ускорение тренда" if momentum > 0 else "замедление тренда")

        details = [
            f"Суммарное изменение: {change_pct:+.1f}%.",
            f"Волатильность: {vol:.2f} (отн. {vol_ratio*100:.1f}%).",
            f"Тренд {direction} ({trend:+.3f} единиц на шаг).",
        ]
        if next_value is not None:
            details.append(f"Проекция следующего шага: {next_value:.2f}.")

        return SeriesSummary(
            direction=direction,
            slope=trend,
            growth_rate=float(growth),
            volatility=vol,
            horizon_value=next_value,
            horizon_label=None,
            details=details,
            signals=signal_lines,
        )

    def interpret_context(self, context: Optional[Dict[str, Any]]) -> List[str]:
        if not context:
            return []

        lines: List[str] = []
        target = context.get("target")
        if target:
            lines.append(f"Целевой показатель: {target}.")

        aggregate = context.get("aggregate") or {}
        aggregate_value = aggregate.get("value")
        aggregate_label = aggregate.get("label") or aggregate.get("type")
        if aggregate_value is not None:
            label = aggregate_label or "Агрегат"
            lines.append(f"{label}: {aggregate_value:,.2f}".replace(",", " "))

        delta = context.get("delta") or {}
        delta_abs = delta.get("abs") or delta.get("absolute")
        delta_pct = delta.get("pct") or delta.get("percent")
        basis = delta.get("type") or "сравнение с прошлым периодом"
        if delta_abs is not None:
            snippet = f"Δ ({basis}): {delta_abs:+.2f}"
            if delta_pct is not None:
                snippet += f" ({delta_pct:+.1f}%)"
            lines.append(snippet)

        correlations = context.get("correlations") or []
        if correlations:
            sorted_corr = sorted(
                correlations,
                key=lambda item: abs(item.get("value") or item.get("correlation") or 0),
                reverse=True,
            )[:3]
            formatted = [
                f"{item.get('feature')}={item.get('value', item.get('correlation')):+.2f}"
                + (f" (лаг {item['lag']})" if item.get("lag") else "")
                for item in sorted_corr
                if item.get("feature") and (item.get("value") is not None or item.get("correlation") is not None)
            ]
            if formatted:
                lines.append("Топ драйверов: " + "; ".join(formatted))

        model_info = context.get("model") or {}
        if model_info.get("method"):
            metrics = []
            if model_info.get("mae") is not None:
                metrics.append(f"MAE {model_info['mae']:.2f}")
            if model_info.get("rmse") is not None:
                metrics.append(f"RMSE {model_info['rmse']:.2f}")
            payload = ", ".join(metrics) if metrics else "метрики не указаны"
            lines.append(f"Лучшая модель: {model_info['method']} ({payload}).")

        forecast = context.get("forecast") or {}
        if forecast.get("horizon_value") is not None and forecast.get("horizon_date"):
            last_actual = forecast.get("last_actual")
            snippet = f"Прогноз на {forecast['horizon_date']}: {forecast['horizon_value']:.2f}"
            if last_actual is not None:
                snippet += f", последний факт {last_actual:.2f}"
            lines.append(snippet)

        series_payload = context.get("series")
        series_values, series_label = self._extract_series(series_payload)
        if series_values:
            summary = self.summarize_series(series_values)
            direction_arrow = "↗" if summary.direction == "up" else "↘" if summary.direction == "down" else "→"
            header = f"Серия {series_label or ''} тренд {direction_arrow}, изменение {summary.growth_rate*100:+.1f}%."
            lines.append(header.strip())
            lines.extend(summary.details[:2])
            if summary.signals:
                lines.append("Сигналы: " + "; ".join(summary.signals[:3]))

        return lines

    def _extract_series(self, payload: Any) -> tuple[List[float], Optional[str]]:
        if not payload:
            return ([], None)
        if isinstance(payload, dict):
            values = payload.get("values") or payload.get("series") or []
            label = payload.get("label") or payload.get("name")
        else:
            values = payload
            label = None
        cleaned = [float(value) for value in values if value is not None]
        return (cleaned, label)


__all__ = [
    "LocalSeriesInterpreter",
    "SeriesSummary",
]
