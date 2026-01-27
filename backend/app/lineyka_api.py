from __future__ import annotations

import io
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .ai_lab_api import DEFAULT_METHODS
from .datasets_api import DatasetCreate, DatasetUpdate, create_dataset, update_dataset
from .schemas.lineyka import (
    ForecastJobRequest,
    LineykaAuditRequest,
    LineykaPublishRequest,
    LineykaQueryRequest,
    LineykaTransformRequest,
)
from .security import get_current_user
from .services.data_audit import run_data_audit
from .services.dataset_store import (
    get_dataset as get_registered_dataset,
    get_dataset_file,
    list_datasets as list_registered_datasets,
)
from .services.job_manager import manager
from .services.lineyka_engine import (
    apply_operations,
    integrate_forecast,
    query_version,
    unique_column_values,
)
from .services.lineyka_store import DatasetNotFound, VersionNotFound, VersionRecord, store, RESERVED_COLUMNS
from .services.time_series_engine import ForecastConfig, TimeSeriesForecaster
from .services.user_store import UserRecord
from .utils.files import DATA_DIR


router = APIRouter(prefix="/lineyka", tags=["lineyka"])
PUBLISHED_DATASETS_DIR = DATA_DIR / "lineyka_published"
PUBLISHED_DATASETS_DIR.mkdir(parents=True, exist_ok=True)


def _version_payload(record: VersionRecord) -> Dict[str, Any]:
    return {
        "dataset_id": record.dataset_id,
        "version_id": record.version_id,
        "parent_version_id": record.parent_version_id,
        "row_count": record.row_count,
        "column_count": record.column_count,
        "created_at": record.created_at,
        "created_by": record.created_by,
        "schema": record.schema,
        "summary": record.summary,
        "operation": record.operation,
        "pipeline": record.pipeline,
    }


def _visible_schema(record: VersionRecord) -> List[Dict[str, Any]]:
    return [column for column in record.schema if column.get("name") not in RESERVED_COLUMNS]


def _export_dataframe(dataset_id: str, version_id: str):
    df = store.load_dataframe(dataset_id, version_id)
    reserved = [column for column in RESERVED_COLUMNS if column in df.columns]
    if reserved:
        return df.drop(columns=reserved)
    return df.copy()


@router.get("/datasets")
def list_lineyka_datasets(current_user: UserRecord = Depends(get_current_user)) -> Dict[str, Any]:
    user_id = current_user.get("id")
    for dataset in list_registered_datasets():
        dataset_id = dataset.get("id") or dataset.get("dataset_id")
        if not dataset_id:
            continue
        try:
            store.ensure_base_version(dataset_id, user_id=user_id)
        except DatasetNotFound:
            continue
    return {"items": store.list_datasets()}


@router.get("/datasets/{dataset_id}/versions")
def list_versions(dataset_id: str, current_user: UserRecord = Depends(get_current_user)) -> Dict[str, Any]:
    try:
        store.ensure_base_version(dataset_id, user_id=current_user.get("id"))
        versions = store.get_versions(dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"items": [_version_payload(version) for version in versions]}


@router.get("/datasets/{dataset_id}/versions/{version_id}")
def fetch_version(dataset_id: str, version_id: str, current_user: UserRecord = Depends(get_current_user)) -> Dict[str, Any]:
    del current_user
    try:
        version = store.get_version(dataset_id, version_id)
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _version_payload(version)


@router.post("/datasets/{dataset_id}/versions/{version_id}/query")
def query_dataset(
    dataset_id: str,
    version_id: str,
    payload: LineykaQueryRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    del current_user
    try:
        return query_version(dataset_id, version_id, payload)
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/datasets/{dataset_id}/versions/{version_id}/values/{column}")
def column_values(
    dataset_id: str,
    version_id: str,
    column: str,
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    del current_user
    try:
        values = unique_column_values(dataset_id, version_id, column, search=search, limit=limit)
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"items": values}


@router.post("/datasets/{dataset_id}/versions/{version_id}/transform")
def transform_dataset(
    dataset_id: str,
    version_id: str,
    payload: LineykaTransformRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        result = apply_operations(dataset_id, version_id, payload.operations, user_id=current_user.get("id"))
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok", "version": _version_payload(result)}


class RevertRequest(BaseModel):
    target_version_id: str
    reason: Optional[str] = None


@router.post("/datasets/{dataset_id}/versions/{version_id}/revert")
def revert_dataset(
    dataset_id: str,
    version_id: str,
    payload: RevertRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        store.get_version(dataset_id, version_id)
        clone = store.duplicate_version(
            dataset_id,
            payload.target_version_id,
            user_id=current_user.get("id"),
            reason=payload.reason or "manual-revert",
        )
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "ok", "version": _version_payload(clone)}


@router.get("/datasets/{dataset_id}/history/export")
def export_history(dataset_id: str, current_user: UserRecord = Depends(get_current_user)) -> Dict[str, Any]:
    del current_user
    try:
        return store.export_history(dataset_id)
    except DatasetNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/datasets/{dataset_id}/versions/{version_id}/export")
def export_version(
    dataset_id: str,
    version_id: str,
    format: str = Query("csv", pattern="^(csv|xlsx)$"),
    current_user: UserRecord = Depends(get_current_user),
):
    del current_user
    try:
        df = store.load_dataframe(dataset_id, version_id)
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    buffer = io.BytesIO()
    filename = f"{dataset_id}-{version_id}.{format}"
    media_type = "text/csv"
    if format == "xlsx":
        df.to_excel(buffer, index=False)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        df.to_csv(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type=media_type, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/datasets/{dataset_id}/versions/{version_id}/publish")
def publish_version_payload(
    dataset_id: str,
    version_id: str,
    payload: LineykaPublishRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    del current_user
    try:
        version = store.get_version(dataset_id, version_id)
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    dataframe = _export_dataframe(dataset_id, version_id)
    columns = _visible_schema(version)
    sample_data = dataframe.head(5).to_dict(orient="records")
    row_count = int(len(dataframe))
    if payload.mode == "update":
        target_id = payload.target_dataset_id or dataset_id
        dataset = get_registered_dataset(target_id)
        if not dataset:
            raise HTTPException(status_code=404, detail="Набор не найден")
        file_reference = get_dataset_file(target_id, dataset.get("file_url"))
        if not file_reference:
            raise HTTPException(status_code=404, detail="Файл набора недоступен")
        target_path = Path(file_reference)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        dataframe.to_csv(target_path, index=False)
        update_payload: Dict[str, Any] = {
            "columns": columns,
            "row_count": row_count,
            "sample_data": sample_data,
        }
        if payload.name:
            update_payload["name"] = payload.name
        if payload.description is not None:
            update_payload["description"] = payload.description
        update_dataset(target_id, DatasetUpdate(**update_payload))
        return {"status": "updated", "dataset_id": target_id}

    new_dataset_id = f"lineyka-{uuid.uuid4().hex}"
    target_path = PUBLISHED_DATASETS_DIR / f"{new_dataset_id}.csv"
    dataframe.to_csv(target_path, index=False)
    create_payload = DatasetCreate(
        name=payload.name or version.dataset_id,
        description=payload.description or f"Сохранено из Линейки ({dataset_id})",
        columns=columns,
        row_count=row_count,
        file_url=str(target_path),
        sample_data=sample_data,
    )
    created = create_dataset(create_payload)
    return {"status": "created", "dataset_id": created["id"], "dataset": created["dataset"]}


def _run_forecast_job(
    *,
    dataset_id: str,
    version_id: str,
    payload: Dict[str, Any],
    user_id: Optional[str],
    logger,
) -> Dict[str, Any]:
    request = ForecastJobRequest(**payload)
    version = store.get_version(dataset_id, version_id)
    config = ForecastConfig(
        dataset_id=f"{dataset_id}:{version_id}",
        date_column=request.date_column,
        value_column=request.value_column,
        sef_columns=request.sef_columns,
        methods=request.methods or DEFAULT_METHODS,
        horizon=request.horizon,
        ensemble_mode=request.ensemble_mode,
        file_identifier=str(version.file_path),
    )
    forecaster = TimeSeriesForecaster(config, logger=logger)
    result = forecaster.train()
    rows = [
        {
            "date": entry.get("date"),
            "forecast_yhat": entry.get("yhat"),
            "forecast_lower": entry.get("lower"),
            "forecast_upper": entry.get("upper"),
            "forecast_model_id": (result.best_model or {}).get("id"),
            "forecast_scenario": entry.get("scenario") or "baseline",
        }
        for entry in result.forecast
    ]
    if not rows:
        raise ValueError("Прогноз не вернул значений")
    metadata = {
        "mode": request.mode,
        "date_column": request.date_column,
        "value_column": request.value_column,
        "sef_columns": request.sef_columns,
        "horizon": request.horizon,
        "methods": request.methods or DEFAULT_METHODS,
        "best_model": result.best_model,
        "source_version_id": version_id,
        "user_id": user_id,
    }
    new_version = integrate_forecast(
        dataset_id,
        version_id,
        result_rows=rows,
        mode=request.mode,
        user_id=user_id,
        metadata=metadata,
    )
    return {"version_id": new_version.version_id, "rows": len(rows), "best_model": result.best_model}


@router.post("/datasets/{dataset_id}/versions/{version_id}/forecast/jobs")
def enqueue_forecast(
    dataset_id: str,
    version_id: str,
    payload: ForecastJobRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        store.get_version(dataset_id, version_id)
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    job_id = manager.submit(
        label=f"lineyka-forecast-{dataset_id}",
        func=_run_forecast_job,
        kwargs={
            "dataset_id": dataset_id,
            "version_id": version_id,
            "payload": payload.model_dump(),
            "user_id": current_user.get("id"),
        },
    )
    return {"job_id": job_id, "status": "queued"}


@router.get("/jobs/{job_id}")
def forecast_job(job_id: str, current_user: UserRecord = Depends(get_current_user)) -> Dict[str, Any]:
    del current_user
    job = manager.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return job


@router.post("/datasets/{dataset_id}/versions/{version_id}/audit")
def run_version_audit(
    dataset_id: str,
    version_id: str,
    payload: LineykaAuditRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> Dict[str, Any]:
    try:
        version = store.get_version(dataset_id, version_id)
    except VersionNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    report = run_data_audit(
        dataset_id,
        date_column=payload.date_column,
        target_column=payload.target_column,
        file_identifier=str(version.file_path),
    )
    store.record_audit(dataset_id, version_id, report)
    return {"status": "completed", "report": report}


@router.get("/datasets/{dataset_id}/versions/{version_id}/audit")
def fetch_version_audit(dataset_id: str, version_id: str, current_user: UserRecord = Depends(get_current_user)) -> Dict[str, Any]:
    del current_user
    report = store.get_audit(dataset_id, version_id)
    if not report:
        raise HTTPException(status_code=404, detail="Аудит отсутствует")
    return report
