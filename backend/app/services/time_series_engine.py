"""Forecasting engine powering the AI Laboratory."""
from __future__ import annotations

import json
import math
import statistics
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from numpy.typing import ArrayLike
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX

from .dataset_store import get_dataset
from .series_provider import load_monthly_dataframe
from .time_series_registry import ModelMetadata, registry

Logger = Optional[Callable[[str], None]]


def _smape(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    y_true = np.asarray(y_true)
    y_pred = np.asarray(y_pred)
    denominator = (np.abs(y_true) + np.abs(y_pred)) / 2
    diff = np.abs(y_true - y_pred)
    mask = denominator != 0
    if not mask.any():
        return 0.0
    return float(np.mean(diff[mask] / denominator[mask]))


def _month_features(index: np.ndarray) -> np.ndarray:
    sin = np.sin(2 * np.pi * index / 12)
    cos = np.cos(2 * np.pi * index / 12)
    return np.stack([index, sin, cos], axis=1)


def _build_lag_matrix(series: Sequence[float], max_lag: int) -> np.ndarray:
    values = np.asarray(series)
    if len(values) <= max_lag:
        return np.empty((0, max_lag))
    matrix: List[np.ndarray] = []
    for idx in range(max_lag, len(values)):
        window = values[idx - max_lag : idx]
        matrix.append(window[::-1])
    return np.vstack(matrix)


def _derive_importance(model: Any, feature_names: Sequence[str]) -> List[Dict[str, Any]]:
    weights: List[Tuple[str, float]] = []
    if hasattr(model, "feature_importances_"):
        importances = getattr(model, "feature_importances_")
        weights = list(zip(feature_names, importances))
    elif hasattr(model, "coef_"):
        coefficients = getattr(model, "coef_")
        coef_values = coefficients if isinstance(coefficients, np.ndarray) else np.asarray(coefficients)
        weights = list(zip(feature_names, coef_values))
    return [
        {"feature": name, "importance": float(value)}
        for name, value in weights
    ]


@dataclass
class ForecastConfig:
    dataset_id: str
    date_column: str
    value_column: str
    sef_columns: Sequence[str] = field(default_factory=list)
    start: Optional[pd.Timestamp] = None
    end: Optional[pd.Timestamp] = None
    methods: Sequence[str] = field(default_factory=lambda: ["sarima", "ets", "linear_regression", "lagged_regression", "random_forest", "gradient_boosting"])
    horizon: int = 12
    ensemble_mode: str = "weighted"  # none, simple, weighted
    max_lag: int = 6
    random_state: int = 42
    file_identifier: Optional[str] = None


@dataclass
class ForecastResult:
    forecast: List[Dict[str, Any]]
    backtest: List[Dict[str, Any]]
    correlations: List[Dict[str, Any]]
    best_model: Dict[str, Any]
    feature_importance: List[Dict[str, Any]]
    artifact_dir: Path


class TimeSeriesForecaster:
    """Orchestrates preparation, backtesting, and forecasting."""

    def __init__(self, config: ForecastConfig, logger: Logger = None):
        self.config = config
        self.logger = logger
        self._df: Optional[pd.DataFrame] = None

    def _log(self, message: str) -> None:
        if self.logger:
            self.logger(message)

    def load_series(self) -> pd.DataFrame:
        if self._df is None:
            self._log("Загружаем и агрегируем временной ряд...")
            df = load_monthly_dataframe(
                dataset_id=self.config.dataset_id,
                date_column=self.config.date_column,
                value_column=self.config.value_column,
                sef_columns=self.config.sef_columns,
                start=self.config.start.date() if isinstance(self.config.start, pd.Timestamp) else None,
                end=self.config.end.date() if isinstance(self.config.end, pd.Timestamp) else None,
                file_identifier=self.config.file_identifier,
            )
            df = df.reset_index(drop=True)
            df["month_index"] = np.arange(len(df))
            self._df = df
        return self._df

    def _prepare_features(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        max_lag = min(self.config.max_lag, max(1, len(df) // 4))
        lag_matrix = _build_lag_matrix(df[self.config.value_column].astype(float).tolist(), max_lag)
        if lag_matrix.size == 0:
            raise ValueError("Недостаточно точек для построения лагов")
        lag_cols = [f"lag_{idx+1}" for idx in range(max_lag)]
        supervised = df.iloc[max_lag:].reset_index(drop=True).copy()
        for idx, column in enumerate(lag_cols):
            supervised[column] = lag_matrix[:, idx]
        month_features = _month_features(supervised["month_index"].to_numpy())
        supervised["trend_index"] = supervised["month_index"].astype(float)
        supervised["season_sin"] = month_features[:, 1]
        supervised["season_cos"] = month_features[:, 2]
        feature_columns = lag_cols + ["trend_index", "season_sin", "season_cos"]
        for column in self.config.sef_columns:
            if column in supervised.columns:
                feature_columns.append(column)
        return supervised, feature_columns

    def _backtest_split(self, df: pd.DataFrame, folds: int = 3) -> List[Tuple[pd.DataFrame, pd.DataFrame]]:
        horizon = self.config.horizon
        min_window = max(horizon * 2, 12)
        if len(df) <= min_window:
            return [(df.iloc[:-horizon], df.iloc[-horizon:])]
        splits: List[Tuple[pd.DataFrame, pd.DataFrame]] = []
        step = max(1, (len(df) - min_window) // folds)
        for fold in range(folds):
            split_point = min_window + fold * step
            if split_point + horizon > len(df):
                break
            train_df = df.iloc[:split_point]
            test_df = df.iloc[split_point : split_point + horizon]
            splits.append((train_df, test_df))
        if not splits:
            splits.append((df.iloc[:-horizon], df.iloc[-horizon:]))
        return splits

    def _run_method(self, method: str, train_df: pd.DataFrame, horizon: int) -> Tuple[np.ndarray, float]:
        series = train_df[self.config.value_column].astype(float).to_numpy()
        if method == "sarima":
            model = SARIMAX(series, order=(1, 1, 1), seasonal_order=(1, 0, 1, 12), enforce_stationarity=False, enforce_invertibility=False)
            fitted = model.fit(disp=False)
            forecast = fitted.forecast(steps=horizon)
            resid_std = float(np.std(fitted.resid[-12:])) if len(fitted.resid) > 12 else float(np.std(fitted.resid))
            return forecast, resid_std
        if method == "ets":
            ets = ExponentialSmoothing(series, trend="add", seasonal="add", seasonal_periods=12, initialization_method="estimated")
            fitted = ets.fit()
            forecast = fitted.forecast(horizon)
            resid_std = float(np.std(fitted.resid))
            return forecast, resid_std
        supervised, feature_cols = self._prepare_features(train_df)
        X = supervised[feature_cols]
        y = supervised[self.config.value_column]
        if method == "linear_regression":
            model = LinearRegression().fit(X, y)
        elif method == "lagged_regression":
            model = Ridge(alpha=1.0).fit(X, y)
        elif method == "random_forest":
            model = RandomForestRegressor(n_estimators=300, random_state=self.config.random_state).fit(X, y)
        elif method == "gradient_boosting":
            model = GradientBoostingRegressor(random_state=self.config.random_state).fit(X, y)
        else:
            raise ValueError(f"Неизвестный метод {method}")

        last_rows = train_df.iloc[-len(supervised):].copy()
        forecast_values: List[float] = []
        last_series = train_df[self.config.value_column].astype(float).tolist()
        for step in range(horizon):
            extended_df = train_df.copy()
            synthetic_date = train_df["date"].iloc[-1] + pd.offsets.MonthBegin(step + 1)
            new_row = {self.config.value_column: forecast_values[-1] if forecast_values else last_series[-1], "date": synthetic_date}
            for column in self.config.sef_columns:
                if column in train_df.columns:
                    new_row[column] = train_df[column].iloc[-1]
            extended_df = pd.concat([extended_df, pd.DataFrame([new_row])], ignore_index=True)
            sup, features = self._prepare_features(extended_df)
            next_row = sup.iloc[-1][features]
            predicted = model.predict(pd.DataFrame([next_row]))[0]
            forecast_values.append(float(predicted))
            train_df = extended_df

        residuals = y - model.predict(X)
        resid_std = float(np.std(residuals)) if len(residuals) else 0.0
        return np.array(forecast_values), resid_std

    def _baseline_naive(self, train_df: pd.DataFrame, horizon: int) -> np.ndarray:
        last_value = float(train_df[self.config.value_column].iloc[-1])
        return np.full(horizon, last_value)

    def _baseline_seasonal(self, train_df: pd.DataFrame, horizon: int) -> np.ndarray:
        season = 12
        series = train_df[self.config.value_column].astype(float).to_numpy()
        if len(series) < season:
            return self._baseline_naive(train_df, horizon)
        pattern = series[-season:]
        repeats = int(math.ceil(horizon / season))
        tiled = np.tile(pattern, repeats)[:horizon]
        return tiled

    def _evaluate_methods(self, df: pd.DataFrame) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
        splits = self._backtest_split(df)
        method_scores: Dict[str, List[float]] = {}
        rows: List[Dict[str, Any]] = []
        baseline_methods = {
            "naive": self._baseline_naive,
            "seasonal_naive": self._baseline_seasonal,
        }
        for fold_index, (train_df, test_df) in enumerate(splits):
            horizon = min(len(test_df), self.config.horizon)
            test_values = test_df[self.config.value_column].astype(float).to_numpy()
            for method_name, baseline_fn in baseline_methods.items():
                forecast = baseline_fn(train_df, horizon)
                mae = mean_absolute_error(test_values, forecast)
                rmse = math.sqrt(mean_squared_error(test_values, forecast))
                smape_value = _smape(test_values, forecast)
                rows.append(
                    {
                        "fold": fold_index + 1,
                        "method": method_name,
                        "mae": mae,
                        "rmse": rmse,
                        "smape": smape_value,
                    }
                )
                method_scores.setdefault(method_name, []).append(mae)
            for method in self.config.methods:
                try:
                    forecast, _ = self._run_method(method, train_df.copy(), horizon)
                except ValueError:
                    continue
                mae = mean_absolute_error(test_values, forecast)
                rmse = math.sqrt(mean_squared_error(test_values, forecast))
                smape_value = _smape(test_values, forecast)
                rows.append(
                    {
                        "fold": fold_index + 1,
                        "method": method,
                        "mae": mae,
                        "rmse": rmse,
                        "smape": smape_value,
                    }
                )
                method_scores.setdefault(method, []).append(mae)
        avg_scores = {method: statistics.mean(values) for method, values in method_scores.items() if values}
        return rows, avg_scores

    def _compute_correlations(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        target = df[self.config.value_column].astype(float)
        for column in self.config.sef_columns:
            if column not in df.columns:
                continue
            series = df[column].astype(float)
            corr = series.corr(target)
            results.append({"feature": column, "lag": 0, "correlation": None if math.isnan(corr) else float(corr)})
            for lag in range(1, 4):
                shifted = series.shift(lag)
                lag_corr = shifted.corr(target)
                results.append(
                    {"feature": column, "lag": lag, "correlation": None if math.isnan(lag_corr) else float(lag_corr)}
                )
        return results

    def _ensemble(self, forecasts: Dict[str, np.ndarray], scores: Dict[str, float]) -> np.ndarray:
        if not forecasts:
            return np.array([])
        if self.config.ensemble_mode == "simple":
            stacked = np.stack(list(forecasts.values()))
            return stacked.mean(axis=0)
        if self.config.ensemble_mode == "weighted":
            weights: List[float] = []
            ordered_forecasts: List[np.ndarray] = []
            for method, forecast in forecasts.items():
                score = scores.get(method)
                if score is None or score <= 0:
                    continue
                weights.append(1 / score)
                ordered_forecasts.append(forecast)
            if not ordered_forecasts:
                return self._ensemble(forecasts, {})  # fallback to simple mean
            stacked = np.stack(ordered_forecasts)
            normalized = np.array(weights) / sum(weights)
            return np.average(stacked, axis=0, weights=normalized)
        # default: return best method forecast
        best_method = min(scores, key=scores.get)
        return forecasts[best_method]

    def train(self, *, persist: bool = True, activate: bool = True) -> ForecastResult:
        df = self.load_series()
        if len(df) < 12:
            raise ValueError("Для прогноза требуется минимум 12 месяцев данных")
        self._log("Запускаем кросс-валидацию по временным рядам...")
        backtest_rows, score_table = self._evaluate_methods(df)
        if not score_table:
            raise ValueError("Не удалось вычислить метрики для методов")
        best_method = min(score_table, key=score_table.get)
        self._log(f"Лучший метод по MAE: {best_method}")
        forecasts: Dict[str, np.ndarray] = {}
        interval_widths: Dict[str, float] = {}
        for method in set(list(self.config.methods) + [best_method]):
            try:
                series, resid_std = self._run_method(method, df.copy(), self.config.horizon)
                forecasts[method] = series
                interval_widths[method] = resid_std
            except ValueError:
                continue
        if not forecasts:
            raise ValueError("Не удалось построить прогноз выбранными методами")
        if self.config.ensemble_mode in {"simple", "weighted"}:
            ensemble_series = self._ensemble(forecasts, score_table)
            forecasts["ensemble"] = ensemble_series
            interval_widths["ensemble"] = np.mean(list(interval_widths.values()))
            best_method = "ensemble"
        chosen_series = forecasts[best_method]
        chosen_std = interval_widths.get(best_method, np.std(df[self.config.value_column]))
        forecast_payload = []
        last_date = df["date"].iloc[-1]
        for step, value in enumerate(chosen_series):
            future_date = last_date + pd.offsets.MonthBegin(step + 1)
            interval = 1.96 * chosen_std if chosen_std else 0.0
            forecast_payload.append(
                {
                    "date": future_date.strftime("%Y-%m-01"),
                    "yhat": float(value),
                    "lower": float(value - interval),
                    "upper": float(value + interval),
                    "scenario": "baseline",
                }
            )
        importance = []
        if best_method in {"linear_regression", "lagged_regression", "random_forest", "gradient_boosting"}:
            supervised, features = self._prepare_features(df.copy())
            model = None
            if best_method == "linear_regression":
                model = LinearRegression().fit(supervised[features], supervised[self.config.value_column])
            elif best_method == "lagged_regression":
                model = Ridge(alpha=1.0).fit(supervised[features], supervised[self.config.value_column])
            elif best_method == "random_forest":
                model = RandomForestRegressor(n_estimators=300, random_state=self.config.random_state).fit(
                    supervised[features], supervised[self.config.value_column]
                )
            elif best_method == "gradient_boosting":
                model = GradientBoostingRegressor(random_state=self.config.random_state).fit(
                    supervised[features], supervised[self.config.value_column]
                )
            if model is not None:
                importance = _derive_importance(model, features)
        correlations = self._compute_correlations(df)
        dataset_meta = get_dataset(self.config.dataset_id)
        metadata: Optional[ModelMetadata] = None
        artifact_dir = registry.create_artifact_dir()
        if persist:
            metadata = ModelMetadata(
                dataset_id=self.config.dataset_id,
                dataset_name=dataset_meta.get("name") if dataset_meta else None,
                date_column=self.config.date_column,
                value_column=self.config.value_column,
                sef_columns=list(self.config.sef_columns),
                methods=list(self.config.methods),
                horizon=self.config.horizon,
                trained_from=df["date"].iloc[0].strftime("%Y-%m-01"),
                trained_to=df["date"].iloc[-1].strftime("%Y-%m-01"),
                score=score_table.get(best_method),
                status="ready",
                is_active=activate,
                ensemble_mode=self.config.ensemble_mode,
            )
            artifact_dir = registry.create_artifact_dir(metadata.id)
        self._export_artifacts(
            artifact_dir=artifact_dir,
            correlations=correlations,
            backtest_rows=backtest_rows,
            best_model=best_method,
            chosen_series=forecast_payload,
            df=df,
            feature_importance=importance,
        )
        if metadata:
            metadata.artifact_dir = str(artifact_dir)
            registry.save(metadata)
            if activate:
                registry.set_active(metadata.id)
        return ForecastResult(
            forecast=forecast_payload,
            backtest=backtest_rows,
            correlations=correlations,
            best_model={
                "method": best_method,
                "score": score_table.get(best_method),
                "model_id": metadata.id if metadata else None,
            },
            feature_importance=importance,
            artifact_dir=artifact_dir,
        )

    def _export_artifacts(
        self,
        artifact_dir: Path,
        correlations: List[Dict[str, Any]],
        backtest_rows: List[Dict[str, Any]],
        best_model: str,
        chosen_series: List[Dict[str, Any]],
        df: pd.DataFrame,
        feature_importance: List[Dict[str, Any]],
    ) -> None:
        artifact_dir.mkdir(parents=True, exist_ok=True)
        correlations_df = pd.DataFrame(correlations)
        correlations_df.to_csv(artifact_dir / "correlations_table.csv", index=False)
        pd.DataFrame(backtest_rows).to_csv(artifact_dir / "model_comparison.csv", index=False)
        pd.DataFrame(chosen_series).to_csv(artifact_dir / "forecast.csv", index=False)
        best_payload = {
            "method": best_model,
            "trained_range": {
                "from": df["date"].iloc[0].strftime("%Y-%m-01"),
                "to": df["date"].iloc[-1].strftime("%Y-%m-01"),
            },
            "generated_at": time.time(),
            "horizon": self.config.horizon,
        }
        with (artifact_dir / "best_model.json").open("w", encoding="utf-8") as handle:
            json.dump(best_payload, handle, ensure_ascii=False, indent=2)
        importance_df = pd.DataFrame(feature_importance or self._compute_feature_summary(df))
        importance_df.to_csv(artifact_dir / "feature_importance.csv", index=False)

    def _compute_feature_summary(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        summary: List[Dict[str, Any]] = []
        rolling_mean = df[self.config.value_column].rolling(window=3, min_periods=1).mean()
        summary.append({"feature": "trend_recent_avg", "importance": float(rolling_mean.iloc[-1])})
        for column in self.config.sef_columns:
            if column in df.columns:
                summary.append({"feature": column, "importance": float(df[column].iloc[-1])})
        return summary


__all__ = ["ForecastConfig", "TimeSeriesForecaster", "ForecastResult"]
