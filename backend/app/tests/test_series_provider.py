from __future__ import annotations

import pandas as pd
import pytest

from app.services import series_provider


@pytest.fixture
def mock_dataset(monkeypatch):
    def _setup(df: pd.DataFrame):
        monkeypatch.setattr(series_provider, "get_dataset_file", lambda dataset_id, _: "dummy-path")
        monkeypatch.setattr(series_provider, "load_dataframe_from_identifier", lambda _: df)

    return _setup


def test_load_monthly_dataframe_rejects_non_numeric_sef(mock_dataset):
    df = pd.DataFrame(
        {
            "date_col": ["2025-01-01", "2025-02-01"],
            "value": [10, 12],
            "text_factor": ["A", "B"],
        }
    )
    mock_dataset(df)

    with pytest.raises(ValueError) as exc:
        series_provider.load_monthly_dataframe(
            dataset_id="demo",
            date_column="date_col",
            value_column="value",
            sef_columns=["text_factor"],
            start=None,
            end=None,
        )

    assert "числовые" in str(exc.value)


def test_load_monthly_dataframe_parses_range_dates(mock_dataset):
    df = pd.DataFrame(
        {
            "range_col": ["Jan - Feb 2025", "Jan - Mar 2025", "Apr 2025"],
            "value": [5, 7, 11],
            "factor": [1.0, 2.0, 3.0],
        }
    )
    mock_dataset(df)

    result = series_provider.load_monthly_dataframe(
        dataset_id="demo",
        date_column="range_col",
        value_column="value",
        sef_columns=["factor"],
        start=None,
        end=None,
    )

    assert result["date"].dt.month.tolist() == [2, 3, 4]
    assert result["value"].tolist() == [5, 7, 11]
