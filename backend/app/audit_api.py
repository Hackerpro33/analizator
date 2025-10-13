"""Endpoints for algorithm bias auditing and scheduling."""
from __future__ import annotations

import json
import logging
import math
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .datasets_api import _load_all as _load_datasets
from .services.notifications import WebhookDeliveryError, dispatch_webhook
from .utils.files import (
    DATA_DIR,
    export_json_atomic,
    load_dataframe_from_identifier,
    resolve_file_path,
)

router = APIRouter()

AUDIT_HISTORY_PATH = DATA_DIR / "bias_audits.json"
AUDIT_SCHEDULES_PATH = DATA_DIR / "bias_audit_schedules.json"

logger = logging.getLogger(__name__)


def _load_json(path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        if isinstance(payload, list):
            return payload
    except Exception:
        return []
    return []


def _save_json(path, payload: List[Dict[str, Any]]) -> None:
    export_json_atomic(path, payload)


class BiasAuditMetric(BaseModel):
    name: str
    value: Optional[float]
    threshold: Optional[str] = None
    passed: bool = True
    interpretation: str


class GroupStats(BaseModel):
    values: List[Any]
    count: int
    positive_rate: Optional[float] = None
    true_positive_rate: Optional[float] = None
    false_positive_rate: Optional[float] = None
    false_negative_rate: Optional[float] = None
    positive_predictive_value: Optional[float] = None


class BiasAuditResult(BaseModel):
    id: str
    dataset_id: Optional[str] = None
    file_url: Optional[str] = None
    schedule_id: Optional[str] = None
    created_at: str
    parameters: Dict[str, Any]
    sample_size: int
    dropped_rows: int
    metrics: List[BiasAuditMetric]
    group_metrics: Dict[str, GroupStats]
    flagged: bool
    summary: str
    recommendations: List[str]
    next_run_due: Optional[str] = None
    thresholds: Dict[str, Any]


class RatioThreshold(BaseModel):
    min: float = Field(..., description="Минимально допустимое значение метрики")
    max: float = Field(..., description="Максимально допустимое значение метрики")

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "RatioThreshold":
        if not isinstance(payload, dict):
            raise ValueError("Ratio threshold must be provided as an object with 'min' and 'max'")
        return cls(**payload)


class MetricThresholdOverrides(BaseModel):
    difference: Dict[str, float] = Field(
        default_factory=dict,
        description="Переопределения порогов для метрик с абсолютной разницей",
    )
    ratio: Dict[str, RatioThreshold] = Field(
        default_factory=dict,
        description="Переопределения порогов для метрик с отношениями",
    )


class BiasAuditRequest(BaseModel):
    dataset_id: Optional[str] = Field(
        None, description="Identifier of a dataset stored in the local catalog."
    )
    file_url: Optional[str] = Field(
        None,
        description="Uploaded file identifier or a direct file path to analyse",
    )
    sensitive_attribute: str = Field(..., description="Column containing the protected attribute")
    prediction_column: str = Field(..., description="Column with algorithm predictions")
    actual_column: Optional[str] = Field(
        None, description="Optional column with ground truth outcomes"
    )
    positive_label: Optional[Any] = Field(
        1,
        description="Value that should be interpreted as a positive outcome",
    )
    privileged_values: Optional[List[Any]] = Field(
        None,
        description="Values of the sensitive attribute that are considered privileged",
    )
    prediction_threshold: Optional[float] = Field(
        None,
        description="Threshold to binarise numeric prediction scores",
    )
    save_result: bool = True
    schedule_id: Optional[str] = None
    schedule_frequency: Optional[str] = Field(
        None, description="Optional frequency (daily/weekly/monthly/quarterly/yearly)"
    )
    notes: Optional[str] = None
    threshold_overrides: Optional[MetricThresholdOverrides] = Field(
        None,
        description=(
            "Позволяет задать пользовательские пороги для метрик. "
            "Для метрик-разниц используется словарь difference, для метрик-отношений — ratio."
        ),
    )

    def model_dump_parameters(self) -> Dict[str, Any]:
        return {
            "dataset_id": self.dataset_id,
            "file_url": self.file_url,
            "sensitive_attribute": self.sensitive_attribute,
            "prediction_column": self.prediction_column,
            "actual_column": self.actual_column,
            "positive_label": self.positive_label,
            "privileged_values": self.privileged_values,
            "prediction_threshold": self.prediction_threshold,
            "notes": self.notes,
            "threshold_overrides": self.threshold_overrides.model_dump()
            if self.threshold_overrides
            else None,
        }


class BiasAuditScheduleRequest(BaseModel):
    name: str
    dataset_id: Optional[str] = None
    file_url: Optional[str] = None
    sensitive_attribute: str
    prediction_column: str
    actual_column: Optional[str] = None
    positive_label: Optional[Any] = 1
    privileged_values: Optional[List[Any]] = None
    prediction_threshold: Optional[float] = None
    threshold_overrides: Optional[MetricThresholdOverrides] = None
    frequency: str = Field(
        ..., description="Frequency of the audit (daily, weekly, monthly, quarterly, yearly)"
    )
    notes: Optional[str] = None

    def as_parameters(self) -> Dict[str, Any]:
        return {
            "dataset_id": self.dataset_id,
            "file_url": self.file_url,
            "sensitive_attribute": self.sensitive_attribute,
            "prediction_column": self.prediction_column,
            "actual_column": self.actual_column,
            "positive_label": self.positive_label,
            "privileged_values": self.privileged_values,
            "prediction_threshold": self.prediction_threshold,
            "threshold_overrides": self.threshold_overrides.model_dump()
            if self.threshold_overrides
            else None,
            "notes": self.notes,
        }


FREQUENCY_TO_DELTA = {
    "daily": timedelta(days=1),
    "weekly": timedelta(weeks=1),
    "monthly": timedelta(days=30),
    "quarterly": timedelta(days=91),
    "yearly": timedelta(days=365),
}


def _collect_metric_breaches(metrics: List[BiasAuditMetric]) -> List[Dict[str, Any]]:
    breaches: List[Dict[str, Any]] = []
    for metric in metrics:
        if metric.passed:
            continue
        breaches.append(
            {
                "name": metric.name,
                "value": metric.value,
                "threshold": metric.threshold,
                "interpretation": metric.interpretation,
            }
        )
    return breaches


def _trigger_bias_alert(result: BiasAuditResult) -> None:
    breaches = _collect_metric_breaches(result.metrics)
    if not breaches and not result.flagged:
        return

    payload = {
        "audit_id": result.id,
        "dataset_id": result.dataset_id,
        "schedule_id": result.schedule_id,
        "created_at": result.created_at,
        "flagged": result.flagged,
        "summary": result.summary,
        "breaches": breaches,
        "thresholds": result.thresholds,
        "recommendations": result.recommendations,
    }

    try:
        dispatch_webhook("bias_audit.threshold_breached", payload)
    except WebhookDeliveryError as exc:  # pragma: no cover - logging branch
        logger.warning("Failed to dispatch bias audit webhook: %s", exc, extra={"audit_id": result.id})


def _ensure_file_reference(dataset_id: Optional[str], file_url: Optional[str]) -> str:
    if dataset_id:
        for dataset in _load_datasets():
            if dataset.get("id") == dataset_id:
                linked = dataset.get("file_url")
                if linked:
                    return linked
                raise HTTPException(
                    status_code=400,
                    detail="Dataset does not have an associated file for auditing",
                )
        raise HTTPException(status_code=404, detail="Dataset not found")
    if file_url:
        return file_url
    raise HTTPException(status_code=400, detail="Either dataset_id or file_url must be provided")


def _prepare_binary(series: pd.Series, *, positive_label: Optional[Any], threshold: Optional[float]) -> (pd.Series, Any):
    if threshold is not None:
        numeric = pd.to_numeric(series, errors="coerce")
        if numeric.dropna().empty:
            raise HTTPException(status_code=400, detail="Prediction column cannot be converted to numeric using the provided threshold")
        binary = numeric >= threshold
        return binary.astype(int), f">={threshold}"

    if positive_label is not None:
        binary = series == positive_label
        return binary.astype(int), positive_label

    values = pd.unique(series.dropna())
    if len(values) != 2:
        raise HTTPException(status_code=400, detail="Column must contain exactly two unique values or specify positive_label")
    positive = values[0]
    binary = series == positive
    return binary.astype(int), positive


def _format_float(value: Optional[float]) -> Optional[float]:
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return None
    if isinstance(value, (np.floating, np.integer)):
        return float(value)
    return float(value) if value is not None else None


def _serialize_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, np.generic):
        return value.item()
    return str(value)


def _calculate_metric(
    name: str,
    value: Optional[float],
    *,
    threshold: Optional[str],
    passed: bool,
    interpretation: str,
) -> BiasAuditMetric:
    return BiasAuditMetric(
        name=name,
        value=_format_float(value),
        threshold=threshold,
        passed=passed,
        interpretation=interpretation,
    )


def _metric_interpretations(
    metric: str,
    value: Optional[float],
    *,
    threshold: float,
    ratio_bounds: Optional[Tuple[float, float]] = None,
) -> Tuple[bool, str]:
    if value is None:
        return True, "Недостаточно данных для расчета показателя."

    if metric == "disparate_impact" and ratio_bounds:
        lower, upper = ratio_bounds
        if value < lower:
            return False, "Положительные исходы реже достигаются непривилегированной группой."
        if value > upper:
            return False, "Непривилегированная группа получает существенно больше положительных исходов."
        return True, "Разница в положительных исходах находится в допустимых границах."

    if abs(value) > threshold:
        if value > 0:
            return False, "Непривилегированная группа получает больше положительных исходов."
        return False, "Привилегированная группа получает заметно больше положительных исходов."
    return True, "Различия между группами находятся в допустимых пределах."


def _resolve_difference_threshold(
    metric: str, overrides: Optional[MetricThresholdOverrides], default: float
) -> float:
    if overrides and metric in overrides.difference:
        try:
            threshold = float(overrides.difference[metric])
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid threshold override for metric '{metric}'",
            )
        if threshold < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Threshold override for metric '{metric}' must be non-negative",
            )
        return threshold
    return default


def _resolve_ratio_bounds(
    metric: str,
    overrides: Optional[MetricThresholdOverrides],
    default: Tuple[float, float],
) -> Tuple[float, float]:
    if overrides and metric in overrides.ratio:
        config = overrides.ratio[metric]
        if config.min > config.max:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid ratio bounds for metric '{metric}': min must not exceed max",
            )
        return float(config.min), float(config.max)
    return default


def _calculate_next_run(frequency: Optional[str], reference: Optional[datetime] = None) -> Optional[str]:
    if not frequency:
        return None
    delta = FREQUENCY_TO_DELTA.get(frequency.lower())
    if not delta:
        return None
    base = reference or datetime.utcnow()
    return (base + delta).isoformat() + "Z"


def _build_group_stats(
    values: List[Any],
    mask: pd.Series,
    predictions: pd.Series,
    actuals: Optional[pd.Series],
) -> GroupStats:
    count = int(mask.sum())
    positive_rate = None
    true_positive_rate = None
    false_positive_rate = None
    false_negative_rate = None
    positive_predictive_value = None
    if count > 0:
        positive_rate = _format_float(predictions[mask].mean())
        if actuals is not None:
            positives = actuals[mask] == 1
            negatives = actuals[mask] == 0
            positive_predictions = predictions[mask] == 1
            if positives.sum() > 0:
                true_positive_rate = _format_float((positive_predictions & positives).sum() / positives.sum())
                false_negative_rate = _format_float(((~positive_predictions) & positives).sum() / positives.sum())
            if negatives.sum() > 0:
                false_positive_rate = _format_float((positive_predictions & negatives).sum() / negatives.sum())
            predicted_positive_total = positive_predictions.sum()
            if predicted_positive_total > 0:
                positive_predictive_value = _format_float(
                    (positive_predictions & positives).sum() / predicted_positive_total
                )
    return GroupStats(
        values=[str(v) for v in values],
        count=count,
        positive_rate=positive_rate,
        true_positive_rate=true_positive_rate,
        false_positive_rate=false_positive_rate,
        false_negative_rate=false_negative_rate,
        positive_predictive_value=positive_predictive_value,
    )


def _resolve_privileged_groups(series: pd.Series, privileged_values: Optional[List[Any]]) -> (pd.Series, pd.Series, List[Any]):
    if privileged_values:
        priv_mask = series.isin(privileged_values)
        if not priv_mask.any():
            raise HTTPException(status_code=400, detail="Privileged values do not match any records in the dataset")
        return priv_mask, ~priv_mask, privileged_values

    counts = series.value_counts()
    if counts.empty:
        raise HTTPException(status_code=400, detail="Sensitive attribute column is empty")
    privileged_value = counts.idxmax()
    priv_mask = series == privileged_value
    return priv_mask, ~priv_mask, [privileged_value]


@router.post("/bias/run")
def run_bias_audit(payload: BiasAuditRequest):
    file_identifier = _ensure_file_reference(payload.dataset_id, payload.file_url)
    resolve_file_path(file_identifier)  # ensure file exists before loading
    df = load_dataframe_from_identifier(file_identifier)

    required_columns = [payload.sensitive_attribute, payload.prediction_column]
    if payload.actual_column:
        required_columns.append(payload.actual_column)
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns in dataset: {', '.join(missing)}")

    working_df = df[required_columns].dropna()
    if working_df.empty:
        raise HTTPException(status_code=400, detail="No rows remain after dropping missing values")

    sensitive_series = working_df[payload.sensitive_attribute]
    privileged_mask, unprivileged_mask, privileged_values = _resolve_privileged_groups(
        sensitive_series, payload.privileged_values
    )
    unique_sensitive_values = list(pd.unique(sensitive_series))
    unprivileged_values = [value for value in unique_sensitive_values if value not in privileged_values]
    if not unprivileged_mask.any():
        raise HTTPException(status_code=400, detail="Dataset must contain records for non-privileged groups")

    overrides = payload.threshold_overrides
    applied_thresholds: Dict[str, Dict[str, Any]] = {"difference": {}, "ratio": {}}

    prediction_binary, positive_value = _prepare_binary(
        working_df[payload.prediction_column],
        positive_label=payload.positive_label,
        threshold=payload.prediction_threshold,
    )
    working_df = working_df.assign(prediction_binary=prediction_binary)

    actual_binary = None
    actual_positive_value = None
    if payload.actual_column:
        actual_binary, actual_positive_value = _prepare_binary(
            working_df[payload.actual_column],
            positive_label=payload.positive_label,
            threshold=None,
        )
        working_df = working_df.assign(actual_binary=actual_binary)

    priv_predictions = working_df.loc[privileged_mask, "prediction_binary"].astype(int)
    unpriv_predictions = working_df.loc[unprivileged_mask, "prediction_binary"].astype(int)

    privileged_positive_rate = priv_predictions.mean() if not priv_predictions.empty else None
    unpriv_positive_rate = unpriv_predictions.mean() if not unpriv_predictions.empty else None

    statistical_parity_difference = None
    disparate_impact = None
    if privileged_positive_rate is not None and unpriv_positive_rate is not None:
        statistical_parity_difference = float(unpriv_positive_rate - privileged_positive_rate)
        if privileged_positive_rate > 0:
            disparate_impact = float(unpriv_positive_rate / privileged_positive_rate)

    equal_opportunity_difference = None
    average_odds_difference = None
    false_negative_rate_difference = None
    predictive_parity_difference = None
    priv_group_stats = None
    unpriv_group_stats = None

    if actual_binary is not None:
        priv_actual = working_df.loc[privileged_mask, "actual_binary"].astype(int)
        unpriv_actual = working_df.loc[unprivileged_mask, "actual_binary"].astype(int)

        priv_tpr = None
        unpriv_tpr = None
        priv_fpr = None
        unpriv_fpr = None
        priv_fnr = None
        unpriv_fnr = None
        priv_ppv = None
        unpriv_ppv = None

        if priv_actual.sum() > 0:
            priv_tpr = float(((priv_predictions == 1) & (priv_actual == 1)).sum() / priv_actual.sum())
            priv_fnr = float(((priv_predictions == 0) & (priv_actual == 1)).sum() / priv_actual.sum())
        if unpriv_actual.sum() > 0:
            unpriv_tpr = float(((unpriv_predictions == 1) & (unpriv_actual == 1)).sum() / unpriv_actual.sum())
            unpriv_fnr = float(((unpriv_predictions == 0) & (unpriv_actual == 1)).sum() / unpriv_actual.sum())
        priv_negatives = (priv_actual == 0).sum()
        unpriv_negatives = (unpriv_actual == 0).sum()
        if priv_negatives > 0:
            priv_fpr = float(((priv_predictions == 1) & (priv_actual == 0)).sum() / priv_negatives)
        if unpriv_negatives > 0:
            unpriv_fpr = float(((unpriv_predictions == 1) & (unpriv_actual == 0)).sum() / unpriv_negatives)
        priv_predicted_positive = (priv_predictions == 1).sum()
        unpriv_predicted_positive = (unpriv_predictions == 1).sum()
        if priv_predicted_positive > 0:
            priv_ppv = float(((priv_predictions == 1) & (priv_actual == 1)).sum() / priv_predicted_positive)
        if unpriv_predicted_positive > 0:
            unpriv_ppv = float(((unpriv_predictions == 1) & (unpriv_actual == 1)).sum() / unpriv_predicted_positive)

        if priv_tpr is not None and unpriv_tpr is not None:
            equal_opportunity_difference = float(unpriv_tpr - priv_tpr)
        if (
            priv_tpr is not None
            and unpriv_tpr is not None
            and priv_fpr is not None
            and unpriv_fpr is not None
        ):
            average_odds_difference = float(((unpriv_tpr - priv_tpr) + (unpriv_fpr - priv_fpr)) / 2)

        if priv_fnr is not None and unpriv_fnr is not None:
            false_negative_rate_difference = float(unpriv_fnr - priv_fnr)
        if priv_ppv is not None and unpriv_ppv is not None:
            predictive_parity_difference = float(unpriv_ppv - priv_ppv)

        priv_group_stats = _build_group_stats(
            values=privileged_values,
            mask=privileged_mask,
            predictions=working_df["prediction_binary"],
            actuals=working_df["actual_binary"],
        )
        unpriv_group_stats = _build_group_stats(
            values=unprivileged_values,
            mask=unprivileged_mask,
            predictions=working_df["prediction_binary"],
            actuals=working_df["actual_binary"],
        )
    else:
        priv_group_stats = _build_group_stats(
            values=privileged_values,
            mask=privileged_mask,
            predictions=working_df["prediction_binary"],
            actuals=None,
        )
        unpriv_group_stats = _build_group_stats(
            values=unprivileged_values,
            mask=unprivileged_mask,
            predictions=working_df["prediction_binary"],
            actuals=None,
        )

    metrics: List[BiasAuditMetric] = []
    flagged = False
    recommendations: List[str] = []

    sp_threshold = _resolve_difference_threshold(
        "statistical_parity_difference", overrides, 0.1
    )
    applied_thresholds["difference"]["statistical_parity_difference"] = sp_threshold
    sp_passed, sp_text = _metric_interpretations(
        "statistical_parity_difference",
        statistical_parity_difference,
        threshold=sp_threshold,
    )
    metrics.append(
        _calculate_metric(
            "statistical_parity_difference",
            statistical_parity_difference,
            threshold=f"|difference| ≤ {sp_threshold:.3f}",
            passed=sp_passed,
            interpretation=sp_text,
        )
    )
    if not sp_passed:
        flagged = True
        recommendations.append(
            "Сбалансируйте обучающую выборку или настройте веса классов для снижения дисбаланса положительных исходов."
        )

    di_lower, di_upper = _resolve_ratio_bounds("disparate_impact", overrides, (0.8, 1.25))
    applied_thresholds["ratio"]["disparate_impact"] = {"min": di_lower, "max": di_upper}
    di_passed, di_text = _metric_interpretations(
        "disparate_impact",
        disparate_impact,
        threshold=0.0,
        ratio_bounds=(di_lower, di_upper),
    )
    metrics.append(
        _calculate_metric(
            "disparate_impact",
            disparate_impact,
            threshold=f"{di_lower:.2f} ≤ ratio ≤ {di_upper:.2f}",
            passed=di_passed,
            interpretation=di_text,
        )
    )
    if not di_passed:
        flagged = True
        recommendations.append(
            "Проведите анализ признаков и смягчение смещения (reweighing, adversarial debiasing)."
        )

    if payload.actual_column:
        eod_threshold = _resolve_difference_threshold(
            "equal_opportunity_difference", overrides, 0.1
        )
        applied_thresholds["difference"]["equal_opportunity_difference"] = eod_threshold
        eod_passed, eod_text = _metric_interpretations(
            "equal_opportunity_difference",
            equal_opportunity_difference,
            threshold=eod_threshold,
        )
        metrics.append(
            _calculate_metric(
                "equal_opportunity_difference",
                equal_opportunity_difference,
                threshold=f"|difference| ≤ {eod_threshold:.3f}",
                passed=eod_passed,
                interpretation=eod_text,
            )
        )
        if not eod_passed:
            flagged = True
            recommendations.append(
                "Перепроверьте качество данных и настройку классификатора на предмет недопредставленности групп."
            )

        aod_threshold = _resolve_difference_threshold(
            "average_odds_difference", overrides, 0.1
        )
        applied_thresholds["difference"]["average_odds_difference"] = aod_threshold
        aod_passed, aod_text = _metric_interpretations(
            "average_odds_difference",
            average_odds_difference,
            threshold=aod_threshold,
        )
        metrics.append(
            _calculate_metric(
                "average_odds_difference",
                average_odds_difference,
                threshold=f"|difference| ≤ {aod_threshold:.3f}",
                passed=aod_passed,
                interpretation=aod_text,
            )
        )
        if not aod_passed:
            flagged = True
            recommendations.append(
                "Рассмотрите алгоритмы пост-обработки (calibrated equalized odds) для выравнивания ошибок."
            )

        fnr_threshold = _resolve_difference_threshold(
            "false_negative_rate_difference", overrides, 0.1
        )
        applied_thresholds["difference"]["false_negative_rate_difference"] = fnr_threshold
        fnr_passed, fnr_text = _metric_interpretations(
            "false_negative_rate_difference",
            false_negative_rate_difference,
            threshold=fnr_threshold,
        )
        metrics.append(
            _calculate_metric(
                "false_negative_rate_difference",
                false_negative_rate_difference,
                threshold=f"|difference| ≤ {fnr_threshold:.3f}",
                passed=fnr_passed,
                interpretation=fnr_text,
            )
        )
        if not fnr_passed:
            flagged = True
            recommendations.append(
                "Проверьте баланс положительных примеров по группам и примените методы ресемплинга или корректировки весов."
            )

        ppv_threshold = _resolve_difference_threshold(
            "predictive_parity_difference", overrides, 0.1
        )
        applied_thresholds["difference"]["predictive_parity_difference"] = ppv_threshold
        ppv_passed, ppv_text = _metric_interpretations(
            "predictive_parity_difference",
            predictive_parity_difference,
            threshold=ppv_threshold,
        )
        metrics.append(
            _calculate_metric(
                "predictive_parity_difference",
                predictive_parity_difference,
                threshold=f"|difference| ≤ {ppv_threshold:.3f}",
                passed=ppv_passed,
                interpretation=ppv_text,
            )
        )
        if not ppv_passed:
            flagged = True
            recommendations.append(
                "Проверьте откалиброванность модели и качество признаков, влияющих на вероятность положительного решения."
            )

    if not recommendations:
        recommendations.append(
            "Поддерживайте регулярное расписание проверок и отслеживайте изменения метрик со временем."
        )

    summary_parts = []
    if flagged:
        summary_parts.append("Обнаружены потенциальные признаки смещения.")
    else:
        summary_parts.append("Существенных признаков смещения не выявлено.")
    if payload.actual_column:
        if equal_opportunity_difference is not None:
            summary_parts.append(
                f"Разница в чувствительности между группами составляет {equal_opportunity_difference:.3f}."
            )
        if false_negative_rate_difference is not None:
            summary_parts.append(
                f"Разница в доле пропущенных положительных случаев: {false_negative_rate_difference:.3f}."
            )
        if predictive_parity_difference is not None:
            summary_parts.append(
                f"Разница в точности положительных решений: {predictive_parity_difference:.3f}."
            )
    if statistical_parity_difference is not None:
        summary_parts.append(
            f"Статистический паритет отклоняется на {statistical_parity_difference:.3f}."
        )
    summary = " ".join(summary_parts)

    created_at = datetime.utcnow().isoformat() + "Z"
    parameters = payload.model_dump_parameters()
    parameters["resolved_positive_label"] = _serialize_value(positive_value)
    if actual_positive_value is not None:
        parameters["resolved_actual_positive_label"] = _serialize_value(actual_positive_value)
    if payload.schedule_frequency:
        parameters["schedule_frequency"] = payload.schedule_frequency

    applied_thresholds = {key: value for key, value in applied_thresholds.items() if value}

    result = BiasAuditResult(
        id=str(uuid.uuid4()),
        dataset_id=payload.dataset_id,
        file_url=file_identifier,
        schedule_id=payload.schedule_id,
        created_at=created_at,
        parameters=parameters,
        sample_size=int(len(working_df)),
        dropped_rows=int(len(df) - len(working_df)),
        metrics=metrics,
        group_metrics={
            "privileged": priv_group_stats,
            "unprivileged": unpriv_group_stats,
        },
        flagged=flagged,
        summary=summary,
        recommendations=recommendations,
        next_run_due=_calculate_next_run(payload.schedule_frequency),
        thresholds=applied_thresholds,
    )

    if payload.save_result:
        history = _load_json(AUDIT_HISTORY_PATH)
        history.append(result.model_dump())
        _save_json(AUDIT_HISTORY_PATH, history)

    if payload.schedule_id:
        schedules = _load_json(AUDIT_SCHEDULES_PATH)
        updated = False
        for schedule in schedules:
            if schedule.get("id") == payload.schedule_id:
                schedule["last_run_at"] = created_at
                schedule["next_run_due"] = _calculate_next_run(
                    schedule.get("frequency"), datetime.utcnow()
                )
                updated = True
                break
        if updated:
            _save_json(AUDIT_SCHEDULES_PATH, schedules)

    _trigger_bias_alert(result)

    return {"status": "completed", "audit": result.model_dump()}


@router.get("/bias/history")
def list_audit_history() -> Dict[str, Any]:
    history = _load_json(AUDIT_HISTORY_PATH)
    history.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return {"items": history, "count": len(history)}


@router.delete("/bias/history/{audit_id}")
def delete_audit_record(audit_id: str):
    history = _load_json(AUDIT_HISTORY_PATH)
    filtered = [item for item in history if item.get("id") != audit_id]
    if len(filtered) == len(history):
        raise HTTPException(status_code=404, detail="Audit entry not found")
    _save_json(AUDIT_HISTORY_PATH, filtered)
    return {"status": "deleted", "id": audit_id}


@router.get("/bias/schedules")
def list_schedules() -> Dict[str, Any]:
    schedules = _load_json(AUDIT_SCHEDULES_PATH)
    schedules.sort(key=lambda item: item.get("next_run_due") or "")
    return {"items": schedules, "count": len(schedules)}


@router.post("/bias/schedules")
def create_schedule(payload: BiasAuditScheduleRequest):
    file_identifier = _ensure_file_reference(payload.dataset_id, payload.file_url)
    resolve_file_path(file_identifier)

    schedule = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "dataset_id": payload.dataset_id,
        "file_url": file_identifier,
        "frequency": payload.frequency,
        "notes": payload.notes,
        "parameters": payload.as_parameters(),
        "created_at": datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.utcnow().isoformat() + "Z",
        "last_run_at": None,
        "next_run_due": _calculate_next_run(payload.frequency),
    }

    schedules = _load_json(AUDIT_SCHEDULES_PATH)
    schedules.append(schedule)
    _save_json(AUDIT_SCHEDULES_PATH, schedules)
    return {"status": "created", "schedule": schedule}


@router.put("/bias/schedules/{schedule_id}")
def update_schedule(schedule_id: str, payload: BiasAuditScheduleRequest):
    schedules = _load_json(AUDIT_SCHEDULES_PATH)
    updated = False
    for schedule in schedules:
        if schedule.get("id") == schedule_id:
            file_identifier = _ensure_file_reference(payload.dataset_id, payload.file_url)
            resolve_file_path(file_identifier)
            schedule.update(
                {
                    "name": payload.name,
                    "dataset_id": payload.dataset_id,
                    "file_url": file_identifier,
                    "frequency": payload.frequency,
                    "notes": payload.notes,
                    "parameters": payload.as_parameters(),
                    "updated_at": datetime.utcnow().isoformat() + "Z",
                    "next_run_due": _calculate_next_run(payload.frequency),
                }
            )
            updated = True
            break
    if not updated:
        raise HTTPException(status_code=404, detail="Schedule not found")
    _save_json(AUDIT_SCHEDULES_PATH, schedules)
    return {"status": "updated", "schedule": schedule}


@router.delete("/bias/schedules/{schedule_id}")
def delete_schedule(schedule_id: str):
    schedules = _load_json(AUDIT_SCHEDULES_PATH)
    filtered = [item for item in schedules if item.get("id") != schedule_id]
    if len(filtered) == len(schedules):
        raise HTTPException(status_code=404, detail="Schedule not found")
    _save_json(AUDIT_SCHEDULES_PATH, filtered)
    return {"status": "deleted", "id": schedule_id}
