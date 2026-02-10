from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
import statsmodels.api as sm
from pandas.tseries.frequencies import to_offset
from sklearn.linear_model import Lasso, Ridge
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from statsmodels.stats.diagnostic import acorr_breusch_godfrey, acorr_ljungbox, het_breuschpagan
from statsmodels.tsa.seasonal import seasonal_decompose
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.stattools import adfuller, coint, grangercausalitytests, kpss

try:  # pragma: no cover - optional dependency
    from prophet import Prophet

    PROPHET_AVAILABLE = True
except ImportError:  # pragma: no cover
    PROPHET_AVAILABLE = False

try:  # pragma: no cover - optional dependency
    from linearmodels.iv import IV2SLS, IVGMM
    from linearmodels.panel import PanelOLS, RandomEffects

    LINEARMODELS_AVAILABLE = True
except ImportError:  # pragma: no cover
    LINEARMODELS_AVAILABLE = False
    IV2SLS = IVGMM = PanelOLS = RandomEffects = None  # type: ignore[assignment]

from ..utils.files import load_dataframe_from_identifier
from .dataset_store import get_dataset_file
from .metadata_repository import (
    JsonModelTrackingRepository,
    ModelResultRecord,
    ModelRunRecord,
    SqlModelTrackingRepository,
    get_model_tracking_repository,
)

RepositoryType = SqlModelTrackingRepository | JsonModelTrackingRepository


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _rmse(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    residuals = np.asarray(y_true, dtype=float) - np.asarray(y_pred, dtype=float)
    if residuals.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(residuals))))


def _mae(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    residuals = np.asarray(y_true, dtype=float) - np.asarray(y_pred, dtype=float)
    if residuals.size == 0:
        return 0.0
    return float(np.mean(np.abs(residuals)))


def _smape(y_true: Sequence[float], y_pred: Sequence[float]) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denominator = (np.abs(y_true) + np.abs(y_pred)) / 2
    diff = np.abs(y_true - y_pred)
    mask = denominator != 0
    if not mask.any():
        return 0.0
    return float(np.mean(diff[mask] / denominator[mask]))


def _infer_frequency(series: pd.Series) -> Optional[str]:
    try:
        freq = pd.infer_freq(series)
        if freq:
            return freq
    except ValueError:
        pass
    if len(series) > 1:
        diff = series.sort_values().diff().dropna()
        if not diff.empty:
            most_common = diff.mode().iloc[0]
            if isinstance(most_common, pd.Timedelta):
                if most_common == pd.Timedelta(days=1):
                    return "D"
                if most_common == pd.Timedelta(weeks=1):
                    return "W"
                if most_common in (pd.Timedelta(days=30), pd.Timedelta(days=31)):
                    return "M"
    return None


def _truncate_residuals(values: Sequence[float], limit: int = 200) -> List[float]:
    return [float(value) for value in values[:limit]]


def _prepare_numeric_frame(df: pd.DataFrame, columns: Sequence[str]) -> pd.DataFrame:
    frame = df[list(columns)].dropna().copy()
    for column in columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    frame = frame.dropna()
    if frame.empty:
        raise ValueError("Недостаточно числовых данных для расчёта модели")
    return frame


def _residual_diagnostics(residuals: np.ndarray, design_matrix: np.ndarray, fitted_model=None) -> Dict[str, Any]:
    diagnostics: Dict[str, Any] = {}
    if residuals.size == 0:
        return diagnostics
    try:
        lm_stat, lm_pvalue, _, _ = het_breuschpagan(residuals, design_matrix)
        diagnostics["breusch_pagan_pvalue"] = float(lm_pvalue)
    except Exception:
        pass
    try:
        lb = acorr_ljungbox(residuals, lags=[5], return_df=True)
        diagnostics["ljung_box_pvalue"] = float(lb["lb_pvalue"].iloc[0])
    except Exception:
        pass
    if fitted_model is not None:
        try:
            bg = acorr_breusch_godfrey(fitted_model, nlags=min(5, len(residuals) // 2 or 1))
            diagnostics["breusch_godfrey_pvalue"] = float(bg[1])
        except Exception:
            pass
        diagnostics["aic"] = float(getattr(fitted_model, "aic", 0.0) or 0.0)
        diagnostics["bic"] = float(getattr(fitted_model, "bic", 0.0) or 0.0)
    diagnostics["durbin_watson"] = float(sm.stats.stattools.durbin_watson(residuals))
    return diagnostics


def _season_period_from_freq(freq: Optional[str]) -> Optional[int]:
    if not freq:
        return None
    try:
        offset = to_offset(freq)
        if offset.name.startswith("M"):
            return 12
        if offset.name.startswith("W"):
            return 4
        if offset.name.startswith("Q"):
            return 4
        if offset.name.startswith("D"):
            return 7
    except Exception:
        pass
    if "M" in freq:
        return 12
    if "W" in freq:
        return 4
    if "D" in freq:
        return 7
    return None


def _seasonality_snapshot(frame: pd.DataFrame, date_column: str, value_column: str, freq: Optional[str]) -> Optional[Dict[str, Any]]:
    period = _season_period_from_freq(freq)
    if not period:
        return None
    ts = frame.set_index(date_column)[value_column]
    if len(ts) < period * 2:
        return None
    try:
        decomposition = seasonal_decompose(ts, model="additive", period=period, two_sided=False)
    except Exception:
        return None
    payload = {
        "period": period,
        "trend": [float(val) if pd.notna(val) else None for val in decomposition.trend.dropna().tail(5)],
        "seasonal_strength": float(np.var(decomposition.seasonal.dropna()) / max(np.var(ts), 1e-9)),
    }
    return payload


def _binary_encode(series: pd.Series) -> np.ndarray:
    unique = series.dropna().unique()
    if len(unique) != 2:
        raise ValueError("Для выбранной модели требуется бинарная целевая переменная")
    mapping = {value: idx for idx, value in enumerate(sorted(unique))}
    return np.asarray(series.map(mapping), dtype=float), mapping


def _apply_time_window(df: pd.DataFrame, window: Optional[Dict[str, Any]]) -> pd.DataFrame:
    if not window:
        return df
    column = window.get("column")
    if not column or column not in df.columns:
        return df
    start = window.get("start")
    end = window.get("end")
    if not start and not end:
        return df
    working = df.copy()
    try:
        series_dt = pd.to_datetime(working[column], errors="coerce")
        start_dt = pd.to_datetime(start, errors="coerce") if start else None
        end_dt = pd.to_datetime(end, errors="coerce") if end else None
        if (start_dt is not None and not pd.isna(start_dt)) or (end_dt is not None and not pd.isna(end_dt)):
            mask = pd.Series(True, index=working.index)
            if start_dt is not None and not pd.isna(start_dt):
                mask &= series_dt >= start_dt
            if end_dt is not None and not pd.isna(end_dt):
                mask &= series_dt <= end_dt
            working = working[mask]
            if not working.empty:
                return working
    except Exception:
        pass
    try:
        series_num = pd.to_numeric(working[column], errors="coerce")
        mask = pd.Series(True, index=working.index)
        if start is not None:
            try:
                start_val = float(start)
                mask &= series_num >= start_val
            except (TypeError, ValueError):
                pass
        if end is not None:
            try:
                end_val = float(end)
                mask &= series_num <= end_val
            except (TypeError, ValueError):
                pass
        filtered = working[mask]
        if not filtered.empty:
            return filtered
    except Exception:
        pass
    series_text = working[column].astype(str)
    mask = pd.Series(True, index=working.index)
    if start:
        mask &= series_text >= str(start)
    if end:
        mask &= series_text <= str(end)
    filtered = working[mask]
    if filtered.empty:
        raise ValueError("Нет данных в выбранном интервале времени для указанной колонки")
    return filtered


class ModelExecutionError(Exception):
    """Raised when analytic model execution fails."""


@dataclass
class ExecutionResult:
    run: ModelRunRecord
    results: List[ModelResultRecord]


class ModelRunner:
    """Execute analytical models and persist results in the tracking repository."""

    def __init__(self, repository: RepositoryType):
        self._repository = repository

    def run(
        self,
        *,
        run_id: str,
        dataset_id: Optional[str],
        file_url: Optional[str],
        algorithm: str,
        parameters: Dict[str, Any],
    ) -> ExecutionResult:
        start = time.perf_counter()
        self._repository.update_model_run(run_id, status="running", started_at=_now())
        try:
            df = self._load_dataframe(dataset_id, file_url)
            payload = self._execute_algorithm(df, algorithm.lower(), parameters or {})
            result_record = self._repository.save_model_result(
                run_id=run_id,
                metrics=payload["metrics"],
                coefficients=payload.get("coefficients"),
                residuals=payload.get("residuals"),
                diagnostics=payload.get("diagnostics"),
                artifacts_path=payload.get("artifacts_path"),
            )
            duration_ms = int((time.perf_counter() - start) * 1000)
            run = self._repository.update_model_run(
                run_id,
                status="completed",
                metrics_summary=payload["metrics"],
                completed_at=_now(),
                duration_ms=duration_ms,
            )
            assert run is not None
            self._evaluate_thresholds(run_id, payload["metrics"], parameters.get("thresholds"))
            return ExecutionResult(run=run, results=[result_record])
        except Exception as exc:  # noqa: BLE001 - propagate sanitized error
            duration_ms = int((time.perf_counter() - start) * 1000)
            self._repository.update_model_run(
                run_id,
                status="failed",
                error=str(exc),
                completed_at=_now(),
                duration_ms=duration_ms,
            )
            self._repository.record_alert(
                run_id=run_id,
                alert_type="failure",
                severity="critical",
                message=str(exc),
                threshold=None,
                payload=None,
            )
            raise ModelExecutionError(str(exc)) from exc

    def _load_dataframe(self, dataset_id: Optional[str], file_url: Optional[str]) -> pd.DataFrame:
        reference = get_dataset_file(dataset_id, file_url)
        if not reference:
            raise ValueError("Не удалось определить источник данных для модели")
        df = load_dataframe_from_identifier(reference)
        if df.empty:
            raise ValueError("В наборе нет данных для обучения модели")
        return df

    def _execute_algorithm(self, df: pd.DataFrame, algorithm: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if params.get("time_window"):
            df = _apply_time_window(df, params["time_window"])
        if algorithm == "ols":
            return self._run_ols(df, params)
        if algorithm in {"ridge", "lasso"}:
            return self._run_regularized_regression(df, params, algorithm)
        if algorithm in {"logit", "probit"}:
            return self._run_binary_glm(df, params, algorithm)
        if algorithm in {"iv", "gmm"}:
            return self._run_instrumental(df, params, algorithm)
        if algorithm in {"fixed_effects", "random_effects"}:
            return self._run_panel_model(df, params, algorithm)
        if algorithm == "diff_in_diff":
            return self._run_difference_in_differences(df, params)
        if algorithm == "granger":
            return self._run_granger_test(df, params)
        if algorithm == "cointegration":
            return self._run_cointegration(df, params)
        if algorithm in {"arima", "sarima", "sarimax"}:
            return self._run_arima(df, params)
        if algorithm == "prophet":
            return self._run_prophet(df, params)
        raise ValueError(f"Неизвестный алгоритм '{algorithm}'")

    def _run_ols(self, df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        target_column = params.get("target_column")
        if not target_column:
            raise ValueError("Для OLS нужно указать target_column")
        if target_column not in df.columns:
            raise ValueError(f"Колонка {target_column} отсутствует в наборе данных")
        feature_columns: Sequence[str] = params.get("feature_columns") or [
            column for column in df.columns if column != target_column
        ]
        if not feature_columns:
            raise ValueError("Не удалось определить признаки для модели")

        data = _prepare_numeric_frame(df, [target_column, *feature_columns])
        y = data[target_column].astype(float)
        X = sm.add_constant(data[feature_columns].astype(float))
        model = sm.OLS(y, X).fit()
        predicted = model.predict(X)
        residuals = y.to_numpy(dtype=float) - predicted.to_numpy(dtype=float)

        metrics = {
            "rmse": _rmse(y, predicted),
            "mae": _mae(y, predicted),
            "smape": _smape(y, predicted),
            "r2": float(model.rsquared or 0.0),
        }
        coeff_map: Dict[str, float] = {}
        for name, value in zip(X.columns, model.params):
            key = "intercept" if name.lower() == "const" else name
            coeff_map[key] = float(value)
        diagnostics = {
            "feature_columns": list(feature_columns),
            "target_column": target_column,
            "sample_size": len(y),
            **_residual_diagnostics(residuals, X.to_numpy(dtype=float), model),
        }

        return {
            "metrics": metrics,
            "coefficients": coeff_map,
            "residuals": _truncate_residuals(residuals.tolist()),
            "diagnostics": diagnostics,
        }

    def _run_regularized_regression(self, df: pd.DataFrame, params: Dict[str, Any], algorithm: str) -> Dict[str, Any]:
        target_column = params.get("target_column")
        if not target_column:
            raise ValueError("Укажите target_column для регрессии")
        feature_columns: Sequence[str] = params.get("feature_columns") or [
            column for column in df.columns if column != target_column
        ]
        if not feature_columns:
            raise ValueError("Не удалось определить признаки для модели")
        data = _prepare_numeric_frame(df, [target_column, *feature_columns])
        X = data[feature_columns].to_numpy(dtype=float)
        y = data[target_column].to_numpy(dtype=float)
        alpha = float(params.get("alpha", 1.0))
        model = Ridge(alpha=alpha, fit_intercept=True) if algorithm == "ridge" else Lasso(alpha=alpha, max_iter=5000)
        model.fit(X, y)
        predicted = model.predict(X)
        residuals = y - predicted
        metrics = {
            "rmse": _rmse(y, predicted),
            "mae": _mae(y, predicted),
            "r2": float(model.score(X, y)),
        }
        coeff_map = {"intercept": float(model.intercept_)}
        for column, value in zip(feature_columns, model.coef_):
            coeff_map[column] = float(value)
        diagnostics = {
            "alpha": alpha,
            "feature_columns": list(feature_columns),
            "target_column": target_column,
        }
        return {
            "metrics": metrics,
            "coefficients": coeff_map,
            "residuals": _truncate_residuals(residuals.tolist()),
            "diagnostics": diagnostics,
        }

    def _run_arima(self, df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        value_column = params.get("value_column")
        date_column = params.get("date_column")
        if not value_column or not date_column:
            raise ValueError("Для ARIMA/SARIMAX укажите value_column и date_column")
        if value_column not in df.columns or date_column not in df.columns:
            raise ValueError("Указанные столбцы отсутствуют в наборе данных")

        frame = df[[date_column, value_column]].dropna().copy()
        frame[date_column] = pd.to_datetime(frame[date_column], errors="coerce")
        frame = frame.dropna().sort_values(date_column)
        frame[value_column] = pd.to_numeric(frame[value_column], errors="coerce")
        frame = frame.dropna()
        if len(frame) < 10:
            raise ValueError("Недостаточно точек для построения ARIMA модели")

        order = tuple(params.get("order", (1, 1, 1)))
        if len(order) != 3:
            raise ValueError("order должен содержать три числа (p,d,q)")
        seasonal_order = tuple(params.get("seasonal_order", (0, 0, 0, 0)))
        if len(seasonal_order) != 4:
            raise ValueError("seasonal_order должен содержать четыре числа (P,D,Q,s)")
        horizon = int(params.get("horizon", 12))
        freq = params.get("freq") or _infer_frequency(frame[date_column])
        future_freq = freq or "D"

        series = frame[value_column].to_numpy(dtype=float)
        model = SARIMAX(
            series,
            order=order,
            seasonal_order=seasonal_order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        fitted = model.fit(disp=False)
        fitted_values = np.asarray(fitted.fittedvalues, dtype=float)
        forecast = fitted.get_forecast(steps=horizon)
        predicted = forecast.predicted_mean
        conf_int = forecast.conf_int()
        last_date = frame[date_column].iloc[-1]
        future_index = pd.date_range(
            start=last_date,
            periods=horizon + 1,
            freq=future_freq,
        )[1:]

        observed = series[-len(fitted_values) :]
        metrics = {
            "rmse": _rmse(observed, fitted_values),
            "mae": _mae(observed, fitted_values),
            "smape": _smape(observed, fitted_values),
        }
        forecast_payload = [
            {
                "period": future_index[idx].isoformat(),
                "value": float(predicted[idx]),
                "lower": float(conf_int.iloc[idx, 0]) if not conf_int.empty else None,
                "upper": float(conf_int.iloc[idx, 1]) if not conf_int.empty else None,
            }
            for idx in range(len(predicted))
        ]
        diagnostics = {
            "value_column": value_column,
            "date_column": date_column,
            "forecast": forecast_payload,
            "order": order,
            "seasonal_order": seasonal_order,
        }
        seasonality = _seasonality_snapshot(frame, date_column, value_column, freq)
        if seasonality:
            diagnostics["seasonality"] = seasonality
        residuals = fitted.resid.tolist()
        return {
            "metrics": metrics,
            "coefficients": None,
            "residuals": _truncate_residuals(residuals),
            "diagnostics": diagnostics,
        }

    def _run_prophet(self, df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        if not PROPHET_AVAILABLE:
            raise ValueError("Библиотека prophet не установлена. Добавьте `prophet` в зависимости сервиса.")
        value_column = params.get("value_column")
        date_column = params.get("date_column")
        if not value_column or not date_column:
            raise ValueError("Для Prophet укажите value_column и date_column")
        if value_column not in df.columns or date_column not in df.columns:
            raise ValueError("Указанные столбцы отсутствуют в наборе данных")
        frame = df[[date_column, value_column]].dropna().copy()
        frame[date_column] = pd.to_datetime(frame[date_column], errors="coerce")
        frame[value_column] = pd.to_numeric(frame[value_column], errors="coerce")
        frame = frame.dropna().sort_values(date_column)
        if len(frame) < 10:
            raise ValueError("Недостаточно данных для обучения Prophet")

        prophet_params = params.get("prophet_params") or {}
        model = Prophet(**prophet_params)
        prophet_df = frame.rename(columns={date_column: "ds", value_column: "y"})
        model.fit(prophet_df)
        horizon = int(params.get("horizon", 12))
        freq = params.get("freq") or _infer_frequency(prophet_df["ds"])
        future = model.make_future_dataframe(periods=horizon, freq=freq or "D")
        forecast = model.predict(future)
        history = forecast.iloc[: len(prophet_df)]
        metrics = {
            "rmse": _rmse(prophet_df["y"], history["yhat"]),
            "mae": _mae(prophet_df["y"], history["yhat"]),
            "smape": _smape(prophet_df["y"], history["yhat"]),
        }
        if horizon:
            tail = forecast.iloc[len(prophet_df) : len(prophet_df) + horizon]
        else:
            tail = forecast.iloc[len(prophet_df) - 1 : len(prophet_df)]
        forecast_payload = [
            {
                "period": row["ds"].isoformat(),
                "value": float(row["yhat"]),
                "lower": float(row["yhat_lower"]),
                "upper": float(row["yhat_upper"]),
            }
            for _, row in tail.iterrows()
        ]
        residuals = prophet_df["y"].to_numpy(dtype=float) - history["yhat"].to_numpy(dtype=float)
        diagnostics = {
            "value_column": value_column,
            "date_column": date_column,
            "forecast": forecast_payload,
            "freq": freq or "D",
        }
        seasonality = _seasonality_snapshot(frame, date_column, value_column, freq)
        if seasonality:
            diagnostics["seasonality"] = seasonality
        return {
            "metrics": metrics,
            "coefficients": None,
            "residuals": _truncate_residuals(residuals.tolist()),
            "diagnostics": diagnostics,
        }

    def _run_binary_glm(self, df: pd.DataFrame, params: Dict[str, Any], algorithm: str) -> Dict[str, Any]:
        target_column = params.get("target_column")
        if not target_column:
            raise ValueError("Для логит/пробит моделей укажите target_column")
        feature_columns: Sequence[str] = params.get("feature_columns") or [
            column for column in df.columns if column != target_column
        ]
        if not feature_columns:
            raise ValueError("Не удалось подобрать признаки для модели")
        data = df[[target_column] + list(feature_columns)].dropna().copy()
        for column in feature_columns:
            data[column] = pd.to_numeric(data[column], errors="coerce")
        data = data.dropna()
        encoded_target, mapping = _binary_encode(data[target_column])
        X = sm.add_constant(data[feature_columns].astype(float))
        model_class = sm.Logit if algorithm == "logit" else sm.Probit
        fitted = model_class(encoded_target, X).fit(disp=False)
        probabilities = fitted.predict(X)
        predictions = (probabilities >= float(params.get("threshold", 0.5))).astype(int)
        metrics = {
            "accuracy": float(accuracy_score(encoded_target, predictions)),
            "precision": float(precision_score(encoded_target, predictions, zero_division=0)),
            "recall": float(recall_score(encoded_target, predictions, zero_division=0)),
            "f1": float(f1_score(encoded_target, predictions, zero_division=0)),
            "log_likelihood": float(fitted.llf),
        }
        try:
            metrics["roc_auc"] = float(roc_auc_score(encoded_target, probabilities))
        except ValueError:
            metrics["roc_auc"] = None
        coeff_map: Dict[str, float] = {}
        for name, value in zip(X.columns, fitted.params):
            key = "intercept" if name.lower() == "const" else name
            coeff_map[key] = float(value)
        diagnostics = {
            "target_mapping": mapping,
            "feature_columns": list(feature_columns),
            "threshold": float(params.get("threshold", 0.5)),
            "pseudo_r2": float(getattr(fitted, "prsquared", 0.0)),
        }
        return {
            "metrics": metrics,
            "coefficients": coeff_map,
            "residuals": _truncate_residuals((encoded_target - probabilities).tolist()),
            "diagnostics": diagnostics,
        }

    def _run_instrumental(self, df: pd.DataFrame, params: Dict[str, Any], algorithm: str) -> Dict[str, Any]:
        if not LINEARMODELS_AVAILABLE:
            raise ValueError("Для инструментальных переменных установите зависимость 'linearmodels'")
        target_column = params.get("target_column")
        instrument_columns: Sequence[str] = params.get("instrument_columns") or []
        feature_columns: Sequence[str] = params.get("feature_columns") or []
        if not target_column or not feature_columns or not instrument_columns:
            raise ValueError("Для IV/GMM требуется target_column, feature_columns и instrument_columns")
        columns = [target_column, *feature_columns, *instrument_columns]
        data = _prepare_numeric_frame(df, columns)
        y = data[target_column]
        exog = sm.add_constant(data[feature_columns])
        instruments = data[instrument_columns]
        if algorithm == "iv":
            fitted = IV2SLS(y, exog, instruments).fit()
        else:
            fitted = IVGMM(y, exog, instruments).fit()
        predicted = fitted.fitted_values
        metrics = {
            "rmse": _rmse(y, predicted),
            "mae": _mae(y, predicted),
            "r2": float(getattr(fitted, "rsquared", 0.0) or 0.0),
        }
        coeff_map = {}
        for name, value in fitted.params.items():
            key = "intercept" if name.lower() == "const" else name
            coeff_map[key] = float(value)
        diagnostics = {
            "feature_columns": list(feature_columns),
            "instrument_columns": list(instrument_columns),
            "first_stage_f": float(getattr(getattr(fitted, "first_stage", None), "f_statistic", 0.0) or 0.0)
            if hasattr(fitted, "first_stage")
            else None,
        }
        residuals = y.to_numpy(dtype=float) - np.asarray(predicted, dtype=float)
        diagnostics.update(_residual_diagnostics(residuals, exog.to_numpy(dtype=float)))
        return {
            "metrics": metrics,
            "coefficients": coeff_map,
            "residuals": _truncate_residuals(residuals.tolist()),
            "diagnostics": diagnostics,
        }

    def _run_panel_model(self, df: pd.DataFrame, params: Dict[str, Any], algorithm: str) -> Dict[str, Any]:
        if not LINEARMODELS_AVAILABLE:
            raise ValueError("Для панельных моделей установите зависимость 'linearmodels'")
        entity_column = params.get("entity_column")
        time_column = params.get("time_column")
        value_column = params.get("value_column")
        feature_columns: Sequence[str] = params.get("feature_columns") or []
        if not all([entity_column, time_column, value_column, feature_columns]):
            raise ValueError("Для моделей фикс./случ. эффектов нужен entity_column, time_column и признаки")
        columns = [entity_column, time_column, value_column, *feature_columns]
        frame = df[columns].dropna().copy()
        frame[time_column] = pd.to_datetime(frame[time_column], errors="coerce")
        frame = frame.dropna()
        if frame.empty:
            raise ValueError("Нет данных для панельной модели")
        frame = frame.set_index([entity_column, time_column]).sort_index()
        endog = frame[value_column].astype(float)
        exog = sm.add_constant(frame[feature_columns].astype(float))
        model = PanelOLS(endog, exog, entity_effects=True) if algorithm == "fixed_effects" else RandomEffects(endog, exog)
        fitted = model.fit()
        predicted = fitted.fitted_values
        residuals = endog.to_numpy(dtype=float) - predicted.to_numpy(dtype=float)
        metrics = {
            "rmse": _rmse(endog, predicted),
            "mae": _mae(endog, predicted),
            "r2": float(getattr(fitted, "rsquared", 0.0) or 0.0),
        }
        coeff_map = {}
        for name, value in fitted.params.items():
            key = "intercept" if name.lower() == "const" else name
            coeff_map[key] = float(value)
        diagnostics = {
            "entity_column": entity_column,
            "time_column": time_column,
            "feature_columns": list(feature_columns),
        }
        diagnostics.update(_residual_diagnostics(residuals, exog.to_numpy(dtype=float)))
        return {
            "metrics": metrics,
            "coefficients": coeff_map,
            "residuals": _truncate_residuals(residuals.tolist()),
            "diagnostics": diagnostics,
        }

    def _run_difference_in_differences(self, df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        treatment_column = params.get("treatment_column")
        time_column = params.get("time_column")
        value_column = params.get("value_column")
        if not all([treatment_column, time_column, value_column]):
            raise ValueError("Для Difference-in-Differences укажите treatment_column, time_column и value_column")
        frame = df[[treatment_column, time_column, value_column]].dropna().copy()
        frame[time_column] = pd.to_datetime(frame[time_column], errors="coerce")
        frame = frame.dropna().sort_values(time_column)
        if frame.empty:
            raise ValueError("Нет данных для Difference-in-Differences")
        midpoint = params.get("split_date")
        if midpoint:
            midpoint = pd.to_datetime(midpoint, errors="coerce")
        else:
            midpoint = frame[time_column].median()
        treated_mask = frame[treatment_column].astype(str).str.lower().isin({"1", "true", "treated", "yes"})
        post_mask = frame[time_column] >= midpoint

        def _avg(mask_treated, mask_post):
            subset = frame[mask_treated & mask_post]
            if subset.empty:
                return 0.0
            return float(subset[value_column].mean())

        treated_post = _avg(treated_mask, post_mask)
        treated_pre = _avg(treated_mask, ~post_mask)
        control_post = _avg(~treated_mask, post_mask)
        control_pre = _avg(~treated_mask, ~post_mask)
        diff_effect = (treated_post - treated_pre) - (control_post - control_pre)
        diagnostics = {
            "midpoint": midpoint.isoformat() if isinstance(midpoint, pd.Timestamp) else str(midpoint),
            "treated_delta": treated_post - treated_pre,
            "control_delta": control_post - control_pre,
            "effect": diff_effect,
        }
        metrics = {"effect": diff_effect}
        return {
            "metrics": metrics,
            "coefficients": None,
            "residuals": None,
            "diagnostics": diagnostics,
        }

    def _run_granger_test(self, df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        target_column = params.get("target_column")
        cause_column = params.get("cause_column")
        if not target_column or not cause_column:
            raise ValueError("Для теста Грейнджера укажите target_column и cause_column")
        frame = df[[target_column, cause_column]].dropna().astype(float)
        if len(frame) < 10:
            raise ValueError("Недостаточно данных для теста причинности")
        max_lag = int(params.get("max_lag", 3))
        result = grangercausalitytests(frame[[target_column, cause_column]], maxlag=max_lag, verbose=False)
        lag_pvalues = {lag: float(stats[0]["ssr_ftest"][1]) for lag, stats in result.items()}
        metrics = {
            "min_pvalue": min(lag_pvalues.values()) if lag_pvalues else None,
            "max_lag": max_lag,
        }
        diagnostics = {"lag_pvalues": lag_pvalues}
        return {
            "metrics": metrics,
            "coefficients": None,
            "residuals": None,
            "diagnostics": diagnostics,
        }

    def _run_cointegration(self, df: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        series_x = params.get("series_x")
        series_y = params.get("series_y")
        if not series_x or not series_y:
            raise ValueError("Для тестов коинтеграции укажите series_x и series_y")
        frame = df[[series_x, series_y]].dropna().astype(float)
        if frame.empty:
            raise ValueError("Нет данных для тестов коинтеграции")
        x = frame[series_x]
        y = frame[series_y]
        try:
            adf_stat, adf_pvalue, _, _ = adfuller(x)
        except Exception:
            adf_stat, adf_pvalue = math.nan, math.nan
        try:
            kpss_stat, kpss_pvalue, _, _ = kpss(x, nlags="auto")
        except Exception:
            kpss_stat, kpss_pvalue = math.nan, math.nan
        try:
            _, coint_pvalue, _ = coint(x, y)
        except Exception:
            coint_pvalue = math.nan
        metrics = {
            "adf_pvalue": float(adf_pvalue),
            "kpss_pvalue": float(kpss_pvalue),
            "coint_pvalue": float(coint_pvalue),
        }
        diagnostics = {
            "series_x": series_x,
            "series_y": series_y,
            "adf_stat": float(adf_stat),
            "kpss_stat": float(kpss_stat),
        }
        return {
            "metrics": metrics,
            "coefficients": None,
            "residuals": None,
            "diagnostics": diagnostics,
        }

    def _evaluate_thresholds(
        self,
        run_id: str,
        metrics: Dict[str, Any],
        thresholds: Optional[Dict[str, Any]],
    ) -> None:
        if not thresholds:
            return
        for metric_name, limit in thresholds.items():
            if limit is None:
                continue
            try:
                limit_value = float(limit)
            except (TypeError, ValueError):
                continue
            metric_value = metrics.get(metric_name)
            if metric_value is None:
                continue
            try:
                metric_value = float(metric_value)
            except (TypeError, ValueError):
                continue
            if metric_value > limit_value:
                severity = "critical" if metric_name.lower() in {"rmse", "mae"} else "warning"
                self._repository.record_alert(
                    run_id=run_id,
                    alert_type=f"metric_threshold::{metric_name}",
                    severity=severity,
                    message=(
                        f"Метрика {metric_name}={metric_value:.3f} превышает порог {limit_value:.3f}"
                    ),
                    threshold={"metric": metric_name, "limit": limit_value},
                    payload={"actual": metric_value},
                )


_RUNNER: Optional[ModelRunner] = None


def get_model_runner() -> ModelRunner:
    global _RUNNER
    if _RUNNER is None:
        repository = get_model_tracking_repository()
        _RUNNER = ModelRunner(repository)
    return _RUNNER
