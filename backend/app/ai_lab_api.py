"""AI Laboratory specific endpoints: unified series + forecasting + training jobs."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .services.data_audit import get_latest_audit
from .services.job_manager import manager
from .services.series_provider import build_request, provider
from .services.time_series_engine import ForecastConfig, TimeSeriesForecaster
from .services.time_series_registry import registry


router = APIRouter(prefix="/ai-lab", tags=["ai-lab"])


DEFAULT_METHODS = ["sarima", "ets", "linear_regression", "lagged_regression", "random_forest", "gradient_boosting"]


def _parse_period(value: Optional[str]) -> Optional[pd.Timestamp]:
    if not value:
        return None
    layouts = ["%Y-%m-%d", "%Y-%m"]
    for layout in layouts:
        try:
            dt = datetime.strptime(value, layout)
            return pd.Timestamp(year=dt.year, month=dt.month, day=1)
        except ValueError:
            continue
    return None


class ForecastRequest(BaseModel):
    dataset_id: str = Field(..., description="Идентификатор набора данных")
    date_column: str = Field("month", description="Колонка даты/периода")
    value_column: str = Field("target_value", description="Колонка с целевыми значениями")
    sef_columns: List[str] = Field(default_factory=list, description="Числовые колонки-факторы")
    methods: List[str] = Field(default_factory=lambda: list(DEFAULT_METHODS))
    horizon: int = Field(12, ge=1, le=36)
    ensemble_mode: str = Field("weighted", description="none|simple|weighted")
    start: Optional[str] = Field(None, description="Дата начала диапазона (YYYY-MM)")
    end: Optional[str] = Field(None, description="Дата конца диапазона (YYYY-MM)")


class TrainingJobRequest(ForecastRequest):
    mode: str = Field("retrain", description="train|retrain|finetune|evaluate")
    model_id: Optional[str] = None


def _ensure_model(dataset_id: Optional[str], date_column: str, value_column: str, sef_columns: List[str]) -> None:
    if not dataset_id or registry.get_active_model(dataset_id):
        return
    config = ForecastConfig(
        dataset_id=dataset_id,
        date_column=date_column,
        value_column=value_column,
        sef_columns=sef_columns,
        methods=DEFAULT_METHODS,
        horizon=12,
        ensemble_mode="weighted",
    )
    try:
        TimeSeriesForecaster(config).train()
        provider.invalidate_dataset(dataset_id)
    except ValueError:
        # Если данных недостаточно, просто пропускаем bootstrap
        return


@router.get("/series")
def get_series(
    target: Optional[str] = Query(None, description="alias для dataset_id"),
    dataset_id: Optional[str] = Query(None),
    date_column: Optional[str] = Query(None),
    value_column: Optional[str] = Query(None),
    sef_columns: Optional[str] = Query(None, description="Через запятую"),
    start: Optional[str] = Query(None, alias="from"),
    end: Optional[str] = Query(None, alias="to"),
    horizon: int = Query(12, ge=1, le=36),
):
    effective_id = dataset_id or target
    params: Dict[str, Any] = {
        "dataset_id": effective_id,
        "date_column": date_column,
        "value_column": value_column,
        "sef_columns": sef_columns,
        "from": start,
        "to": end,
        "horizon": horizon,
    }
    try:
        request = build_request(params)
        _ensure_model(request.dataset_id, request.date_column, request.value_column, list(request.sef_columns))
        data = provider.get_series(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return data


@router.post("/forecast")
def run_forecast(payload: ForecastRequest):
    config = ForecastConfig(
        dataset_id=payload.dataset_id,
        date_column=payload.date_column,
        value_column=payload.value_column,
        sef_columns=payload.sef_columns,
        methods=payload.methods or DEFAULT_METHODS,
        horizon=payload.horizon,
        ensemble_mode=payload.ensemble_mode,
        start=_parse_period(payload.start),
        end=_parse_period(payload.end),
    )
    try:
        result = TimeSeriesForecaster(config).train()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    provider.invalidate_dataset(payload.dataset_id)
    return {
        "forecast": result.forecast,
        "backtest": result.backtest,
        "correlations": result.correlations,
        "best_model": result.best_model,
        "feature_importance": result.feature_importance,
        "artifact_dir": str(result.artifact_dir),
    }


@router.get("/models")
def list_models():
    return {"items": registry.list_models()}


@router.post("/models/{model_id}/activate")
def activate_model(model_id: str):
    record = registry.set_active(model_id)
    if not record:
        raise HTTPException(status_code=404, detail="Model not found")
    provider.invalidate_dataset(record.get("dataset_id"))
    return {"status": "activated", "model": record}


@router.post("/models/{model_id}/deactivate")
def deactivate_model(model_id: str):
    record = registry.deactivate(model_id)
    if not record:
        raise HTTPException(status_code=404, detail="Model not found")
    provider.invalidate_dataset(record.get("dataset_id"))
    return {"status": "deactivated", "model": record}


def _run_background_training(payload: ForecastRequest, logger, mode: str, base_model_id: Optional[str]) -> Dict[str, Any]:
    config = ForecastConfig(
        dataset_id=payload.dataset_id,
        date_column=payload.date_column,
        value_column=payload.value_column,
        sef_columns=payload.sef_columns,
        methods=payload.methods or DEFAULT_METHODS,
        horizon=payload.horizon,
        ensemble_mode=payload.ensemble_mode,
        start=_parse_period(payload.start),
        end=_parse_period(payload.end),
    )
    if mode == "finetune" and base_model_id:
        base = registry.get(base_model_id)
        if base and base.get("trained_to"):
            start_period = pd.Timestamp(base["trained_to"]) + pd.offsets.MonthBegin(1)
            config.start = start_period
    activate = mode != "evaluate"
    result = TimeSeriesForecaster(config, logger=logger).train(persist=True, activate=activate)
    provider.invalidate_dataset(payload.dataset_id)
    return {
        "best_model": result.best_model,
        "artifact_dir": str(result.artifact_dir),
    }


@router.post("/models/train")
def submit_training_job(payload: TrainingJobRequest):
    if payload.mode not in {"train", "retrain", "finetune", "evaluate"}:
        raise HTTPException(status_code=400, detail="mode must be train|retrain|finetune|evaluate")
    job_id = manager.submit(
        label=f"{payload.mode}-{payload.dataset_id}",
        func=_run_background_training,
        kwargs={
            "payload": payload,
            "mode": payload.mode,
            "base_model_id": payload.model_id,
        },
    )
    return {"job_id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/audit-suggestions/{dataset_id}")
def audit_suggestions(dataset_id: str):
    report = get_latest_audit(dataset_id)
    if not report:
        raise HTTPException(status_code=404, detail="Audit report not found")
    return {
        "dataset_id": dataset_id,
        "date_column": report.get("date_column"),
        "target_column": report.get("target_column"),
        "sef_candidates": report.get("sef_candidates") or [],
        "status": report.get("status"),
        "reasons": report.get("reasons"),
    }
