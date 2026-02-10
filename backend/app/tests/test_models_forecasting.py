from __future__ import annotations

from ..models.forecasting import LocalSeriesInterpreter


def test_summarize_series_emits_signals_and_details():
    interpreter = LocalSeriesInterpreter()
    summary = interpreter.summarize_series([10, 13, 18, 30, 28, 35])

    assert summary.direction == "up"
    assert summary.horizon_value is not None
    assert summary.signals  # should describe volatility or acceleration
    assert any("изменение" in detail.lower() for detail in summary.details)


def test_interpret_context_includes_series_analysis():
    interpreter = LocalSeriesInterpreter()
    lines = interpreter.interpret_context(
        {
            "target": "Выручка",
            "aggregate": {"value": 120, "label": "Среднее"},
            "series": {"values": [5, 7, 14, 9], "label": "MQL"},
            "forecast": {"horizon_value": 15.0, "horizon_date": "2024-03-01", "last_actual": 11.0},
        }
    )

    assert any("MQL" in line or "Серия" in line for line in lines)
    assert any("Прогноз" in line for line in lines)
