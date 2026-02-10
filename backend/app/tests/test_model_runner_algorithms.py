from __future__ import annotations

import pandas as pd
import pytest

from ..services.model_runner import ModelRunner


class DummyRepository:
    """Minimal stub used to instantiate ModelRunner for unit tests."""

    def update_model_run(self, *args, **kwargs):
        return None

    def save_model_result(self, *args, **kwargs):
        raise NotImplementedError

    def record_alert(self, *args, **kwargs):
        return None


@pytest.fixture
def runner():
    return ModelRunner(repository=DummyRepository())


def test_run_ols_emits_diagnostics(runner):
    df = pd.DataFrame(
        {
            "incidents": [120, 130, 140, 150, 165, 172],
            "patrols": [10, 11, 12, 13, 14, 15],
            "community": [3, 4, 4, 5, 6, 7],
        }
    )
    result = runner._run_ols(
        df,
        {"target_column": "incidents", "feature_columns": ["patrols", "community"]},
    )
    assert "breusch_pagan_pvalue" in result["diagnostics"]
    assert result["metrics"]["rmse"] >= 0


def test_run_logit_produces_classification_metrics(runner):
    df = pd.DataFrame(
        {
            "hotspot": [0, 1, 0, 1, 0, 1, 1, 0],
            "alerts": [2, 8, 3, 7, 1, 9, 8, 2],
            "sentiment": [0.2, 0.9, 0.3, 0.85, 0.1, 0.97, 0.92, 0.15],
        }
    )
    result = runner._run_binary_glm(
        df,
        {"target_column": "hotspot", "feature_columns": ["alerts", "sentiment"]},
        "logit",
    )
    assert result["metrics"]["accuracy"] >= 0.5
    assert "target_mapping" in result["diagnostics"]


def test_run_difference_in_differences_detects_effect(runner):
    rows = []
    dates = pd.date_range("2024-01-01", periods=6, freq="M")
    for treated in (0, 1):
        for date in dates:
            base = 20 + (date.month - 1)
            effect = 5 if treated and date.month >= 4 else 0
            rows.append(
                {
                    "treated": treated,
                    "period": date,
                    "value": base + effect,
                }
            )
    df = pd.DataFrame(rows)
    result = runner._run_difference_in_differences(
        df,
        {"treatment_column": "treated", "time_column": "period", "value_column": "value"},
    )
    assert abs(result["diagnostics"]["effect"]) > 0
