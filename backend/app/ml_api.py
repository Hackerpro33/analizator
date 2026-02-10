from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator

from .services.dataset_store import list_datasets
from .services.metadata_repository import get_model_tracking_repository
from .services.ml_engine import (
    MLService,
    MLTrainingError,
    TrainingConfig,
    algorithm_catalog,
    service as ml_service,
)
from .services.model_runner import get_model_runner, ModelExecutionError
from .schemas.ml import (
    AlertPayload,
    ModelResult as ModelResultSchema,
    ModelRun as ModelRunSchema,
)


def get_ml_service() -> MLService:
    return ml_service


router = APIRouter(prefix="/ml", tags=["ml"])


class TrainingRequest(BaseModel):
    name: str = Field(..., description="Имя модели")
    dataset_id: Optional[str] = Field(None, description="Идентификатор набора из каталога")
    file_url: Optional[str] = Field(
        None,
        description="Прямой идентификатор файла (если набор не зарегистрирован)",
    )
    target_column: str = Field(..., description="Колонка с целевой переменной")
    feature_columns: Optional[List[str]] = Field(
        default=None,
        description="Список признаков. Если не указано — берем все кроме целевой колонки.",
    )
    task_type: Literal["classification", "regression"] = Field(
        ...,
        description="Тип задачи, определяющий алгоритмы и метрики",
    )
    algorithm: str = Field(..., description="Алгоритм обучения")
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    test_size: float = Field(0.2, ge=0.1, le=0.4)
    random_state: Optional[int] = Field(None, ge=1)
    description: Optional[str] = Field(None, max_length=500)

    @model_validator(mode="after")
    def validate_source(self) -> "TrainingRequest":
        if not self.dataset_id and not self.file_url:
            raise ValueError("Укажите dataset_id или file_url")
        return self


class PredictionRequest(BaseModel):
    records: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Произвольные записи для инференса",
    )
    dataset_id: Optional[str] = Field(
        default=None,
        description="Идентификатор зарегистрированного набора",
    )
    file_url: Optional[str] = Field(
        default=None,
        description="Внутренний идентификатор файла",
    )
    limit: int = Field(120, ge=1, le=1000)

    @model_validator(mode="after")
    def validate_payload(self) -> "PredictionRequest":
        if not self.records and not self.dataset_id and not self.file_url:
            raise ValueError("Передайте records или ссылку на набор данных")
        return self


def _public_model(metadata: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(metadata)
    payload.pop("artifact_path", None)
    return payload


def _dataset_summary(dataset: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": dataset.get("id"),
        "name": dataset.get("name"),
        "description": dataset.get("description"),
        "row_count": dataset.get("row_count"),
        "tags": dataset.get("tags") or [],
        "columns": dataset.get("columns") or [],
        "file_url": dataset.get("file_url"),
        "updated_at": dataset.get("updated_at") or dataset.get("created_at"),
    }


@router.get("/catalog", summary="Доступные алгоритмы")
def api_catalog() -> Dict[str, Any]:
    return {"algorithms": algorithm_catalog()}


@router.get("/datasets", summary="Каталог наборов данных для обучения")
def api_datasets() -> Dict[str, Any]:
    datasets = [_dataset_summary(item) for item in list_datasets()]
    return {"items": datasets, "count": len(datasets)}


@router.get("/datasets/{dataset_id}/profile", summary="Профиль набора данных")
def api_dataset_profile(dataset_id: str) -> Dict[str, Any]:
    try:
        profile = ml_service.profile_dataset(dataset_id)
    except MLTrainingError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return profile


@router.get("/models", summary="Список моделей")
def api_models(service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    models = [_public_model(item) for item in service.list_models()]
    return {"items": models, "count": len(models)}


@router.get("/models/{model_id}", summary="Описание модели")
def api_model_detail(model_id: str, service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    try:
        metadata = service.get_model(model_id)
    except MLTrainingError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _public_model(metadata)


@router.post("/train", summary="Обучить модель")
def api_train(payload: TrainingRequest, service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    config = TrainingConfig(**payload.model_dump())
    try:
        metadata = service.train(config)
    except MLTrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _public_model(metadata)


@router.post("/models/{model_id}/predict", summary="Запуск инференса")
def api_predict(model_id: str, payload: PredictionRequest, service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    try:
        response = service.predict(
            model_id,
            records=payload.records,
            dataset_id=payload.dataset_id,
            file_url=payload.file_url,
            limit=payload.limit,
        )
    except MLTrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return response


@router.get("/insights", summary="Инсайты по ИИ", response_model=None)
def api_insights(service: MLService = Depends(get_ml_service)) -> Dict[str, Any]:
    payload = service.insights()
    highlight = payload.get("highlight")
    if isinstance(highlight, dict):
        payload["highlight"] = _public_model(highlight)
    return payload


def _tracking_repo():
    return get_model_tracking_repository()


def _resolve_user_id(request: Request) -> Optional[str]:
    user = getattr(request.state, "user", None)
    if user and getattr(user, "id", None):
        return str(user.id)
    return request.headers.get("x-user-id")


def _model_runner():
    return get_model_runner()


@router.post("/model-runs", summary="Запустить аналитическую модель")
def api_create_model_run(
    payload: ModelRunRequest,
    request: Request,
    repo=Depends(_tracking_repo),
    runner=Depends(_model_runner),
):
    parameters = dict(payload.parameters or {})
    if payload.file_url:
        input_section = parameters.get("input")
        if not isinstance(input_section, dict):
            input_section = {}
        input_section["file_url"] = payload.file_url
        parameters["input"] = input_section
    run = repo.create_model_run(
        model_type=payload.model_type,
        algorithm=payload.algorithm,
        parameters=parameters,
        dataset_id=payload.dataset_id,
        user_id=_resolve_user_id(request),
        source_ip=request.client.host if request.client else None,
        request_id=getattr(request.state, "request_id", None),
    )
    if not payload.execute:
        return ModelRunSchema.model_validate(run)

    try:
        execution = runner.run(
            run_id=run.id,
            dataset_id=payload.dataset_id,
            file_url=payload.file_url,
            algorithm=payload.algorithm,
            parameters=parameters,
        )
    except ModelExecutionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response = {
        "run": ModelRunSchema.model_validate(execution.run),
        "results": [ModelResultSchema.model_validate(result) for result in execution.results],
    }
    return response


@router.get("/model-runs", summary="Список запусков моделей")
def api_list_model_runs(limit: int = 50, repo=Depends(_tracking_repo)) -> Dict[str, Any]:
    runs = repo.list_model_runs(limit=limit)
    return {"items": [ModelRunSchema.model_validate(run) for run in runs], "count": len(runs)}


@router.get("/model-runs/{run_id}", summary="Статус конкретного запуска", response_model=ModelRunSchema)
def api_get_model_run(run_id: str, repo=Depends(_tracking_repo)):
    run = repo.get_model_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="model_run_not_found")
    return ModelRunSchema.model_validate(run)


@router.get("/model-runs/{run_id}/results", summary="Метрики и результаты запуска")
def api_get_model_results(run_id: str, repo=Depends(_tracking_repo)) -> Dict[str, Any]:
    run = repo.get_model_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="model_run_not_found")
    results = repo.list_model_results(run_id)
    return {
        "run": ModelRunSchema.model_validate(run),
        "results": [ModelResultSchema.model_validate(result) for result in results],
    }


@router.get(
    "/model-runs/{run_id}/alerts",
    summary="Алерты, возникшие во время запуска",
)
def api_get_model_alerts(run_id: str, repo=Depends(_tracking_repo)) -> Dict[str, Any]:
    run = repo.get_model_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="model_run_not_found")
    alerts = repo.list_alerts(run_id=run_id, limit=50)
    return {
        "run": ModelRunSchema.model_validate(run),
        "alerts": [AlertPayload.model_validate(alert) for alert in alerts],
    }
class ModelRunRequest(BaseModel):
    dataset_id: Optional[str] = Field(None, description="Идентификатор зарегистрированного набора")
    file_url: Optional[str] = Field(
        None,
        description="Прямой идентификатор файла (используется, если набор не зарегистрирован)",
    )
    model_type: str = Field(..., description="Тип модели: regression, forecasting, causal и т.д.")
    algorithm: str = Field(..., description="Конкретный алгоритм (OLS, ARIMA, Prophet...)")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Гиперпараметры и настройки")
    execute: bool = Field(True, description="Запустить расчёт сразу после регистрации")

    @model_validator(mode="after")
    def validate_source(self) -> "ModelRunRequest":
        if not self.dataset_id and not self.file_url:
            raise ValueError("Укажите dataset_id или file_url")
        return self
